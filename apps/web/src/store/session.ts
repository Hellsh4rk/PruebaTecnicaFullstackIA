import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export interface SessionUser {
  id: string;
  email: string;
  fullName?: string;
  roles: string[];
  permissions: string[];
}

interface SessionState {
  accessToken: string | null;
  refreshToken: string | null;
  user: SessionUser | null;
  setSession: (session: { accessToken: string; refreshToken: string; user: SessionUser }) => void;
  clear: () => void;
  can: (permission: string) => boolean;
}

export const useSession = create<SessionState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      setSession: (session) => set(session),
      clear: () => set({ accessToken: null, refreshToken: null, user: null }),
      can: (permission) => Boolean(get().user?.permissions.includes(permission)),
    }),
    {
      name: 'toka-session',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({ accessToken: state.accessToken, refreshToken: state.refreshToken, user: state.user }),
    },
  ),
);
