import { FormEvent, useEffect, useState, ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, useParams } from 'react-router-dom';
import { ApiError, api } from '../api/client';
import { PageFrame, PageHero } from '../components/Brand';
import { userSchema, UserValues } from '../schemas/user';
import { useUi } from '../store/ui';

interface RoleOption {
  id: string;
  name: string;
  description: string;
}

export function UserFormPage() {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const push = useUi((state) => state.push);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [loading, setLoading] = useState(editing);
  const form = useForm<UserValues>({
    resolver: zodResolver(userSchema),
    defaultValues: { fullName: '', email: '', password: '', roleId: '' },
  });

  useEffect(() => {
    void api<RoleOption[]>('/api/roles')
      .then(setRoles)
      .catch(() => setRoles([]));
    if (!id) return;
    void api<{ fullName: string; email: string }>(`/api/users/${id}`)
      .then((user) => {
        form.reset({ fullName: user.fullName, email: user.email, password: '', roleId: '' });
        setLoading(false);
      })
      .catch((error: unknown) => {
        push(error instanceof ApiError ? error.message : 'No se pudo abrir el usuario', 'error');
        setLoading(false);
      });
  }, [id]);

  async function onSubmit(values: UserValues) {
    try {
      if (editing && id) {
        await api(`/api/users/${id}`, { method: 'PATCH', body: JSON.stringify({ fullName: values.fullName, email: values.email }) });
        push('Usuario actualizado', 'success');
      } else {
        if (!values.password || !values.roleId) {
          push('La contraseña y el rol son obligatorios', 'error');
          return;
        }
        await api('/api/users', {
          method: 'POST',
          body: JSON.stringify({ fullName: values.fullName, email: values.email, password: values.password, roleId: values.roleId }),
        });
        push('Usuario creado', 'success');
      }
      navigate('/usuarios');
    } catch (error) {
      push(error instanceof ApiError ? error.message : 'No se pudo guardar', 'error');
    }
  }

  return (
    <section>
      <PageHero
        title={editing ? 'Editar usuario' : 'Nuevo usuario'}
        lede={editing ? 'El correo se actualiza en el perfil y en la credencial.' : 'El alta crea la credencial, el perfil y la asignación de rol en una sola saga.'}
      />
      <PageFrame>
        {loading ? (
          <p className="text-sm text-ink/60">Cargando ficha…</p>
        ) : (
          <form onSubmit={form.handleSubmit(onSubmit) as (event: FormEvent) => void} className="max-w-xl space-y-4 rounded-3xl border border-line bg-white p-6 shadow-card" noValidate>
            <Field label="Nombre" error={form.formState.errors.fullName?.message}>
              <input className="field" {...form.register('fullName')} />
            </Field>
            <Field label="Correo" error={form.formState.errors.email?.message}>
              <input className="field" type="email" {...form.register('email')} />
            </Field>
            {!editing && (
              <>
                <Field label="Contraseña" error={form.formState.errors.password?.message}>
                  <input className="field" type="password" {...form.register('password')} />
                </Field>
                <Field label="Rol inicial" error={form.formState.errors.roleId?.message}>
                  <select className="field" {...form.register('roleId')}>
                    <option value="">Selecciona</option>
                    {roles.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.name} — {role.description}
                      </option>
                    ))}
                  </select>
                </Field>
              </>
            )}
            <button className="btn-navy">Guardar</button>
          </form>
        )}
      </PageFrame>
    </section>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <label className="block text-sm font-medium text-ink">
      {label}
      {children}
      {error && <span className="mt-1 block text-xs font-normal text-clay">{error}</span>}
    </label>
  );
}
