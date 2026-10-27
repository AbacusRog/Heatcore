import type { Job } from './types';

/**
 * Combine the jobs held on this phone with the jobs fetched from Supabase.
 *
 * - `dirty` ids are edits not yet saved to Supabase, so the local copy wins.
 * - `deleted` ids were deleted here and not yet removed remotely, so they stay hidden.
 * - A local copy that is newer than the remote one is kept and marked dirty.
 * - A clean local job that no longer exists remotely was deleted elsewhere, so it is dropped.
 */
export function mergeJobs(
  local: Job[],
  remote: Job[],
  dirty: Set<string>,
  deleted: Set<string>,
): { jobs: Job[]; dirty: Set<string> } {
  const nextDirty = new Set(dirty);
  const localById = new Map(local.map((j) => [j.id, j]));
  const remoteIds = new Set(remote.map((j) => j.id));
  const jobs: Job[] = [];

  for (const r of remote) {
    if (deleted.has(r.id)) continue;
    const l = localById.get(r.id);
    if (l && dirty.has(r.id)) {
      jobs.push(l);
    } else if (l && l.updatedAt > r.updatedAt) {
      jobs.push(l);
      nextDirty.add(r.id);
    } else {
      jobs.push(r);
    }
  }

  for (const l of local) {
    if (!remoteIds.has(l.id) && dirty.has(l.id) && !deleted.has(l.id)) jobs.push(l);
  }

  jobs.sort((a, b) => b.updatedAt - a.updatedAt);
  return { jobs, dirty: nextDirty };
}
