import { z } from 'zod';

/**
 * Centralised, typed environment variable access.
 *
 * Call `getEnv()` wherever you need a secret or config value.
 * The first call validates the full schema; if anything is missing or
 * malformed the server crashes immediately with a clear error message
 * rather than silently failing at runtime.
 *
 * During `next build` (which runs in a Node process without real secrets),
 * set the env vars to placeholder strings in Vercel's build settings or
 * your CI environment.  The build itself does not call `getEnv()`.
 */

const envSchema = z.object({
  /** Firebase service account as a JSON string (copy the JSON, minify, paste). */
  FIREBASE_SERVICE_ACCOUNT_JSON: z.string().min(10),

  /** Google Gemini API key (optional if OPENROUTER_API_KEY is provided) */
  GEMINI_API_KEY: z.string().optional(),

  /** OpenRouter API key for unified LLM access */
  OPENROUTER_API_KEY: z.string().optional(),

  /** OpenRouter model name (e.g. google/gemini-2.5-flash) */
  OPENROUTER_MODEL: z.string().default('google/gemini-2.5-flash'),

  /** Gemini model name for natural-language parsing and digests */
  GEMINI_MODEL: z.string().default('gemini-2.5-flash'),

  /** Outbound SMTP credentials for Nodemailer (defaults to Gmail SMTP) */
  SMTP_HOST: z.string().default('smtp.gmail.com'),
  SMTP_PORT: z
    .union([z.string().regex(/^\d+$/).transform(Number), z.number()])
    .default(465),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_USER: z.string().optional(),
  EMAIL_PASS: z.string().optional(),

  /**
   * Session cookie signing secret.
   * Must be ≥ 32 chars; generate with: openssl rand -hex 32
   */
  SESSION_SECRET: z.string().min(32),

  /**
   * Shared secret sent by the external scheduler (cron-job.org) in the
   * `x-cron-secret` header on every POST /api/cron/tick call.
   * Generate with: openssl rand -hex 24
   */
  CRON_SECRET: z.string().min(16),

  /**
   * Signing secret for single-use email action tokens (Taken / Snooze / Skip).
   * Must be ≥ 32 chars; generate with: openssl rand -hex 32
   */
  TOKEN_SECRET: z.string().min(32),

  /** Canonical public URL, e.g. https://carecircle.vercel.app */
  APP_URL: z.string().url(),

  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
});

export type Env = z.infer<typeof envSchema> & {
  resolvedSmtpUser: string;
  resolvedSmtpPass: string;
};

let _env: Env | null = null;

/**
 * Returns the validated environment. Throws on the first call if any
 * required variable is missing or invalid.
 */
export function getEnv(): Env {
  if (_env) return _env;

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.flatten().fieldErrors;
    const lines = Object.entries(errors)
      .map(([k, v]) => `  ${k}: ${(v ?? []).join(', ')}`)
      .join('\n');
    throw new Error(
      `\n\n❌ Missing or invalid environment variables:\n${lines}\n\n` +
        'See .env.example for the full list.\n',
    );
  }

  const data = result.data;

  // Verify at least one AI key is present
  if (!data.GEMINI_API_KEY && !data.OPENROUTER_API_KEY) {
    throw new Error('Either GEMINI_API_KEY or OPENROUTER_API_KEY must be provided.');
  }

  const resolvedSmtpUser = data.SMTP_USER || data.EMAIL_USER || '';
  const resolvedSmtpPass = (data.SMTP_PASS || data.EMAIL_PASS || '').replace(/\s+/g, '');

  _env = {
    ...data,
    resolvedSmtpUser,
    resolvedSmtpPass,
  };

  return _env;
}
