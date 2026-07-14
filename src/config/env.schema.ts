import { z } from 'zod';

const emptyStringToUndefined = (value: unknown) =>
  value === '' ? undefined : value;

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  FRONTEND_ORIGIN: z.string().min(1).default('http://localhost:5173'),
  APP_BASE_URL: z.string().url().default('http://localhost:3000'),
  SESSION_COOKIE_NAME: z.string().default('mc_session'),
  CSRF_COOKIE_NAME: z.string().default('mc_csrf'),
  COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).optional(),
  COOKIE_SECURE: z.enum(['true', 'false']).optional(),
  SESSION_INACTIVITY_TIMEOUT_MINUTES: z.coerce
    .number()
    .int()
    .min(5)
    .default(720),
  SESSION_ABSOLUTE_TIMEOUT_HOURS: z.coerce.number().int().min(1).default(720),
  WHATSAPP_ENABLED: z.enum(['true', 'false']).default('true'),
  WHATSAPP_PROVIDER: z
    .enum(['disabled', 'mock', 'whatsapp_link', 'whatsapp_cloud_api'])
    .default('whatsapp_link'),
  WHATSAPP_DEFAULT_COUNTRY_CODE: z
    .string()
    .regex(/^\d{1,4}$/)
    .default('52'),
  WHATSAPP_API_URL: z.preprocess(
    emptyStringToUndefined,
    z.string().url().optional(),
  ),
  WHATSAPP_API_TOKEN: z.preprocess(
    emptyStringToUndefined,
    z.string().optional(),
  ),
  WHATSAPP_FROM: z.preprocess(emptyStringToUndefined, z.string().optional()),
  WHATSAPP_TIMEOUT_MS: z.coerce.number().int().positive().default(4000),
  PAYMENT_BANK_NAME: z.string().default('Banco Ejemplo MX'),
  PAYMENT_ACCOUNT_HOLDER: z.string().default('MAGIC CITY EVENTOS S.A. DE C.V.'),
  PAYMENT_ACCOUNT_NUMBER: z.string().default('1234567890123456'),
  PAYMENT_CLABE: z.string().default('012345678901234567'),
  PAYMENT_REFERENCE_HINT: z
    .string()
    .default('Nombre del titular de la reserva'),
  BUSINESS_WHATSAPP: z.string().default('+52 55 1234 5678'),
  WHATSAPP_BUSINESS_PHONE: z.string().optional(),
  BUSINESS_PHONE: z.string().default('+52 55 9876 5432'),
  BUSINESS_EMAIL: z.string().email().default('pagos@magiccitydemo.com'),
  BUSINESS_TIME_ZONE: z.string().default('America/Mexico_City'),
  LOG_LEVEL: z.string().default('log,warn,error'),
});

export type AppEnv = z.infer<typeof envSchema>;

export function validateEnv(rawEnv: Record<string, unknown>): AppEnv {
  const parsed = envSchema.safeParse(rawEnv);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${issues}`);
  }

  return parsed.data;
}
