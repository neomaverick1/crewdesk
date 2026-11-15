import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router';

import { Layout } from './components/Layout.tsx';
import { Toaster } from './components/ui.tsx';
import { DEMO, startDemo } from './lib/api.ts';
import { useSession } from './lib/session.ts';
import { Customers } from './pages/Customers.tsx';
import { Dashboard } from './pages/Dashboard.tsx';
import { Invoices } from './pages/Invoices.tsx';
import { Jobs } from './pages/Jobs.tsx';
import { Login } from './pages/Login.tsx';
import { Schedule } from './pages/Schedule.tsx';
import { Team } from './pages/Team.tsx';

/** In the demo build, the database starts in the browser before anything else. */
function useDemoBoot() {
  const [step, setStep] = useState<string | null>(DEMO ? 'Starting' : null);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    if (!DEMO) return;
    startDemo(setStep).then(
      () => setStep(null),
      (err: Error) => setFailed(err.message),
    );
  }, []);
  return { step, failed };
}

export function App() {
  const { user, can } = useSession();
  const boot = useDemoBoot();

  if (boot.step || boot.failed)
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-900 px-6 text-center text-slate-300">
        <img src="./favicon.svg" alt="" className="size-14" />
        {boot.failed ? (
          <p className="max-w-md text-sm">The demo couldn’t start in this browser: {boot.failed}</p>
        ) : (
          <>
            <p className="flex items-center gap-2 text-sm">
              <Loader2 className="size-4 animate-spin text-orange-400" /> {boot.step}…
            </p>
            <p className="max-w-sm text-xs text-slate-500">
              The live demo runs the real API with a PostgreSQL database inside this tab, so the first visit takes a few seconds.
            </p>
          </>
        )}
      </div>
    );

  return (
    <HashRouter>
      {!user ? (
        <Login />
      ) : (
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="jobs" element={<Jobs />} />
            <Route path="schedule" element={<Schedule />} />
            {can('owner', 'dispatcher') ? (
              <>
                <Route path="customers" element={<Customers />} />
                <Route path="invoices" element={<Invoices />} />
                <Route path="team" element={<Team />} />
              </>
            ) : null}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      )}
      <Toaster />
    </HashRouter>
  );
}
