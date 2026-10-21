import { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useSession } from '../store/session';
import { useUi } from '../store/ui';
import { TokaMark } from './Brand';

const LINKS = [
  { to: '/usuarios', label: 'Usuarios', permission: 'users:read' },
  { to: '/roles', label: 'Roles', permission: 'roles:read' },
  { to: '/auditoria', label: 'Auditoría', permission: 'audit:read' },
  { to: '/asistente', label: 'Asistente', permission: 'ai:query' },
];

export function Shell({ children }: { children: ReactNode }) {
  const user = useSession((state) => state.user);
  const can = useSession((state) => state.can);
  const clear = useSession((state) => state.clear);
  const push = useUi((state) => state.push);
  const navigate = useNavigate();
  const links = LINKS.filter((link) => can(link.permission));

  async function logout() {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } catch {
      push('La sesión local se cerró. La revocación remota no confirmó.', 'info');
    }
    clear();
    navigate('/login');
  }

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-40 border-b border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-[78px] max-w-6xl items-center gap-6 px-4 md:px-6">
          <TokaMark />
          <nav className="hidden flex-1 items-center gap-1 md:flex">
            {links.map((link) => (
              <NavLink key={link.to} to={link.to} className={navClass}>
                {link.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto hidden text-right md:block">
            <p className="text-sm font-semibold text-ink">{user?.email}</p>
            <p className="text-xs text-ink/55">{user?.roles.join(', ') || 'Sin rol'}</p>
          </div>
          <button onClick={() => void logout()} className="btn-navy ml-auto md:ml-0">
            Cerrar sesión
          </button>
        </div>
        <nav className="flex gap-1 overflow-auto px-4 pb-3 md:hidden">
          {links.map((link) => (
            <NavLink key={link.to} to={link.to} className={navClass}>
              {link.label}
            </NavLink>
          ))}
        </nav>
      </header>
      {children}
    </div>
  );
}

function navClass({ isActive }: { isActive: boolean }) {
  return `whitespace-nowrap rounded-full px-3 py-2 text-sm ${isActive ? 'bg-mist font-semibold text-ink' : 'font-medium text-ink/70 hover:bg-mist hover:text-ink'}`;
}
