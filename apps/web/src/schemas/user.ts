import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Ingresa un correo válido'),
  password: z.string().min(8, 'Mínimo 8 caracteres'),
});

export const userSchema = z.object({
  fullName: z.string().trim().min(2, 'Mínimo 2 caracteres').max(120, 'Máximo 120 caracteres'),
  email: z.string().email('Ingresa un correo válido'),
  password: z
    .string()
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,72}$/, 'Usa 8-72 caracteres, con mayúscula, minúscula y número')
    .optional()
    .or(z.literal('')),
  roleId: z.string().uuid('Selecciona un rol').optional().or(z.literal('')),
});

export type LoginValues = z.infer<typeof loginSchema>;
export type UserValues = z.infer<typeof userSchema>;

export const assistantSchema = z.object({
  question: z.string().trim().min(2, 'Escribe una pregunta').max(2000, 'Máximo 2000 caracteres'),
});
