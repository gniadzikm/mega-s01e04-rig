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

function extractTableRows(html: string): Array<{cells: string[]}> {
  const tbodyMatch = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/);
  if (!tbodyMatch) return [];

  const tbody = tbodyMatch[1];
  const trMatches = tbody.match(/<tr[^>]*>([\s\S]*?)<\/tr>/g) || [];

  return trMatches.map((tr) => {
    const cellMatches = tr.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g) || [];
    return {
      cells: cellMatches.map((cell) => {
        return cell.replace(/<[^>]+>/g, '').trim();
      }),
    };
  });
}

function getRowClasses(html: string, rowIndex: number): string {
  const tbodyMatch = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/);
  if (!tbodyMatch) return '';

  const tbody = tbodyMatch[1];
  const trMatches = tbody.match(/<tr[^>]*>/g) || [];
  if (rowIndex >= trMatches.length) return '';

  const trTag = trMatches[rowIndex];
  const classMatch = trTag.match(/class="([^"]*)"/);
  return classMatch ? classMatch[1] : '';
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
    expect(html).toContain('1 invalid line');
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

  it('displays null-owner as em-dash in HTML table owner cell', async () => {
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

    const rows = extractTableRows(html);
    expect(rows.length).toBeGreaterThan(0);
    const firstRow = rows[0];
    expect(firstRow.cells.length).toBeGreaterThan(1);
    expect(firstRow.cells[1]).toBe('—');
  });

  it('displays non-null owner in HTML table owner cell', async () => {
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

    const rows = extractTableRows(html);
    expect(rows.length).toBeGreaterThan(0);
    const firstRow = rows[0];
    expect(firstRow.cells.length).toBeGreaterThan(1);
    expect(firstRow.cells[1]).toBe('rook');
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

  it('marks rows with retries >= 3 and ok status with warning class', async () => {
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

    const rowClasses = getRowClasses(html, 0);
    expect(rowClasses).toMatch(/warn/);
  });

  it('does not mark ok rows with <3 retries with warning class', async () => {
    const night = '2026-10-29';
    const events = [
      { at: '2026-10-29T01:00:00+01:00', job: 'task/a', status: 'retry', owner: 'rook' },
      { at: '2026-10-29T01:05:00+01:00', job: 'task/a', status: 'ok', owner: 'rook' },
    ];
    writeFileSync(
      join(testDir, `${night}.jsonl`),
      events.map((e) => JSON.stringify(e)).join('\n'),
    );

    const res = await createApp(getConfig()).request(`/digest/${night}`);
    const html = await res.text();
    expect(res.status).toBe(200);

    const rowClasses = getRowClasses(html, 0);
    expect(rowClasses).not.toMatch(/warn/);
  });

  it('marks failed rows with warning class regardless of retries', async () => {
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

    const rowClasses = getRowClasses(html, 0);
    expect(rowClasses).toMatch(/warn/);

    expect(html).toContain('timeout');
  });

  it('keeps recovered failures marked and their diagnostic error visible in HTML and JSON', async () => {
    const night = '2026-10-29';
    const events = [
      { at: '2026-10-29T01:00:00+01:00', job: 'task/a', status: 'fail', owner: 'rook', error: 'disk quota exceeded' },
      { at: '2026-10-29T02:00:00+01:00', job: 'task/a', status: 'ok', owner: 'rook' },
    ];
    writeFileSync(
      join(testDir, `${night}.jsonl`),
      events.map((e) => JSON.stringify(e)).join('\n'),
    );

    const res = await createApp(getConfig()).request(`/digest/${night}`);
    const html = await res.text();
    expect(res.status).toBe(200);

    expect(getRowClasses(html, 0)).toMatch(/warn/);
    const cells = extractTableRows(html)[0].cells;
    expect(cells[4]).toBe('ok');
    expect(cells[5]).toBe('disk quota exceeded');

    const jsonRes = await createApp(getConfig()).request(`/api/digest/${night}`);
    expect(jsonRes.status).toBe(200);
    const rows = await jsonRes.json() as DigestRow[];
    expect(rows[0]).toMatchObject({
      lastStatus: 'ok', lastError: 'disk quota exceeded', hasFailure: true, retries: 0,
    });
  });

  it('returns jobs in strict alphabetical order on page extracted from table', async () => {
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

    const rows = extractTableRows(pageHtml);
    expect(rows.length).toBe(3);
    const pageJobs = rows.map((row) => row.cells[0]);

    expect(pageJobs).toEqual(['a/job', 'm/job', 'z/job']);
  });

  it('returns jobs in same strict alphabetical order in JSON as table', async () => {
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

    const rows = extractTableRows(pageHtml);
    const pageJobs = rows.map((row) => row.cells[0]);

    const jsonJobs = jsonData.map((row) => row.job);

    expect(pageJobs).toEqual(jsonJobs);
    expect(jsonJobs).toEqual(['a/job', 'm/job', 'z/job']);
  });

  it('includes exact input timestamp string with offset in HTML', async () => {
    const night = '2026-10-29';
    const inputTimestamp = '2026-10-29T01:00:00+01:00';
    const events = [
      { at: inputTimestamp, job: 'task/a', status: 'ok', owner: 'rook' },
    ];
    writeFileSync(
      join(testDir, `${night}.jsonl`),
      events.map((e) => JSON.stringify(e)).join('\n'),
    );

    const res = await createApp(getConfig()).request(`/digest/${night}`);
    const html = await res.text();
    expect(res.status).toBe(200);

    expect(html).toContain(inputTimestamp);
  });

  it('preserves different timezone offsets in HTML timestamps', async () => {
    const night = '2026-10-29';
    const ts1 = '2026-10-29T01:00:00+01:00';
    const ts2 = '2026-10-29T02:00:00Z';
    const events = [
      { at: ts1, job: 'task/a', status: 'ok', owner: 'rook' },
      { at: ts2, job: 'task/b', status: 'ok', owner: 'rook' },
    ];
    writeFileSync(
      join(testDir, `${night}.jsonl`),
      events.map((e) => JSON.stringify(e)).join('\n'),
    );

    const res = await createApp(getConfig()).request(`/digest/${night}`);
    const html = await res.text();
    expect(res.status).toBe(200);

    expect(html).toContain(ts1);
    expect(html).toContain(ts2);
  });
});
