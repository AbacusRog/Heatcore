import { useCallback, useEffect, useRef, useState } from 'react';
import { mergeJobs } from './merge';
import { supabase, TABLE } from './supabase';
import type { Job } from './types';

export type SyncStatus = 'loading' | 'saved' | 'saving' | 'offline' | 'error';

const keys = (uid: string) => ({
  cache: `jmc.cache.${uid}`,
  dirty: `jmc.dirty.${uid}`,
  deleted: `jmc.deleted.${uid}`,
});

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked: Supabase still holds the saved copy */
  }
}

const toRow = (j: Job) => ({
  id: j.id,
  ref: j.ref,
  data: j,
  created_at: new Date(j.createdAt).toISOString(),
  updated_at: new Date(j.updatedAt).toISOString(),
});

const fromRow = (r: { id: string; data: unknown }): Job => ({ ...(r.data as Job), id: r.id });

function friendly(message: string): string {
  if (/row-level security|permission denied/i.test(message)) {
    return 'This login is not set up as staff, so it cannot save jobs.';
  }
  return message;
}

/**
 * Jobs for one signed-in user. Edits are written to the phone first, then saved to Supabase in the
 * background. If the phone is offline the edits wait and are sent when it reconnects.
 */
export function useJobs(userId: string) {
  const k = keys(userId);
  const [jobs, setJobs] = useState<Job[]>(() => read<Job[]>(k.cache, []));
  const [status, setStatus] = useState<SyncStatus>('loading');
  const [message, setMessage] = useState('');

  const jobsRef = useRef<Job[]>(jobs);
  const dirty = useRef<Set<string>>(new Set(read<string[]>(k.dirty, [])));
  const deleted = useRef<Set<string>>(new Set(read<string[]>(k.deleted, [])));
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pushing = useRef(false);
  const again = useRef(false);

  const persist = useCallback(() => {
    write(k.cache, jobsRef.current);
    write(k.dirty, [...dirty.current]);
    write(k.deleted, [...deleted.current]);
  }, [k.cache, k.dirty, k.deleted]);

  const commit = useCallback(
    (next: Job[]) => {
      jobsRef.current = next;
      setJobs(next);
      persist();
    },
    [persist],
  );

  const push = useCallback(async () => {
    if (!supabase) return;
    if (pushing.current) {
      again.current = true;
      return;
    }
    if (dirty.current.size === 0 && deleted.current.size === 0) {
      setStatus('saved');
      return;
    }
    if (!navigator.onLine) {
      setStatus('offline');
      return;
    }
    pushing.current = true;
    setStatus('saving');
    try {
      if (deleted.current.size) {
        const ids = [...deleted.current];
        const { error } = await supabase.from(TABLE).delete().in('id', ids);
        if (error) throw error;
        ids.forEach((id) => deleted.current.delete(id));
      }
      if (dirty.current.size) {
        const sent = jobsRef.current.filter((j) => dirty.current.has(j.id));
        const stamps = new Map(sent.map((j) => [j.id, j.updatedAt]));
        if (sent.length) {
          const { error } = await supabase.from(TABLE).upsert(sent.map(toRow), { onConflict: 'id' });
          if (error) throw error;
        }
        for (const [id, at] of stamps) {
          const now = jobsRef.current.find((j) => j.id === id);
          if (!now || now.updatedAt === at) dirty.current.delete(id);
        }
        // anything marked dirty that no longer exists locally has nothing to send
        for (const id of [...dirty.current]) {
          if (!jobsRef.current.some((j) => j.id === id)) dirty.current.delete(id);
        }
      }
      persist();
      setMessage('');
      setStatus(dirty.current.size || deleted.current.size ? 'saving' : 'saved');
    } catch (e) {
      const text = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : 'Save failed';
      const network = /fetch|network|offline|failed to load/i.test(text);
      setMessage(network ? '' : friendly(text));
      setStatus(network ? 'offline' : 'error');
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void push(), 15000);
    } finally {
      pushing.current = false;
      if (again.current) {
        again.current = false;
        void push();
      }
    }
  }, [persist]);

  const schedule = useCallback(
    (delay = 800) => {
      clearTimeout(timer.current);
      setStatus('saving');
      timer.current = setTimeout(() => void push(), delay);
    },
    [push],
  );

  const refresh = useCallback(async () => {
    if (!supabase) return;
    if (!navigator.onLine) {
      setStatus('offline');
      return;
    }
    const { data, error } = await supabase.from(TABLE).select('id, data').order('updated_at', { ascending: false });
    if (error) {
      const network = /fetch|network|failed to load/i.test(error.message);
      setMessage(network ? '' : friendly(error.message));
      setStatus(network ? 'offline' : 'error');
      return;
    }
    const merged = mergeJobs(jobsRef.current, (data ?? []).map(fromRow), dirty.current, deleted.current);
    dirty.current = merged.dirty;
    commit(merged.jobs);
    await push();
  }, [commit, push]);

  useEffect(() => {
    void refresh();
    const onOnline = () => void refresh();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
      clearTimeout(timer.current);
    };
  }, [refresh]);

  const addJob = useCallback(
    (job: Job) => {
      dirty.current.add(job.id);
      commit([job, ...jobsRef.current]);
      schedule();
    },
    [commit, schedule],
  );

  const updateJob = useCallback(
    (job: Job) => {
      const stamped = { ...job, updatedAt: Date.now() };
      dirty.current.add(job.id);
      commit(jobsRef.current.map((j) => (j.id === job.id ? stamped : j)));
      schedule();
    },
    [commit, schedule],
  );

  const removeJob = useCallback(
    (id: string) => {
      dirty.current.delete(id);
      deleted.current.add(id);
      commit(jobsRef.current.filter((j) => j.id !== id));
      schedule(200);
    },
    [commit, schedule],
  );

  const restore = useCallback(
    (restored: Job[]) => {
      const byId = new Map(jobsRef.current.map((j) => [j.id, j]));
      for (const r of restored) {
        byId.set(r.id, r);
        dirty.current.add(r.id);
        deleted.current.delete(r.id);
      }
      commit([...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt));
      schedule();
    },
    [commit, schedule],
  );

  return { jobs, status, message, addJob, updateJob, removeJob, restore, refresh };
}
