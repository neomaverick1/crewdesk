import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import type { Session } from '../../../server/types.ts';
import { api, loadSession, saveSession, setUnauthorizedHandler } from '../lib/api.ts';
import { SessionContext, type SessionValue } from '../lib/session.ts';

/** Keeps the signed-in session (token, user, company) and signs out when the API says the token is no good. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(loadSession);
  const client = useQueryClient();

  const signOut = useCallback(() => {
    saveSession(null);
    setSession(null);
    client.clear();
  }, [client]);

  useEffect(() => setUnauthorizedHandler(signOut), [signOut]);

  const value = useMemo<SessionValue>(
    () => ({
      user: session?.user ?? null,
      org: session?.org ?? null,
      signIn: async (email, password) => {
        const s = await api<Session>('POST', '/auth/login', { email, password });
        saveSession(s);
        client.clear();
        setSession(s);
      },
      signOut,
      can: (...roles) => !!session && roles.includes(session.user.role),
    }),
    [session, signOut, client],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
