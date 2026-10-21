import { FormEvent, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router-dom';
import { ApiError, login } from '../api/client';
import { loginSchema, LoginValues } from '../schemas/user';
import { useUi } from '../store/ui';
import { Ecosystem, TokaMark } from '../components/Brand';

export function LoginPage() {
  const navigate = useNavigate();
  const push = useUi((state) => state.push);
  const [submitting, setSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } });

  async function onSubmit(values: LoginValues) {
    setSubmitting(true);
    try {
      await login(values.email, values.password);
      navigate('/usuarios');
    } catch (error) {
      push(error instanceof ApiError ? error.message : 'No se pudo iniciar sesión', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex h-[78px] max-w-6xl items-center px-4 md:px-6">
          <TokaMark />
        </div>
      </header>
      <section className="hero-navy text-white">
        <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-12 md:px-6 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:py-16">
          <div>
            <h1 className="max-w-xl text-4xl font-semibold leading-[1.12] tracking-tight md:text-5xl">
              Integra tu operación al ecosistema Toka
            </h1>
            <p className="mt-5 max-w-md text-base leading-7 text-white/80">
              Lleva el directorio, los roles y la auditoría a una sola consola. El asistente responde con el contexto de Toka y, si el modelo limita, el resto sigue operando.
            </p>
            <form onSubmit={handleSubmit(onSubmit) as (event: FormEvent) => void} className="mt-8 max-w-sm" noValidate>
              <label className="block text-sm text-white/85">
                Correo
                <input className="field" type="email" autoComplete="username" {...register('email')} />
                {errors.email && <span className="mt-1 block text-xs text-[#ffc1cb]">{errors.email.message}</span>}
              </label>
              <label className="mt-4 block text-sm text-white/85">
                Contraseña
                <input className="field" type="password" autoComplete="current-password" {...register('password')} />
                {errors.password && <span className="mt-1 block text-xs text-[#ffc1cb]">{errors.password.message}</span>}
              </label>
              <button disabled={submitting} className="btn-white mt-6 w-full">
                {submitting ? 'Validando…' : 'Entrar'}
              </button>
              <p className="mt-4 text-xs text-white/50">admin@toka.local · Toka2026!</p>
            </form>
          </div>
          <Ecosystem />
        </div>
      </section>
      <section className="bg-white px-6 py-16 text-center md:py-20">
        <h2 className="mx-auto max-w-3xl text-3xl font-semibold leading-tight tracking-tight text-ink md:text-[2.55rem]">
          Un grupo empresarial que conecta soluciones y personas
        </h2>
      </section>
    </div>
  );
}
