import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { changePasswordRequest, listSessionsRequest, revokeSessionRequest } from '../../../../api/auth.api';
import { Badge } from '../../../../components/common/Badge';
import { Button } from '../../../../components/common/Button';
import { Card } from '../../../../components/common/Card';
import { Input } from '../../../../components/common/Input';
import { SkeletonRows } from '../../../../components/common/Skeleton';
import { useAuth } from '../../../../context/AuthContext';
import { formatDate, formatDateTime } from '../../../../utils/format';
import { roleLabel } from '../../../../utils/role-label';
import { toast } from '../../../../utils/toast';

// Must match the backend's shared passwordSchema (apps/api/src/utils/common-schemas.ts)
// — a weaker client-side rule here lets a password that will get 400'd by
// the server pass this form's validation first.
const NEW_PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Required'),
    newPassword: z
      .string()
      .regex(NEW_PASSWORD_REGEX, 'Min 8 chars, with at least one uppercase, one lowercase, and one digit'),
    confirmPassword: z.string().min(1, 'Required'),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });
type PasswordFormValues = z.infer<typeof passwordSchema>;

export default function AdminProfilePage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: sessions, isLoading: sessionsLoading } = useQuery({
    queryKey: ['auth-sessions'],
    queryFn: listSessionsRequest,
  });

  const revokeMutation = useMutation({
    mutationFn: revokeSessionRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth-sessions'] });
      toast.success('Session revoked');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const changePasswordMutation = useMutation({
    mutationFn: (values: PasswordFormValues) =>
      changePasswordRequest(values.currentPassword, values.newPassword),
    onSuccess: () => {
      toast.success('Password changed — other sessions were signed out');
      reset();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PasswordFormValues>({ resolver: zodResolver(passwordSchema) });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-gray-900 dark:text-night-text">My Profile</h1>

      <Card className="p-5">
        <h2 className="mb-3 text-base font-semibold text-gray-800 dark:text-night-text">Account</h2>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <dt className="text-gray-500">Name</dt>
          <dd>{user?.name}</dd>
          <dt className="text-gray-500">Email</dt>
          <dd>{user?.email}</dd>
          {/* Part 3 — "only display fields that actually exist in the current user
              model"; `phone` is optional on the User schema (no phone-based
              registration flow), so it's only shown when set. */}
          {user?.phone && (
            <>
              <dt className="text-gray-500">Phone</dt>
              <dd>{user.phone}</dd>
            </>
          )}
          <dt className="text-gray-500">Role</dt>
          {/* Part 4 — role-aware, but the label is purely cosmetic: the value
              driving it (`user.role`) comes straight from the backend-issued
              /auth/me response, never guessed or derived on the frontend. */}
          <dd>
            <Badge tone={user?.role === 'super_admin' ? 'red' : 'blue'}>{roleLabel(user?.role)}</Badge>
          </dd>
          <dt className="text-gray-500">Account Status</dt>
          <dd>
            {user?.isSuspended ? (
              <Badge tone="red">Suspended</Badge>
            ) : user?.isActive ? (
              <Badge tone="green">Active</Badge>
            ) : (
              <Badge tone="gray">Inactive</Badge>
            )}
          </dd>
          {user?.createdAt && (
            <>
              <dt className="text-gray-500">Created</dt>
              <dd>{formatDate(user.createdAt)}</dd>
            </>
          )}
        </dl>
      </Card>

      <Card className="p-5">
        <h2 className="mb-3 text-base font-semibold text-gray-800 dark:text-night-text">
          Change Password
        </h2>
        <form
          onSubmit={handleSubmit((values) => changePasswordMutation.mutate(values))}
          className="flex max-w-sm flex-col gap-4"
        >
          <Input
            type="password"
            label="Current Password"
            error={errors.currentPassword?.message}
            {...register('currentPassword')}
          />
          <Input
            type="password"
            label="New Password"
            error={errors.newPassword?.message}
            {...register('newPassword')}
          />
          <Input
            type="password"
            label="Confirm New Password"
            error={errors.confirmPassword?.message}
            {...register('confirmPassword')}
          />
          <Button type="submit" isLoading={isSubmitting} className="self-start">
            Update Password
          </Button>
        </form>
      </Card>

      <Card className="p-5">
        <h2 className="mb-1 text-base font-semibold text-gray-800 dark:text-night-text">
          Login History &amp; Devices
        </h2>
        <p className="mb-3 text-sm text-gray-500">
          Active and recent sessions across your devices. Two-factor authentication is future-ready
          and not yet enabled.
        </p>
        {sessionsLoading ? (
          <SkeletonRows rows={3} columns={4} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="bg-gray-50 dark:bg-night-surface">
                <tr>
                  <th className="px-3 py-2 font-medium text-gray-600 dark:text-night-muted">Device</th>
                  <th className="px-3 py-2 font-medium text-gray-600 dark:text-night-muted">IP</th>
                  <th className="px-3 py-2 font-medium text-gray-600 dark:text-night-muted">Signed in</th>
                  <th className="px-3 py-2 font-medium text-gray-600 dark:text-night-muted">Status</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {(sessions ?? []).map((s) => (
                  <tr key={s.id} className="border-t border-gray-100 dark:border-night-border/60">
                    <td className="max-w-xs truncate px-3 py-2">{s.deviceInfo || 'Unknown device'}</td>
                    <td className="px-3 py-2">{s.ip}</td>
                    <td className="px-3 py-2">{formatDateTime(s.createdAt)}</td>
                    <td className="px-3 py-2">
                      {s.isCurrent ? (
                        <Badge tone="green">This device</Badge>
                      ) : s.revokedAt ? (
                        <Badge tone="gray">Signed out</Badge>
                      ) : (
                        <Badge tone="blue">Active</Badge>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {!s.revokedAt && !s.isCurrent && (
                        <button
                          type="button"
                          className="text-xs font-medium text-red-600 hover:underline"
                          onClick={() => revokeMutation.mutate(s.id)}
                        >
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
