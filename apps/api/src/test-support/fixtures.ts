import bcrypt from 'bcrypt';
import type { Model } from 'mongoose';

import type { AccessTokenPayload } from '../modules/auth/jwt.util';

/** Low cost factor — these are throwaway test users, never real credentials. */
const TEST_PASSWORD_HASH_COST = 4;

let emailCounter = 0;
function uniqueEmail(prefix: string): string {
  emailCounter += 1;
  return `${prefix}-${Date.now()}-${emailCounter}@example.test`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createCustomer(UserModel: Model<any>, overrides: Record<string, unknown> = {}) {
  const passwordHash = await bcrypt.hash('Test-Password-123!', TEST_PASSWORD_HASH_COST);
  return UserModel.create({
    name: 'Test Customer',
    email: uniqueEmail('customer'),
    passwordHash,
    role: 'customer',
    isActive: true,
    emailVerified: true,
    ...overrides,
  });
}

export function bearerFor(
  signAccessToken: (payload: AccessTokenPayload) => string,
  user: { _id: unknown; role: string },
): string {
  return `Bearer ${signAccessToken({ sub: String(user._id), role: user.role as AccessTokenPayload['role'] })}`;
}
