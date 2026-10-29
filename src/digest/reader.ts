import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, ReadNight, RunStatus } from './types.js';

type RunEvent = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

export const readNight: ReadNight = (runsDir, night) => {
  const result: ReturnType<ReadNight> = {
    night, found: false, rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 },
  };
  // Match nightsOnDisk's filenames, without allowing separators or traversal.
  if (night.length !== 10 || !/^\d{4}-\d{2}-\d{2}$/.test(night)) return result;

  let contents: string;
  try {
    contents = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return result;
    throw error;
  }
  result.found = true;

  const rows = new Map<string, DigestRow>();
  for (const line of contents.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const event = parseEvent(line);
    if (!event) {
      result.badLines++;
      continue;
    }
    result.counts[event.status]++;
    const row = rows.get(event.job);
    if (!row) {
      rows.set(event.job, {
        job: event.job,
        owner: event.owner,
        runs: 1,
        retries: event.status === 'retry' ? 1 : 0,
        lastStatus: event.status,
        lastError: event.error ?? null,
        firstAt: event.at,
        lastAt: event.at,
      });
      continue;
    }
    row.runs++;
    if (event.status === 'retry') row.retries++;
    const at = Date.parse(event.at);
    if (at < Date.parse(row.firstAt)) row.firstAt = event.at;
    if (at >= Date.parse(row.lastAt)) {
      row.lastAt = event.at;
      row.owner = event.owner;
      row.lastStatus = event.status;
      row.lastError = event.error ?? null;
    }
  }
  result.rows = [...rows.values()].sort((a, b) => a.job < b.job ? -1 : a.job > b.job ? 1 : 0);
  return result;
};

function parseEvent(line: string): RunEvent | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  if (!('at' in value) || typeof value.at !== 'string' || !validTimestamp(value.at)) return null;
  if (!('job' in value) || typeof value.job !== 'string' || !value.job.trim()) return null;
  if (!('status' in value) ||
      (value.status !== 'ok' && value.status !== 'retry' && value.status !== 'fail')) return null;
  if (!('owner' in value) || (value.owner !== null && typeof value.owner !== 'string')) return null;
  if ('error' in value && typeof value.error !== 'string') return null;
  return value as RunEvent;
}

function validTimestamp(at: string): boolean {
  // Require an explicit offset (or Z), and reject dates Date.parse would normalize.
  if (at.trim() !== at ||
      !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(at)) {
    return false;
  }
  if (!Number.isFinite(Date.parse(at))) return false;
  const day = new Date(`${at.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(day.getTime()) && day.toISOString().slice(0, 10) === at.slice(0, 10);
}
