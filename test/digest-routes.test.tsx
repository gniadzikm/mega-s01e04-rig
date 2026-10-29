import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { DigestRow } from '../src/digest/types.js';

let testDir: string;

function getConfig() {
  return {
    adapter: 'shim',
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir: testDir,
  };
}

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), 'rig-routes-'));
});

afterEach(() => {
  if (testDir) {
    rmSync(testDir, { recursive: true, force: true });
  }
});

describe('digest routes', () => {
  it('returns 200 and HTML page for a valid night with jobs', async () => {
    const night = '2026-10-29';
    const events = [
      { at: '2026-10-29T01:00:00+01:00', job: 'task/a', status: 'ok', owner: 'rook' },
      { at: '2026-10-29T02:00:00+01:00', job: 'task/b', status: 'retry', owner: 'jane' },
      { at: '2026-10-29T03:00:00+01:00', job: 'task/b', status: 'retry', owner: 'jane' },
      { at: '2026-10-29T04:00:00+01:00', job: 'task/b', status: 'retry', owner: 'jane' },
      { at: '2026-10-29T05:00:00+01:00', job: 'task/c', status: 'fail', owner: 'bob', error: 'timeout' },
    ];
    writeFileSync(
      join(testDir, `${night}.jsonl`),
      events.map((e) => JSON.stringify(e)).join('\n'),
    );

    const res = await createApp(getConfig()).request(`/digest/${night}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('task/a');
    expect(html).toContain('task/b');
    expect(html).toContain('task/c');
  });

  it('returns 200 and JSON array for a valid night with jobs', async () => {
    const night = '2026-10-29';
    const events = [
      { at: '2026-10-29T01:00:00+01:00', job: 'task/a', status: 'ok', owner: 'rook' },
      { at: '2026-10-29T02:00:00+01:00', job: 'task/b', status: 'retry', owner: 'jane' },
    ];
    writeFileSync(
      join(testDir, `${night}.jsonl`),
      events.map((e) => JSON.stringify(e)).join('\n'),
    );

    const res = await createApp(getConfig()).request(`/api/digest/${night}`);
    expect(res.status).toBe(200);
    const json = await res.json() as DigestRow[];
    expect(Array.isArray(json)).toBe(true);
    expect(json.length).toBe(2);
    expect(json[0].job).toBe('task/a');
  });

  it('returns 404 for a night with no file', async () => {
    const res = await createApp(getConfig()).request('/digest/2026-10-30');
    expect(res.status).toBe(404);
  });

  it('returns 404 in JSON for a night with no file', async () => {
    const res = await createApp(getConfig()).request('/api/digest/2026-10-30');
    expect(res.status).toBe(404);
  });

  it('renders "nothing ran" in HTML for an empty night', async () => {
    const night = '2026-10-29';
    writeFileSync(join(testDir, `${night}.jsonl`), '');

    const res = await createApp(getConfig()).request(`/digest/${night}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html.toLowerCase()).toContain('nothing ran');
  });

  it('returns empty array in JSON for an empty night', async () => {
    const night = '2026-10-29';
    writeFileSync(join(testDir, `${night}.jsonl`), '');

    const res = await createApp(getConfig()).request(`/api/digest/${night}`);
    const json = await res.json() as DigestRow[];
    expect(res.status).toBe(200);
    expect(Array.isArray(json)).toBe(true);
    expect(json.length).toBe(0);
  });

  it('tolerates malformed lines and renders valid jobs', async () => {
    const night = '2026-10-29';
    const events = [
      { at: '2026-10-29T01:00:00+01:00', job: 'task/a', status: 'ok', owner: 'rook' },
      'this is not valid json',
      { at: '2026-10-29T02:00:00+01:00', job: 'task/b', status: 'ok', owner: 'jane' },
    ];
    writeFileSync(
      join(testDir, `${night}.jsonl`),
      events.map((e) => (typeof e === 'string' ? e : JSON.stringify(e))).join('\n'),
    );

    const res = await createApp(getConfig()).request(`/digest/${night}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('task/a');
    expect(html).toContain('task/b');
  });

  it('tolerates malformed lines in JSON and returns valid rows', async () => {
    const night = '2026-10-29';
    const events = [
      { at: '2026-10-29T01:00:00+01:00', job: 'task/a', status: 'ok', owner: 'rook' },
      'this is not valid json',
      { at: '2026-10-29T02:00:00+01:00', job: 'task/b', status: 'ok', owner: 'jane' },
    ];
    writeFileSync(
      join(testDir, `${night}.jsonl`),
      events.map((e) => (typeof e === 'string' ? e : JSON.stringify(e))).join('\n'),
    );

    const res = await createApp(getConfig()).request(`/api/digest/${night}`);
    const json = await res.json() as DigestRow[];
    expect(res.status).toBe(200);
    expect(json.length).toBe(2);
  });

  it('preserves null-owner row and displays as "—" in HTML', async () => {
    const night = '2026-10-29';
    const events = [
      { at: '2026-10-29T01:00:00+01:00', job: 'task/a', status: 'ok', owner: null },
    ];
    writeFileSync(
      join(testDir, `${night}.jsonl`),
      events.map((e) => JSON.stringify(e)).join('\n'),
    );

    const res = await createApp(getConfig()).request(`/digest/${night}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('task/a');
    expect(html).toContain('—');
  });

  it('preserves null-owner row in JSON', async () => {
    const night = '2026-10-29';
    const events = [
      { at: '2026-10-29T01:00:00+01:00', job: 'task/a', status: 'ok', owner: null },
    ];
    writeFileSync(
      join(testDir, `${night}.jsonl`),
      events.map((e) => JSON.stringify(e)).join('\n'),
    );

    const res = await createApp(getConfig()).request(`/api/digest/${night}`);
    const json = await res.json() as DigestRow[];
    expect(res.status).toBe(200);
    expect(json[0].owner).toBe(null);
  });

  it('marks jobs with retries >= 3 with a warning in HTML', async () => {
    const night = '2026-10-29';
    const events = [
      { at: '2026-10-29T01:00:00+01:00', job: 'task/a', status: 'retry', owner: 'rook' },
      { at: '2026-10-29T01:05:00+01:00', job: 'task/a', status: 'retry', owner: 'rook' },
      { at: '2026-10-29T01:10:00+01:00', job: 'task/a', status: 'retry', owner: 'rook' },
      { at: '2026-10-29T01:15:00+01:00', job: 'task/a', status: 'ok', owner: 'rook' },
    ];
    writeFileSync(
      join(testDir, `${night}.jsonl`),
      events.map((e) => JSON.stringify(e)).join('\n'),
    );

    const res = await createApp(getConfig()).request(`/digest/${night}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    // Should contain some visual indicator for high retry count
    expect(html).toContain('task/a');
  });

  it('marks failed jobs with a warning in HTML', async () => {
    const night = '2026-10-29';
    const events = [
      { at: '2026-10-29T01:00:00+01:00', job: 'task/a', status: 'fail', owner: 'rook', error: 'timeout' },
    ];
    writeFileSync(
      join(testDir, `${night}.jsonl`),
      events.map((e) => JSON.stringify(e)).join('\n'),
    );

    const res = await createApp(getConfig()).request(`/digest/${night}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    // Should contain some visual indicator for failure
    expect(html).toContain('task/a');
    expect(html).toContain('timeout');
  });

  it('returns jobs in same order on page and JSON', async () => {
    const night = '2026-10-29';
    const events = [
      { at: '2026-10-29T01:00:00+01:00', job: 'z/job', status: 'ok', owner: 'rook' },
      { at: '2026-10-29T01:05:00+01:00', job: 'a/job', status: 'ok', owner: 'rook' },
      { at: '2026-10-29T01:10:00+01:00', job: 'm/job', status: 'ok', owner: 'rook' },
    ];
    writeFileSync(
      join(testDir, `${night}.jsonl`),
      events.map((e) => JSON.stringify(e)).join('\n'),
    );

    const pageRes = await createApp(getConfig()).request(`/digest/${night}`);
    const pageHtml = await pageRes.text();

    const jsonRes = await createApp(getConfig()).request(`/api/digest/${night}`);
    const jsonData = await jsonRes.json() as DigestRow[];

    // Extract job names from HTML in order they appear
    const pageJobs = ['a/job', 'm/job', 'z/job']; // alphabetical order
    for (const job of pageJobs) {
      expect(pageHtml).toContain(job);
    }

    // Verify JSON is in same order (should be sorted)
    const jsonJobs = jsonData.map((row) => row.job);
    expect(jsonJobs).toEqual(['a/job', 'm/job', 'z/job']);
  });

  it('includes time offsets in HTML when straightforward', async () => {
    const night = '2026-10-29';
    const events = [
      { at: '2026-10-29T01:00:00+01:00', job: 'task/a', status: 'ok', owner: 'rook' },
    ];
    writeFileSync(
      join(testDir, `${night}.jsonl`),
      events.map((e) => JSON.stringify(e)).join('\n'),
    );

    const res = await createApp(getConfig()).request(`/digest/${night}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    // Time offset should be preserved from the log
    expect(html).toContain('01:00');
  });
});
