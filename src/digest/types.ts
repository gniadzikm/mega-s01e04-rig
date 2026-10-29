export type RunStatus = 'ok' | 'retry' | 'fail';

export type DigestRow = {
  job: string;
  // Owner and status come from the latest event.
  owner: string | null;
  runs: number;
  retries: number;
  // Includes failures followed by successful recovery.
  hasFailure: boolean;
  lastStatus: RunStatus;
  // Latest diagnostic error by event time; recovery does not clear it.
  lastError: string | null;
  // Chronological endpoints, retaining the log's original timestamp strings and offsets.
  // For equal instants, the later line supplies the latest event.
  firstAt: string;
  lastAt: string;
};

export type DigestResult = {
  night: string;
  // False for a missing file or a night outside YYYY-MM-DD; empty files are found.
  found: boolean;
  rows: DigestRow[];
  badLines: number;
  // Counts of valid log entries, not jobs' final statuses. Their sum equals total runs.
  counts: Record<RunStatus, number>;
};

// Synchronous, matching the status reader. Rows are sorted by job (code-unit order).
// Nonblank invalid JSON/schema lines are counted and skipped; blank lines are ignored.
// Missing/invalid nights return no rows and zero counts. Other filesystem errors propagate.
export type ReadNight = (runsDir: string, night: string) => DigestResult;

export { readNight } from './reader.js';
