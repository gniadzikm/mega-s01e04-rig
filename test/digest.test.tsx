import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { RigConfig } from '../src/config.js';

const directories: string[] = [];

function runsDir(files: Record<string, string> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  directories.push(dir);
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), content);
  }
  return dir;
}

afterEach(() => {
  for (const dir of directories.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('digest page', () => {
  const event = {
    at: '2026-10-29T01:00:00+01:00', job: 'a/job', status: 'ok', owner: 'rook',
  };

  it('renders the night digest with all row fields', async () => {
    const dir = runsDir({
      '2026-10-28.jsonl': [
        JSON.stringify({ ...event, job: 'job/one', runs: 1 }),
        JSON.stringify({ ...event, job: 'job/two', status: 'retry', error: 'upstream 503' }),
      ].join('\n'),
    });
    const config: RigConfig = { adapter: 'test', installed: '2026-10-29T00:00:00+01:00', beatEverySeconds: 60, runsDir: dir };
    const res = await createApp(config).request('/digest/2026-10-28');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('digest · 2026-10-28');
    expect(html).toContain('job/one');
    expect(html).toContain('job/two');
    expect(html).toContain('upstream 503');
    expect(html).toContain('2026-10-29T01:00:00+01:00');
    expect(html).toContain('owner');
    expect(html).toContain('rook');
  });

  it('returns 404 for a missing night', async () => {
    const dir = runsDir();
    const config: RigConfig = { adapter: 'test', installed: '2026-10-29T00:00:00+01:00', beatEverySeconds: 60, runsDir: dir };
    const res = await createApp(config).request('/digest/2026-10-28');
    expect(res.status).toBe(404);
  });

  it('shows "nothing ran" for an empty night', async () => {
    const dir = runsDir({ '2026-10-28.jsonl': '' });
    const config: RigConfig = { adapter: 'test', installed: '2026-10-29T00:00:00+01:00', beatEverySeconds: 60, runsDir: dir };
    const res = await createApp(config).request('/digest/2026-10-28');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('nothing ran');
  });

  it('displays the count of invalid lines', async () => {
    const dir = runsDir({
      '2026-10-28.jsonl': [
        JSON.stringify({ ...event, job: 'valid/job' }),
        '{broken',
        '{}',
      ].join('\n'),
    });
    const config: RigConfig = { adapter: 'test', installed: '2026-10-29T00:00:00+01:00', beatEverySeconds: 60, runsDir: dir };
    const res = await createApp(config).request('/digest/2026-10-28');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('2 invalid lines');
  });

  it('marks rows with retries >= 3 with warn styling', async () => {
    const dir = runsDir({
      '2026-10-28.jsonl': [
        JSON.stringify({ ...event, job: 'job/many-retries', status: 'ok' }),
        JSON.stringify({ ...event, job: 'job/many-retries', status: 'retry', error: 'err1' }),
        JSON.stringify({ ...event, job: 'job/many-retries', status: 'retry', error: 'err2' }),
        JSON.stringify({ ...event, job: 'job/many-retries', status: 'retry', error: 'err3' }),
      ].join('\n'),
    });
    const config: RigConfig = { adapter: 'test', installed: '2026-10-29T00:00:00+01:00', beatEverySeconds: 60, runsDir: dir };
    const res = await createApp(config).request('/digest/2026-10-28');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('class="warn"');
    expect(html).toContain('job/many-retries');
  });

  it('marks rows with fail status with warn styling regardless of retry count', async () => {
    const dir = runsDir({
      '2026-10-28.jsonl': [
        JSON.stringify({ ...event, job: 'job/one', status: 'fail' }),
        JSON.stringify({ ...event, job: 'job/two', status: 'retry', error: 'err1' }),
        JSON.stringify({ ...event, job: 'job/two', status: 'retry', error: 'err2' }),
        JSON.stringify({ ...event, job: 'job/two', status: 'retry', error: 'err3' }),
        JSON.stringify({ ...event, job: 'job/two', status: 'fail', error: 'final' }),
      ].join('\n'),
    });
    const config: RigConfig = { adapter: 'test', installed: '2026-10-29T00:00:00+01:00', beatEverySeconds: 60, runsDir: dir };
    const res = await createApp(config).request('/digest/2026-10-28');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('class="warn"');
  });

  it('displays null owner as — and non-null owner as text', async () => {
    const dir = runsDir({
      '2026-10-28.jsonl': [
        JSON.stringify({ at: '2026-10-29T01:00:00+01:00', job: 'job/with-owner', status: 'ok', owner: 'alice' }),
        JSON.stringify({ at: '2026-10-29T01:00:00+01:00', job: 'job/no-owner', status: 'ok', owner: null }),
      ].join('\n'),
    });
    const config: RigConfig = { adapter: 'test', installed: '2026-10-29T00:00:00+01:00', beatEverySeconds: 60, runsDir: dir };
    const res = await createApp(config).request('/digest/2026-10-28');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('alice');
    expect(html).toContain('—');
  });
});
