import 'dotenv/config';

import { envSchema } from '@medcommerce/shared';

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Fail fast on boot rather than surfacing a confusing error on first use.
  // eslint-disable-next-line no-console
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProduction = env.NODE_ENV === 'production';
export const isDevelopment = env.NODE_ENV === 'development';
export const isTest = env.NODE_ENV === 'test';
