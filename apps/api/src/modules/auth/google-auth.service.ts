import { randomBytes } from 'crypto';

import { ROLES } from '@medcommerce/shared';
import bcrypt from 'bcrypt';
import { OAuth2Client } from 'google-auth-library';

import { env } from '../../config/env';
import { UnauthenticatedError } from '../../utils/app-error';

import { ADMIN_ROLES, isAdminRole } from './actor-context.util';
import { isGoogleOAuthConfigured } from './auth-config.service';
import { CURRENT_PRIVACY_VERSION, CURRENT_TERMS_VERSION } from './consent-policy.constants';
import { UserModel } from './models/user.model';

const BCRYPT_COST = 12;

type UserHydratedDocument = InstanceType<typeof UserModel>;

let client: OAuth2Client | null = null;

/** Lazily built (same singleton pattern as email-transport.ts's nodemailer transporter / pdf.service.ts's Puppeteer browser) and only if Google OAuth env vars are actually set — never constructed with empty credentials. */
function getClient(): OAuth2Client {
  if (!isGoogleOAuthConfigured()) {
    throw new UnauthenticatedError('Google sign-in is not configured on this server.');
  }
  if (!client) {
    client = new OAuth2Client(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, env.GOOGLE_CALLBACK_URL);
  }
  return client;
}

/** Builds the Google consent-screen URL. `state` is a caller-generated CSRF token (see auth.controller.ts's double-submit cookie) — Google echoes it back verbatim on the callback. */
export function buildGoogleConsentUrl(state: string): string {
  return getClient().generateAuthUrl({
    access_type: 'online', // we don't need offline/refresh access to the user's Google account — only a one-time identity check
    scope: ['openid', 'email', 'profile'],
    state,
    prompt: 'select_account',
  });
}

export interface VerifiedGoogleIdentity {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
}

/**
 * Exchanges the OAuth `code` for tokens, then verifies the returned ID
 * token's signature/issuer/audience/expiry server-side via google-auth-library
 * (never trusts anything the frontend might claim about the Google profile —
 *  10's explicit requirement). Deliberately returns only the minimal
 * identity fields and discards the access/id/refresh tokens immediately —
 * nothing Google-issued is persisted or logged past this function returning.
 */
export async function verifyGoogleAuthCode(code: string): Promise<VerifiedGoogleIdentity> {
  const oauthClient = getClient();

  let idToken: string | null | undefined;
  try {
    const { tokens } = await oauthClient.getToken(code);
    idToken = tokens.id_token;
  } catch {
    throw new UnauthenticatedError('Google sign-in failed — the authorization code was invalid or expired.');
  }
  if (!idToken) throw new UnauthenticatedError('Google did not return an identity token.');

  const ticket = await oauthClient.verifyIdToken({ idToken, audience: env.GOOGLE_CLIENT_ID });
  const payload = ticket.getPayload();
  if (!payload?.sub || !payload.email) {
    throw new UnauthenticatedError('Google identity token did not contain the required claims.');
  }

  return {
    sub: payload.sub,
    email: payload.email.toLowerCase(),
    emailVerified: payload.email_verified === true,
    name: payload.name ?? payload.email,
  };
}

export type GoogleAdminResolutionFailure =
  | 'email_not_verified'
  | 'no_matching_admin_account'
  | 'not_admin_role'
  | 'account_inactive'
  | 'account_suspended';

export class GoogleAdminResolutionError extends Error {
  constructor(public readonly reason: GoogleAdminResolutionFailure, message: string) {
    super(message);
  }
}

/**
 * Account-linking policy ( 10 Part 3): a Google identity is only ever
 * mapped onto an EXISTING, already-authorized admin/super_admin/
 * inventory_manager User document — never auto-provisioned, never silently
 * merged onto an unrelated account, and never able to elevate a customer
 * account to admin. Matched by `googleId` first (already linked), falling
 * back to `email` only to perform the (one-time) link itself.
 */
export async function resolveGoogleAdminUser(
  identity: VerifiedGoogleIdentity,
): Promise<UserHydratedDocument> {
  if (!identity.emailVerified) {
    throw new GoogleAdminResolutionError(
      'email_not_verified',
      'Your Google account email is not verified.',
    );
  }

  let user = await UserModel.findOne({ googleId: identity.sub, deletedAt: null });

  if (!user) {
    user = await UserModel.findOne({ email: identity.email, deletedAt: null });
    if (!user) {
      throw new GoogleAdminResolutionError(
        'no_matching_admin_account',
        'No authorized admin account exists for this Google identity. Ask a super admin to create one first.',
      );
    }
    if (!isAdminRole(user.role as (typeof ADMIN_ROLES)[number])) {
      throw new GoogleAdminResolutionError(
        'not_admin_role',
        'This Google account is not authorized for admin access.',
      );
    }
    // First successful Google sign-in for an already-authorized admin — link, don't create.
    user.googleId = identity.sub;
    user.googleLinkedAt = new Date();
    await user.save();
  }

  if (!isAdminRole(user.role as (typeof ADMIN_ROLES)[number])) {
    throw new GoogleAdminResolutionError(
      'not_admin_role',
      'This account is not authorized for admin access.',
    );
  }
  if (!user.isActive) {
    throw new GoogleAdminResolutionError('account_inactive', 'This account is disabled.');
  }
  if (user.isSuspended) {
    throw new GoogleAdminResolutionError(
      'account_suspended',
      'This account has been suspended. Contact a super admin.',
    );
  }

  return user;
}

export type GoogleCustomerResolutionFailure =
  | 'email_not_verified'
  | 'staff_account_use_admin_login'
  | 'account_inactive'
  | 'account_suspended';

export class GoogleCustomerResolutionError extends Error {
  constructor(public readonly reason: GoogleCustomerResolutionFailure, message: string) {
    super(message);
  }
}

/**
 * Customer-facing Google sign-in/sign-up — the deliberate opposite policy
 * from `resolveGoogleAdminUser` above: a first-time Google identity with no
 * matching account DOES get auto-provisioned as a new `customer`, since
 * "Continue with Google" on the Sign Up page IS the account-creation
 * action, not just an alternate login for an account that must already
 * exist. An existing STAFF account matched by email is deliberately
 * rejected here rather than silently logged into — that account must come
 * through the dedicated, stricter admin Google flow (or password), never
 * this one.
 *
 * Password policy for auto-provisioned accounts: a random, never-displayed,
 * never-emailed bcrypt hash — satisfies the schema's required `passwordHash`
 * without ever creating a real/guessable password. The account holder can
 * still set a real password later via the normal "Forgot password" flow if
 * they ever want password-based login too.
 *
 * Consent: Google sign-up has no checkbox step, so acceptance is recorded
 * from the visible "By continuing, you agree to our Terms & Conditions and
 * Privacy Policy" disclaimer shown directly beside the button on both the
 * Login and Register pages (RegisterPage.tsx / LoginPage.tsx) — not silently
 * assumed with no on-screen notice.
 */
export async function resolveOrCreateGoogleCustomerUser(
  identity: VerifiedGoogleIdentity,
): Promise<{ user: UserHydratedDocument; isNewAccount: boolean }> {
  if (!identity.emailVerified) {
    throw new GoogleCustomerResolutionError(
      'email_not_verified',
      'Your Google account email is not verified.',
    );
  }

  let user = await UserModel.findOne({ googleId: identity.sub, deletedAt: null });
  let isNewAccount = false;

  if (!user) {
    user = await UserModel.findOne({ email: identity.email, deletedAt: null });

    if (user) {
      if (isAdminRole(user.role as (typeof ADMIN_ROLES)[number])) {
        throw new GoogleCustomerResolutionError(
          'staff_account_use_admin_login',
          'This email belongs to a staff account. Please use the admin sign-in page.',
        );
      }
      user.googleId = identity.sub;
      user.googleLinkedAt = new Date();
      await user.save();
    } else {
      const unguessablePassword = randomBytes(32).toString('hex');
      const now = new Date();
      user = await UserModel.create({
        name: identity.name,
        email: identity.email,
        passwordHash: await bcrypt.hash(unguessablePassword, BCRYPT_COST),
        role: ROLES.CUSTOMER,
        googleId: identity.sub,
        googleLinkedAt: now,
        emailVerified: true,
        consent: {
          terms: { accepted: true, acceptedAt: now, version: CURRENT_TERMS_VERSION },
          privacy: { accepted: true, acceptedAt: now, version: CURRENT_PRIVACY_VERSION },
        },
      });
      isNewAccount = true;
    }
  }

  if (!user.isActive) {
    throw new GoogleCustomerResolutionError('account_inactive', 'This account is disabled.');
  }
  if (user.isSuspended) {
    throw new GoogleCustomerResolutionError(
      'account_suspended',
      'This account has been suspended. Contact support.',
    );
  }

  return { user, isNewAccount };
}
