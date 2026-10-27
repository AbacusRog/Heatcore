import { describe, expect, it } from 'vitest';
import { exampleJob } from './defaults';
import { mergeJobs } from './merge';
import type { Job } from './types';

const job = (id: string, updatedAt: number, ref = id): Job => ({ ...exampleJob(), id, ref, updatedAt });

describe('mergeJobs', () => {
  it('adds jobs that only exist remotely', () => {
    const r = mergeJobs([], [job('a', 1)], new Set(), new Set());
    expect(r.jobs.map((j) => j.id)).toEqual(['a']);
  });

  it('keeps unsaved local edits over the remote copy', () => {
    const r = mergeJobs([job('a', 5, 'local')], [job('a', 9, 'remote')], new Set(['a']), new Set());
    expect(r.jobs[0].ref).toBe('local');
  });

  it('keeps a local copy that is newer and marks it to be saved', () => {
    const r = mergeJobs([job('a', 9, 'local')], [job('a', 5, 'remote')], new Set(), new Set());
    expect(r.jobs[0].ref).toBe('local');
    expect(r.dirty.has('a')).toBe(true);
  });

  it('takes the remote copy when it is newer and nothing is unsaved', () => {
    const r = mergeJobs([job('a', 5, 'local')], [job('a', 9, 'remote')], new Set(), new Set());
    expect(r.jobs[0].ref).toBe('remote');
  });

  it('hides jobs deleted here but not yet removed remotely', () => {
    const r = mergeJobs([], [job('a', 1)], new Set(), new Set(['a']));
    expect(r.jobs).toHaveLength(0);
  });

  it('drops clean local jobs that were deleted elsewhere, but keeps unsaved new ones', () => {
    const r = mergeJobs([job('old', 1), job('new', 2)], [], new Set(['new']), new Set());
    expect(r.jobs.map((j) => j.id)).toEqual(['new']);
  });
});
