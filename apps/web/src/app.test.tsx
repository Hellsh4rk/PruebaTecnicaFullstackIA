import { loginSchema, userSchema } from '../src/schemas/user';
import { useSession } from '../src/store/session';
import { useUi } from '../src/store/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EmptyState } from '../src/components/States';

describe('esquemas', () => {
  it('rechaza un login incompleto y acepta una ficha válida', () => {
    expect(loginSchema.safeParse({ email: 'no', password: '123' }).success).toBe(false);
    expect(
      userSchema.safeParse({
        fullName: 'Ana López',
        email: 'ana@toka.local',
        password: 'Admin123!',
        roleId: '33333333-3333-4333-8333-333333333333',
      }).success,
    ).toBe(true);
  });
});

describe('sesión', () => {
  it('guarda y limpia la sesión', () => {
    useSession.getState().setSession({
      accessToken: 'a',
      refreshToken: 'r',
      user: { id: '1', email: 'a@toka.local', roles: ['ADMIN'], permissions: ['users:read'] },
    });
    expect(useSession.getState().can('users:read')).toBe(true);
    useSession.getState().clear();
    expect(useSession.getState().accessToken).toBeNull();
    expect(useSession.getState().can('users:read')).toBe(false);
  });
});

describe('toasts', () => {
  it('publica y retira avisos', () => {
    jest.useFakeTimers();
    try {
      useUi.setState({ toasts: [] });
      useUi.getState().push('Guardado', 'success');
      const toast = useUi.getState().toasts[0];
      expect(toast.message).toBe('Guardado');
      expect(toast.tone).toBe('success');
      useUi.getState().dismiss(toast.id);
      expect(useUi.getState().toasts).toHaveLength(0);
      useUi.getState().push('Pendiente');
      jest.advanceTimersByTime(4200);
      expect(useUi.getState().toasts).toHaveLength(0);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('EmptyState', () => {
  it('muestra el vacío', () => {
    render(<EmptyState title="Sin usuarios" detail="Crea el primero" />);
    expect(screen.getByText('Sin usuarios')).toBeInTheDocument();
  });
});

describe('LoginPage', () => {
  it('muestra el error de validación antes de llamar a la red', async () => {
    const { LoginPage } = await import('../src/pages/LoginPage');
    const { MemoryRouter } = await import('react-router-dom');
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );
    await userEvent.type(screen.getByLabelText('Correo'), 'no-es-correo');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'corta');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByText('Ingresa un correo válido')).toBeInTheDocument();
  });
});
