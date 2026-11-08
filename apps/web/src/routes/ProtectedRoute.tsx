import type { Action, Resource, Role } from '@medcommerce/shared';
import { permission } from '@medcommerce/shared';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { Spinner } from '../components/common/Spinner';
import { useAuth } from '../context/AuthContext';
import { getProfilePath } from '../utils/account-path';

interface ProtectedRouteProps {
  requiredRole?: Role[];
  requiredPermission?: { resource: Resource; action: Action };
}

/** Auth gate, then optional role/permission gate — a route can require either, both, or neither. */
export function ProtectedRoute({ requiredRole, requiredPermission }: ProtectedRouteProps = {}) {
  const { isAuthenticated, isLoading, user, permissions, isSuperAdmin } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner size="lg" className="text-brand-500" />
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  // A password set by someone other than the account holder (an admin's temp
  // password for a new staff account, an admin-initiated reset, or a
  // Super-Admin recovery script run) must be changed before anything else —
  // checked ahead of the role/permission gates below so it applies
  // regardless of which route was requested. The profile page itself is
  // exempted so the redirect target is actually reachable.
  const profilePath = getProfilePath(user.role);
  if (user.mustChangePassword && location.pathname !== profilePath) {
    return <Navigate to={profilePath} replace state={{ forcedPasswordChange: true }} />;
  }

  if (requiredRole && !isSuperAdmin && !requiredRole.includes(user.role)) {
    return <Navigate to="/403" replace />;
  }

  if (requiredPermission && !isSuperAdmin) {
    const key = permission(requiredPermission.resource, requiredPermission.action);
    if (!permissions.has(key)) return <Navigate to="/403" replace />;
  }

  return <Outlet />;
}
