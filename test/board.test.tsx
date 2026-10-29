import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { RigConfig } from '../src/config.js';
import { readStatus } from '../src/status.js';

const directories: string[] = [];

function tempRunsDir(files?: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'rig-board-'));
  directories.push(dir);
  if (files) {
    for (const [name, contents] of Object.entries(files)) {
      writeFileSync(join(dir, name), contents);
    }
  }
  return dir;
}

afterEach(() => {
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('status board nights with counts', () => {
  it('shows nights with event counts from readNight', () => {
    const runsDir = tempRunsDir({
      '2026-10-28.jsonl': [
        JSON.stringify({ at: '2026-10-29T01:00:00+01:00', job: 'a', status: 'ok', owner: null }),
        JSON.stringify({ at: '2026-10-29T02:00:00+01:00', job: 'a', status: 'retry', owner: null }),
        JSON.stringify({ at: '2026-10-29T03:00:00+01:00', job: 'a', status: 'fail', owner: null }),
        JSON.stringify({ at: '2026-10-29T04:00:00+01:00', job: 'b', status: 'ok', owner: null }),
      ].join('\n'),
    });
    const config: RigConfig = { adapter: 'test', installed: '', beatEverySeconds: 0, runsDir };
    const status = readStatus(config);
    expect(status.nights).toHaveLength(1);
    expect(status.nights[0]).toEqual({
      night: '2026-10-28',
      counts: { ok: 2, retry: 1, fail: 1 },
    });
  });

  it('includes nights with no valid events (found but empty or all bad lines)', () => {
    const runsDir = tempRunsDir({
      '2026-10-29.jsonl': '',
      '2026-10-28.jsonl': 'invalid',
    });
    const config: RigConfig = { adapter: 'test', installed: '', beatEverySeconds: 0, runsDir };
    const status = readStatus(config);
    expect(status.nights).toHaveLength(2);
    const [newer, older] = status.nights;
    expect(newer.night).toBe('2026-10-29');
    expect(newer.counts).toEqual({ ok: 0, retry: 0, fail: 0 });
    expect(older.night).toBe('2026-10-28');
    expect(older.counts).toEqual({ ok: 0, retry: 0, fail: 0 });
  });

  it('ignores non-matching filenames and sorts newest first', () => {
    const runsDir = tempRunsDir({
      '2026-10-30.jsonl': JSON.stringify({ at: '2026-10-30T01:00:00Z', job: 'x', status: 'ok', owner: null }),
      '2026-10-27.jsonl': JSON.stringify({ at: '2026-10-27T01:00:00Z', job: 'y', status: 'retry', owner: null }),
      'not-a-date.jsonl': 'ignored',
      '2026-10-28': 'ignored (no extension)',
    });
    const config: RigConfig = { adapter: 'test', installed: '', beatEverySeconds: 0, runsDir };
    const status = readStatus(config);
    expect(status.nights.map((n) => n.night)).toEqual(['2026-10-30', '2026-10-27']);
  });

  it('handles empty runs directory', () => {
    const runsDir = tempRunsDir();
    const config: RigConfig = { adapter: 'test', installed: '', beatEverySeconds: 0, runsDir };
    const status = readStatus(config);
    expect(status.nights).toEqual([]);
  });

  it('preserves counts shape with zero values', () => {
    const runsDir = tempRunsDir({
      '2026-10-28.jsonl': JSON.stringify({ at: '2026-10-29T01:00:00+01:00', job: 'a', status: 'ok', owner: null }),
    });
    const config: RigConfig = { adapter: 'test', installed: '', beatEverySeconds: 0, runsDir };
    const status = readStatus(config);
    expect(status.nights[0].counts).toEqual({ ok: 1, retry: 0, fail: 0 });
  });
});
