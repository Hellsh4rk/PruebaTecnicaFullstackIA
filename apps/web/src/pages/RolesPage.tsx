import { FormEvent, useEffect, useState } from 'react';
import { ApiError, api } from '../api/client';
import { PageFrame, PageHero } from '../components/Brand';
import { EmptyState, SkeletonRows } from '../components/States';
import { useSession } from '../store/session';
import { useUi } from '../store/ui';

interface RoleOption {
  id: string;
  name: string;
  description: string;
  permissions: string[];
}
interface UserRow {
  id: string;
  fullName: string;
  email: string;
  roles?: string[];
}

export function RolesPage() {
  const can = useSession((state) => state.can);
  const push = useUi((state) => state.push);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [userId, setUserId] = useState('');
  const [roleId, setRoleId] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [rolePage, userPage] = await Promise.all([
        api<RoleOption[]>('/api/roles'),
        api<{ data: UserRow[] }>('/api/users'),
      ]);
      setRoles(rolePage);
      setUsers(userPage.data);
    } catch (error) {
      push(error instanceof ApiError ? error.message : 'No se pudo cargar RBAC', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function assign(event: FormEvent) {
    event.preventDefault();
    try {
      await api('/api/roles/assignments', { method: 'POST', body: JSON.stringify({ userId, roleId }) });
      push('Rol asignado. Las sesiones activas deben refrescarse.', 'success');
      await load();
    } catch (error) {
      push(error instanceof ApiError ? error.message : 'No se pudo asignar', 'error');
    }
  }

  async function revoke(targetUser: string, roleName: string) {
    const role = roles.find((item) => item.name === roleName);
    if (!role) return;
    try {
      await api(`/api/roles/assignments/${targetUser}/${role.id}`, { method: 'DELETE' });
      push('Rol revocado', 'success');
      await load();
    } catch (error) {
      push(error instanceof ApiError ? error.message : 'No se pudo revocar', 'error');
    }
  }

  return (
    <section>
      <PageHero title="Roles" lede="ADMIN, OPERATOR y VIEWER. Asignar o revocar sube la versión del token y cierra la sesión anterior." />
      <PageFrame>
        <div className="space-y-6">
          {loading && <SkeletonRows />}
          {!loading && roles.length === 0 && <EmptyState title="Sin catálogo" detail="El servicio de roles no devolvió definiciones." />}
          {!loading && roles.length > 0 && (
            <div className="grid gap-4 md:grid-cols-3">
              {roles.map((role) => (
                <article key={role.id} className="overflow-hidden rounded-3xl border border-line bg-white shadow-card">
                  <div className="h-1.5 bg-ink" />
                  <div className="p-5">
                    <h2 className="text-lg font-semibold">{role.name}</h2>
                    <p className="mt-1 text-sm leading-6 text-ink/70">{role.description}</p>
                    <div className="mt-4 flex flex-wrap gap-1.5">
                      {role.permissions.map((permission) => (
                        <span key={permission} className="rounded-full bg-mist px-2.5 py-1 text-[11px] font-medium text-ink/70">
                          {permission}
                        </span>
                      ))}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
          {can('roles:assign') && !loading && (
            <form onSubmit={(event) => void assign(event)} className="grid gap-3 rounded-3xl border border-line bg-white p-4 shadow-card md:grid-cols-[1fr_1fr_auto]">
              <select className="field mt-0" value={userId} onChange={(event) => setUserId(event.target.value)} required>
                <option value="">Usuario</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.fullName}
                  </option>
                ))}
              </select>
              <select className="field mt-0" value={roleId} onChange={(event) => setRoleId(event.target.value)} required>
                <option value="">Rol</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
              <button className="btn-navy">Asignar</button>
            </form>
          )}
          {!loading && users.length === 0 && <EmptyState title="Nadie a quien asignar" detail="Crea un usuario antes de mover roles." />}
          {!loading && users.length > 0 && (
            <ul className="divide-y divide-line overflow-hidden rounded-3xl border border-line bg-white shadow-card">
              {users.map((user) => (
                <li key={user.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                  <div>
                    <p className="font-semibold">{user.fullName}</p>
                    <p className="text-sm text-ink/55">{user.email}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(user.roles ?? []).map((role) => (
                      <button key={role} className="rounded-full bg-mist px-3 py-1 text-xs font-semibold text-ink" onClick={() => void revoke(user.id, role)} disabled={!can('roles:assign')}>
                        {role} {can('roles:assign') ? '×' : ''}
                      </button>
                    ))}
                    {(user.roles ?? []).length === 0 && <span className="text-sm text-ink/45">Sin roles</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PageFrame>
    </section>
  );
}
