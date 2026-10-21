import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, api } from '../api/client';
import { PageFrame, PageHero } from '../components/Brand';
import { EmptyState, SkeletonRows } from '../components/States';
import { useSession } from '../store/session';
import { useUi } from '../store/ui';

interface UserRow {
  id: string;
  email: string;
  fullName: string;
  status: 'ACTIVE' | 'INACTIVE';
  roles?: string[];
}

export function UsersPage() {
  const can = useSession((state) => state.can);
  const push = useUi((state) => state.push);
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load(term = search) {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (term.trim()) params.set('search', term.trim());
      const query = params.toString();
      const page = await api<{ data: UserRow[] }>(`/api/users${query ? `?${query}` : ''}`);
      setRows(page.data);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'No se pudieron cargar los usuarios');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load('');
  }, []);

  async function deactivate(id: string) {
    try {
      await api(`/api/users/${id}/deactivate`, { method: 'POST' });
      push('Usuario desactivado y sesión revocada', 'success');
      await load();
    } catch (caught) {
      push(caught instanceof ApiError ? caught.message : 'No se pudo desactivar', 'error');
    }
  }

  return (
    <section>
      <PageHero title="Usuarios" lede="El directorio de la consola. Cada alta viaja por la saga del gateway y queda en auditoría.">
        {can('users:write') && can('roles:assign') && (
          <Link to="/usuarios/nuevo" className="btn-white">
            Nuevo usuario
          </Link>
        )}
      </PageHero>
      <PageFrame>
        <form
          className="flex gap-2"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            void load();
          }}
        >
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nombre o correo"
            className="field mt-0 w-full max-w-md"
          />
          <button className="btn-line">Buscar</button>
        </form>
        <div className="mt-6">
          {loading && <SkeletonRows />}
          {!loading && error && <EmptyState title="No pudimos leer el directorio" detail={error} />}
          {!loading && !error && rows.length === 0 && <EmptyState title="Sin usuarios" detail="No hay registros para este filtro." />}
          {!loading && !error && rows.length > 0 && (
            <div className="overflow-hidden rounded-3xl border border-line bg-white shadow-card">
              <table className="w-full text-left text-sm">
                <thead className="bg-mist text-ink/55">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Nombre</th>
                    <th className="px-4 py-3 font-semibold">Correo</th>
                    <th className="px-4 py-3 font-semibold">Roles</th>
                    <th className="px-4 py-3 font-semibold">Estado</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((user) => (
                    <tr key={user.id} className="border-t border-line">
                      <td className="px-4 py-3.5 font-semibold">{user.fullName}</td>
                      <td className="px-4 py-3.5 text-ink/80">{user.email}</td>
                      <td className="px-4 py-3.5">{user.roles?.join(', ') || '—'}</td>
                      <td className="px-4 py-3.5">
                        <span className={user.status === 'ACTIVE' ? 'rounded-full bg-sea/10 px-2.5 py-1 text-xs font-semibold text-sea' : 'rounded-full bg-mist px-2.5 py-1 text-xs font-semibold text-ink/45'}>
                          {user.status === 'ACTIVE' ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        {can('users:write') && (
                          <Link className="mr-3 text-sm font-semibold text-sea" to={`/usuarios/${user.id}`}>
                            Editar
                          </Link>
                        )}
                        {can('users:write') && user.status === 'ACTIVE' && (
                          <button className="text-sm font-semibold text-clay" onClick={() => void deactivate(user.id)}>
                            Desactivar
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </PageFrame>
    </section>
  );
}
