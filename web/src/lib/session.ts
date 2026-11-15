import { createContext, useContext } from 'react';

import type { Org, Role, User } from '../../../server/types.ts';

export interface SessionValue {
  user: User | null;
  org: Org | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => void;
  can: (...roles: Role[]) => boolean;
}

export const SessionContext = createContext<SessionValue | null>(null);

export function useSession(): SessionValue {
  const v = useContext(SessionContext);
  if (!v) throw new Error('useSession needs <SessionProvider>');
  return v;
}

/** The signed-in user and company. Only used inside the signed-in part of the app. */
export function useAuthed() {
  const s = useSession();
  return { ...s, user: s.user!, org: s.org! };
}
