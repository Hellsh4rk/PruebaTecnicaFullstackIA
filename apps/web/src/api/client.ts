import { useSession, SessionUser } from '../store/session';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

interface RequestOptions extends RequestInit {
  retry?: boolean;
}

let refreshing: Promise<boolean> | null = null;

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const retry = options.retry !== false;
  const headers = new Headers(options.headers);
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const token = useSession.getState().accessToken;
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(path, { ...options, headers });
  const body = (await response.json().catch(() => ({}))) as { message?: string; code?: string };
  if (response.status === 401 && retry && !path.includes('/auth/login') && !path.includes('/auth/refresh')) {
    const renewed = await refreshSession();
    if (renewed) return api<T>(path, { ...options, retry: false });
    useSession.getState().clear();
    throw new ApiError(401, 'Sesión expirada', 'UNAUTHORIZED');
  }
  if (!response.ok) throw new ApiError(response.status, body.message ?? 'No se pudo completar la operación', body.code);
  return body as T;
}

export async function login(email: string, password: string): Promise<{ accessToken: string; refreshToken: string; user: SessionUser }> {
  const body = await api<{ accessToken: string; refreshToken: string; user: SessionUser }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
    retry: false,
  });
  useSession.getState().setSession(body);
  try {
    const profile = await api<SessionUser>('/api/auth/me');
    useSession.getState().setSession({ ...body, user: { ...body.user, ...profile, id: profile.id } });
  } catch {
    return body;
  }
  return { ...body, user: useSession.getState().user ?? body.user };
}

async function refreshSession(): Promise<boolean> {
  if (!refreshing) {
    refreshing = (async () => {
      const refreshToken = useSession.getState().refreshToken;
      if (!refreshToken) return false;
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!response.ok) return false;
      const body = (await response.json()) as { accessToken: string; refreshToken: string; user: SessionUser };
      const current = useSession.getState().user;
      useSession.getState().setSession({ ...body, user: { ...body.user, fullName: current?.fullName ?? body.user.fullName } });
      return true;
    })().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}
