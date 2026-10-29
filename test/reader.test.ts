import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/types.js';
import type { DigestResult, ReadNight } from '../src/digest/types.js';

const night = '2026-10-28';
const directories: string[] = [];
const event = {
  at: '2026-10-29T01:00:00+01:00', job: 'a/job', status: 'ok', owner: 'rook',
};

function runsDir(contents?: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'rig-reader-'));
  directories.push(dir);
  if (contents !== undefined) writeFileSync(join(dir, `${night}.jsonl`), contents);
  return dir;
}

afterEach(() => {
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('readNight', () => {
  it('reads the unchanged fixture into five sorted jobs and counts every valid status', () => {
    const fixture = new URL('../runs/2026-10-28.jsonl', import.meta.url);
    const before = readFileSync(fixture);
    const reader: ReadNight = readNight;
    const result: DigestResult = reader(new URL('../runs/', import.meta.url).pathname, night);
    expect(result).toEqual({
      night, found: true, badLines: 1, counts: { ok: 10, retry: 4, fail: 1 },
      rows: [
        {
          job: 'digest/render', owner: null, runs: 1, retries: 0,
          lastStatus: 'ok', lastError: null,
          firstAt: '2026-10-29T05:41:09+01:00', lastAt: '2026-10-29T05:41:09+01:00',
        },
        {
          job: 'fixtures/refresh', owner: 'rook', runs: 4, retries: 3,
          lastStatus: 'ok', lastError: null,
          firstAt: '2026-10-29T01:30:00+01:00', lastAt: '2026-10-29T01:37:00+01:00',
        },
        {
          job: 'lane/sync', owner: 'rook', runs: 8, retries: 1,
          lastStatus: 'ok', lastError: null,
          firstAt: '2026-10-28T23:00:06+01:00', lastAt: '2026-10-29T05:00:04+01:00',
        },
        {
          job: 'notes/backup', owner: 'lane-07', runs: 1, retries: 0,
          lastStatus: 'fail', lastError: 'quota exceeded',
          firstAt: '2026-10-29T04:00:01+01:00', lastAt: '2026-10-29T04:00:01+01:00',
        },
        {
          job: 'rig/rotate-logs', owner: 'lane-07', runs: 1, retries: 0,
          lastStatus: 'ok', lastError: null,
          firstAt: '2026-10-28T23:00:02+01:00', lastAt: '2026-10-28T23:00:02+01:00',
        },
      ],
    });
    expect(readFileSync(fixture)).toEqual(before);
  });

  it('distinguishes empty and whitespace-only files from missing files/directories', () => {
    const empty = { night, found: true, rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 } };
    expect(readNight(runsDir(''), night)).toEqual(empty);
    expect(readNight(runsDir(' \r\n\t\n'), night)).toEqual(empty);
    expect(readNight(runsDir(), night)).toEqual({ ...empty, found: false });
    expect(readNight(join(runsDir(), 'absent'), night)).toEqual({ ...empty, found: false });
  });

  it('counts malformed JSON and invalid schemas without losing valid surrounding events', () => {
    const invalid = [
      '{broken', 'null', '[]', '42', '"string"', '{}',
      ...[
        { at: 'not a date' }, { at: '2026-10-29T01:00:00' },
        { at: '2026-02-30T01:00:00+01:00' }, { at: '2026-10-29T25:00:00Z' },
        { at: null }, { job: '' }, { job: ' ' }, { job: 2 },
        { status: 'pending' }, { status: ['ok'] }, { status: null },
        { owner: 2 }, { error: null }, { error: {} },
      ].map((patch) => JSON.stringify({ ...event, ...patch })),
      ...['at', 'job', 'status', 'owner'].map((key) =>
        JSON.stringify(Object.fromEntries(Object.entries(event).filter(([field]) => field !== key)))),
    ];
    const contents = [
      JSON.stringify({ ...event, status: 'retry', error: 'temporary' }),
      ...invalid, '', '  ',
      JSON.stringify({ ...event, status: 'fail', error: 'still broken', extra: true }),
    ].join('\r\n');
    const result = readNight(runsDir(contents), night);
    expect(result.badLines).toBe(invalid.length);
    expect(result.counts).toEqual({ ok: 0, retry: 1, fail: 1 });
    expect(result.rows).toEqual([{
      job: event.job, owner: 'rook', runs: 2, retries: 1, lastStatus: 'fail',
      lastError: 'still broken', firstAt: event.at, lastAt: event.at,
    }]);
  });

  it('orders by actual instants, preserves offsets, and uses later lines to break ties', () => {
    const events = [
      { ...event, at: '2026-10-29T01:30:00+01:00', status: 'fail', error: 'old' },
      { ...event, at: '2026-10-29T02:00:00+02:00', status: 'retry' },
      { ...event, at: '2026-10-29T00:30:00Z', owner: null },
      { ...event, at: '2026-10-29T02:00:00+02:00', owner: 'older', status: 'retry' },
    ];
    const result = readNight(runsDir(events.map((item) => JSON.stringify(item)).join('\n')), night);
    expect(result.rows).toEqual([{
      job: event.job, owner: null, runs: 4, retries: 2, lastStatus: 'ok', lastError: null,
      firstAt: '2026-10-29T02:00:00+02:00', lastAt: '2026-10-29T00:30:00Z',
    }]);
    expect(result.counts).toEqual({ ok: 1, retry: 2, fail: 1 });
  });

  it('handles prototype-like job names and sorts by code units', () => {
    const jobs = ['toString', 'a', '__proto__', 'Z'];
    const result = readNight(runsDir(jobs.map((job) => JSON.stringify({ ...event, job })).join('\n')), night);
    expect(result.rows.map((row) => row.job)).toEqual(['Z', '__proto__', 'a', 'toString']);
  });

  it('reports invalid-only files as found', () => {
    expect(readNight(runsDir('oops\n{}\n'), night)).toEqual({
      night, found: true, rows: [], badLines: 2, counts: { ok: 0, retry: 0, fail: 0 },
    });
  });

  it.each(['../2026-10-28', '/2026-10-28', '2026-10-28/../2026-10-28',
    '..\\2026-10-28', '2026-10-28.jsonl', '2026-10-28\n', '2026-1-1', '', '\0'])(
    'rejects unsafe or unsupported night names: %j',
    (invalidNight) => {
      const dir = runsDir(JSON.stringify(event));
      mkdirSync(join(dir, 'nested'));
      expect(readNight(join(dir, 'nested'), invalidNight)).toEqual({
        night: invalidNight, found: false, rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 },
      });
    },
  );

  it('does not disguise other filesystem errors as missing nights', () => {
    const dir = runsDir();
    mkdirSync(join(dir, `${night}.jsonl`));
    expect(() => readNight(dir, night)).toThrow();
  });
});
