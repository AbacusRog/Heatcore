import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import JobEditor from './components/JobEditor';
import JobList from './components/JobList';
import Login from './components/Login';
import { blankJob, exampleJob, newId } from './lib/defaults';
import { supabase } from './lib/supabase';
import { useJobs } from './lib/useJobs';

type Route = { name: 'list' } | { name: 'job'; id: string };

function parseHash(): Route {
  const m = window.location.hash.match(/^#\/job\/(.+)$/);
  return m ? { name: 'job', id: decodeURIComponent(m[1]) } : { name: 'list' };
}

export default function App() {
  // undefined while the saved session is being checked
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!supabase) {
    return (
      <main className="mx-auto max-w-[420px] px-4 pt-16">
        <div className="card flex flex-col gap-2">
          <h1 className="m-0 text-[1.1rem] font-bold">Supabase is not set up</h1>
          <p className="hint m-0">
            Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see .env.example), then rebuild.
          </p>
        </div>
      </main>
    );
  }
  if (session === undefined) return <div className="min-h-dvh" aria-busy="true" />;
  if (!session) return <Login />;
  return <Jobs userId={session.user.id} email={session.user.email ?? ''} />;
}

function Jobs({ userId, email }: { userId: string; email: string }) {
  const { jobs, status, message, addJob, updateJob, removeJob, restore } = useJobs(userId);
  const [route, setRoute] = useState<Route>(parseHash);

  useEffect(() => {
    const sync = () => setRoute(parseHash());
    window.addEventListener('popstate', sync);
    window.addEventListener('hashchange', sync);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener('hashchange', sync);
    };
  }, []);

  const routeKey = route.name === 'job' ? route.id : 'list';
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [routeKey]);

  const open = useCallback((id: string) => {
    window.history.pushState({ app: true }, '', `#/job/${encodeURIComponent(id)}`);
    setRoute({ name: 'job', id });
  }, []);

  const toList = useCallback(() => {
    window.history.replaceState(null, '', window.location.pathname);
    setRoute({ name: 'list' });
  }, []);

  const back = useCallback(() => {
    if (window.history.state && (window.history.state as { app?: boolean }).app) window.history.back();
    else toList();
  }, [toList]);

  const job = route.name === 'job' ? jobs.find((j) => j.id === route.id) : undefined;

  if (job) {
    return (
      <JobEditor
        key={job.id}
        job={job}
        status={status}
        onChange={updateJob}
        onBack={back}
        onDuplicate={() => {
          const now = Date.now();
          const copy = {
            ...job,
            id: newId(),
            ref: job.ref.trim() ? `${job.ref.trim()} (copy)` : '',
            extras: job.extras.map((x) => ({ ...x, id: newId() })),
            createdAt: now,
            updatedAt: now,
          };
          addJob(copy);
          open(copy.id);
        }}
        onDelete={() => {
          removeJob(job.id);
          toList();
        }}
      />
    );
  }

  return (
    <JobList
      jobs={jobs}
      status={status}
      message={message}
      email={email}
      onSignOut={() => void supabase?.auth.signOut()}
      onOpen={open}
      onNew={() => {
        const j = blankJob(jobs[0]);
        addJob(j);
        open(j.id);
      }}
      onExample={() => {
        const j = exampleJob();
        addJob(j);
        open(j.id);
      }}
      onRestore={restore}
    />
  );
}
