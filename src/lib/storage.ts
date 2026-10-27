import type { Job } from './types';

export function isJob(x: unknown): x is Job {
  if (typeof x !== 'object' || x === null) return false;
  const o = x as Record<string, unknown>;
  return typeof o.id === 'string' && typeof o.matCost === 'string' && Array.isArray(o.extras);
}

export function downloadBackup(jobs: Job[]): void {
  const blob = new Blob([JSON.stringify(jobs, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `job-margin-backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Read a backup file and return the valid jobs in it. Throws if none are found. */
export function parseBackup(text: string): Job[] {
  const data: unknown = JSON.parse(text);
  if (!Array.isArray(data)) throw new Error('Not a backup file');
  const jobs = data.filter(isJob);
  if (!jobs.length) throw new Error('No jobs found in that file');
  return jobs;
}
