import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';

import { Spinner } from '../../../components/common/Spinner';
import { useAuth } from '../../../context/AuthContext';

/**
 * Landing page after a successful `/auth/google/callback` redirect
 * (apps/api/.../auth.controller.ts). The backend has already set the httpOnly
 * refresh cookie exactly as a normal password login would — this page does
 * no token handling itself, it just waits for `AuthProvider`'s existing
 * mount-time "bootstrap session from refresh cookie" flow
 * (`refreshRequest()` + `loadMe()` in AuthContext.tsx) to complete, then
 * routes into the admin panel. If that bootstrap fails for any reason
 * (cookie somehow missing), falls back to `/login`.
 */
export default function GoogleCallbackPage() {
  const { isAuthenticated, isLoading, user } = useAuth();

  useEffect(() => {
    document.title = 'Signing in… — KarienLabs';
  }, []);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center gap-3 py-6">
        <Spinner size="lg" className="text-brand-500" />
        <p className="text-sm text-gray-500">Finishing sign-in…</p>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  const isAdmin = user.role === 'admin' || user.role === 'super_admin' || user.role === 'inventory_manager';
  return <Navigate to={isAdmin ? '/admin/dashboard' : '/'} replace />;
}
