import type { AuthUser } from '@medcommerce/shared';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import type { LoginResponse, RegisterResponse } from '../api/auth.api';
import {
  loginRequest,
  logoutRequest,
  meRequest,
  refreshRequest,
  registerRequest,
  verifyLoginOtpRequest,
  verifyRegisterOtpRequest,
} from '../api/auth.api';
import { setAccessToken, setUnauthorizedHandler } from '../api/http-client';

interface AuthContextValue {
  user: AuthUser | null;
  permissions: Set<string>;
  isSuperAdmin: boolean;
  isLoading: boolean;
  isAuthenticated: boolean;
  /** Returns the raw response so the caller (LoginPage) can branch into the OTP step when `otpRequired` is true — the session is only established here when it's `false`. */
  login: (email: string, password: string, rememberMe?: boolean) => Promise<LoginResponse>;
  /** Completes the OTP-login flow started by `login()` when it returned `otpRequired: true`. */
  completeOtpLogin: (challengeToken: string, code: string) => Promise<void>;
  /** Returns the raw response so the caller (RegisterPage) can branch into the OTP step when `otpRequired` is true — mirrors `login()`. */
  register: (name: string, email: string, password: string) => Promise<RegisterResponse>;
  /** Completes the OTP-registration flow started by `register()` when it returned `otpRequired: true`. */
  completeOtpRegistration: (challengeToken: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
  refetchMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [permissions, setPermissions] = useState<Set<string>>(new Set());
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const loadMe = useCallback(async () => {
    const me = await meRequest();
    setUser(me.user);
    setPermissions(new Set(me.permissions));
    setIsSuperAdmin(me.isSuperAdmin);
  }, []);

  const clearSession = useCallback(() => {
    setUser(null);
    setPermissions(new Set());
    setIsSuperAdmin(false);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(clearSession);

    // On hard refresh the in-memory access token is gone; silently try to
    // re-establish the session from the httpOnly refresh cookie.
    refreshRequest()
      .then(async (payload) => {
        setAccessToken(payload.accessToken);
        await loadMe();
      })
      .catch(() => setAccessToken(null))
      .finally(() => setIsLoading(false));
  }, [clearSession, loadMe]);

  const login = useCallback(
    async (email: string, password: string, rememberMe = true) => {
      const payload = await loginRequest(email, password, rememberMe);
      // OTP-required responses carry no session at all yet — nothing to
      // bootstrap here; the caller must render the OTP step and call
      // `completeOtpLogin` once the user enters the code.
      if (!payload.otpRequired) {
        setAccessToken(payload.accessToken);
        await loadMe();
      }
      return payload;
    },
    [loadMe],
  );

  const completeOtpLogin = useCallback(
    async (challengeToken: string, code: string) => {
      const payload = await verifyLoginOtpRequest(challengeToken, code);
      setAccessToken(payload.accessToken);
      await loadMe();
    },
    [loadMe],
  );

  const register = useCallback(
    async (name: string, email: string, password: string) => {
      const payload = await registerRequest(name, email, password);
      // OTP-required responses carry no session yet — the caller must render
      // the OTP step and call `completeOtpRegistration` once the user enters
      // the code (mirrors `login()`'s otpRequired branch above).
      if (!payload.otpRequired) {
        setAccessToken(payload.accessToken);
        await loadMe();
      }
      return payload;
    },
    [loadMe],
  );

  const completeOtpRegistration = useCallback(
    async (challengeToken: string, code: string) => {
      const payload = await verifyRegisterOtpRequest(challengeToken, code);
      setAccessToken(payload.accessToken);
      await loadMe();
    },
    [loadMe],
  );

  const logout = useCallback(async () => {
    await logoutRequest();
    setAccessToken(null);
    clearSession();
  }, [clearSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      permissions,
      isSuperAdmin,
      isLoading,
      isAuthenticated: !!user,
      login,
      completeOtpLogin,
      register,
      completeOtpRegistration,
      logout,
      refetchMe: loadMe,
    }),
    [
      user,
      permissions,
      isSuperAdmin,
      isLoading,
      login,
      completeOtpLogin,
      register,
      completeOtpRegistration,
      logout,
      loadMe,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
