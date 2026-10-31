export type Tab = 'jobs' | 'quotes' | 'invoices' | 'settings';

const paths: Record<Tab, string> = {
  jobs: 'M4 7h16v12H4zM9 7V5h6v2M4 12h16',
  quotes: 'M7 3h7l4 4v14H7zM14 3v4h4M10 12h5M10 16h5',
  invoices: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6',
  settings:
    'M12 15a3 3 0 100-6 3 3 0 000 6zM19 12a7 7 0 00-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 00-2-1.2L14.2 3h-4.4l-.4 2.7a7 7 0 00-2 1.2l-2.3-1-2 3.4 2 1.5A7 7 0 005 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-1a7 7 0 002 1.2l.4 2.7h4.4l.4-2.7a7 7 0 002-1.2l2.3 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z',
};

const labels: Record<Tab, string> = { jobs: 'Jobs', quotes: 'Quotes', invoices: 'Invoices', settings: 'Settings' };

export default function BottomNav({
  active,
  onGo,
  waiting = 0,
}: {
  active: Tab;
  onGo: (t: Tab) => void;
  /** Accepted quotes waiting to be invoiced. */
  waiting?: number;
}) {
  return (
    <nav
      aria-label="Main"
      className="no-print fixed inset-x-0 bottom-0 z-20 border-t border-lineStrong bg-surface"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="m-0 mx-auto flex max-w-[560px] list-none p-0">
        {(Object.keys(labels) as Tab[]).map((t) => (
          <li key={t} className="flex-1">
            <button
              type="button"
              onClick={() => onGo(t)}
              aria-current={active === t ? 'page' : undefined}
              className={`relative flex w-full flex-col items-center justify-center gap-0.5 text-[0.72rem] font-semibold ${
                active === t ? 'text-accent' : 'text-muted'
              }`}
              style={{ height: 'var(--nav-h)' }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={paths[t]} />
              </svg>
              {labels[t]}
              {t === 'quotes' && waiting > 0 && (
                <span className="absolute right-[calc(50%-26px)] top-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-accent px-1 text-[0.68rem] font-bold text-accentInk">
                  <span className="sr-only">{waiting} accepted, </span>
                  {waiting}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
