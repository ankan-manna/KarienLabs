import type { Role } from '../constants/roles';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  isActive: boolean;
  isSuspended: boolean;
  emailVerified: boolean;
  createdAt: string;
}

export interface AuthTokens {
  accessToken: string;
  accessTokenExpiresAt: string;
}
