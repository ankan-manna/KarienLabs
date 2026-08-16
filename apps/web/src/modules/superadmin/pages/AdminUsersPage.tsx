import { zodResolver } from '@hookform/resolvers/zod';
import { DEFAULT_ROLES } from '@medcommerce/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import {
  createAdminUser,
  listAdminUsers,
  resetUserPassword,
  suspendUser,
  unsuspendUser,
  updateAdminUser,
  type AdminUser,
} from '../../../api/super-admin.api';
import { Badge } from '../../../components/common/Badge';
import { Button } from '../../../components/common/Button';
import { Can } from '../../../components/common/Can';
import { ConfirmDialog } from '../../../components/common/ConfirmDialog';
import { Drawer } from '../../../components/common/Drawer';
import { Input } from '../../../components/common/Input';
import { Modal } from '../../../components/common/Modal';
import { Pagination } from '../../../components/common/Pagination';
import { Select } from '../../../components/common/Select';
import { SkeletonRows } from '../../../components/common/Skeleton';
import { Textarea } from '../../../components/common/Textarea';
import { roleLabel } from '../../../utils/role-label';
import { toast } from '../../../utils/toast';

/** Role-aware badge tone — purely cosmetic, `user.role` itself (backend-authoritative) is what every actual authorization decision uses. */
const ROLE_BADGE_TONE: Record<string, 'red' | 'blue' | 'green' | 'gray'> = {
  super_admin: 'red',
  admin: 'blue',
  inventory_manager: 'blue',
  distributor: 'green',
  customer: 'gray',
};

// Must match the backend's shared passwordSchema (apps/api/src/utils/common-schemas.ts)
// — a weaker client-side rule here lets a password that will get 400'd by
// the server pass this form's validation first.
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

const createUserSchema = z.object({
  name: z.string().trim().min(2),
  email: z.string().trim().email(),
  password: z.string().regex(PASSWORD_REGEX, 'Min 8 chars, with at least one uppercase, one lowercase, and one digit'),
  role: z.enum(DEFAULT_ROLES as [string, ...string[]]),
});
type CreateUserValues = z.infer<typeof createUserSchema>;

const resetPasswordSchema = z
  .object({
    newPassword: z
      .string()
      .regex(
        PASSWORD_REGEX,
        'Min 8 chars, with at least one uppercase, one lowercase, and one digit',
      ),
    confirmPassword: z.string(),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });
type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;

export default function AdminUsersPage() {
  const [page, setPage] = useState(1);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [suspendTarget, setSuspendTarget] = useState<AdminUser | null>(null);
  const [suspendReason, setSuspendReason] = useState('');
  const [resetPasswordTarget, setResetPasswordTarget] = useState<AdminUser | null>(null);
  // Part 11 — a two-step flow: picking the new role opens a Modal (this
  // state); submitting THAT opens a ConfirmDialog (roleChangeConfirm) that
  // explicitly shows "Current Role -> New Role" before anything is sent to
  // the server. Two separate pieces of state so "pick a role" and "confirm
  // the change" are genuinely two taps, not one dropdown-and-go.
  const [changeRoleTarget, setChangeRoleTarget] = useState<AdminUser | null>(null);
  const [selectedNewRole, setSelectedNewRole] = useState('');
  const [roleChangeConfirm, setRoleChangeConfirm] = useState<{ user: AdminUser; newRole: string } | null>(
    null,
  );
  const [roleFilter, setRoleFilter] = useState('');
  const limit = 20;
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users', page, roleFilter],
    queryFn: () => listAdminUsers({ page, limit, role: roleFilter || undefined }),
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateUserValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { role: 'customer' },
  });

  const {
    register: registerResetPassword,
    handleSubmit: handleSubmitResetPassword,
    reset: resetResetPasswordForm,
    formState: { errors: resetPasswordErrors, isSubmitting: isSubmittingResetPassword },
  } = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
  });

  const createMutation = useMutation({
    mutationFn: (values: CreateUserValues) => createAdminUser(values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast.success('User created');
      reset();
      setIsFormOpen(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      updateAdminUser(id, { isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-users'] }),
  });

  const changeRoleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) => updateAdminUser(id, { role }),
    onSuccess: () => {
      // Part 18 — the list reflects the new role immediately via this
      // invalidation (no full page refresh needed); if the affected user
      // was mid-session, updateUserRoleOrStatus (backend) already revoked
      // their refresh tokens, so their NEXT request/login picks up the new
      // role and permissions (Part 19) — nothing further to do here.
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast.success('Role updated');
      setRoleChangeConfirm(null);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const suspendMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => suspendUser(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast.success('User suspended');
      setSuspendTarget(null);
      setSuspendReason('');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const unsuspendMutation = useMutation({
    mutationFn: (id: string) => unsuspendUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast.success('User unsuspended');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: ({ id, newPassword }: { id: string; newPassword: string }) =>
      resetUserPassword(id, newPassword),
    onSuccess: () => {
      toast.success('Password reset');
      setResetPasswordTarget(null);
      resetResetPasswordForm();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Admin Users</h1>
        <div className="flex items-center gap-3">
          <div className="w-40">
            <Select
              aria-label="Filter by role"
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value);
                setPage(1);
              }}
              placeholder="All roles"
              options={DEFAULT_ROLES.map((r) => ({ label: roleLabel(r), value: r }))}
            />
          </div>
          <Button onClick={() => setIsFormOpen(true)}>New User</Button>
        </div>
      </div>

      {/* Part 20 — was `overflow-hidden`, which CLIPS the Role/Status/Change
          Role/Suspend/Reset Password columns entirely on narrow viewports
          instead of letting them scroll into view; a real pre-existing
          mobile gap, found while verifying the new Change Role control
          across breakpoints, fixed here since it directly blocks that
          control on mobile. */}
      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
        {isLoading ? (
          <div className="p-4">
            <SkeletonRows rows={5} columns={4} />
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-4 py-2 font-medium text-gray-600 dark:text-gray-300">Name</th>
                <th className="px-4 py-2 font-medium text-gray-600 dark:text-gray-300">Email</th>
                <th className="px-4 py-2 font-medium text-gray-600 dark:text-gray-300">Role</th>
                <th className="px-4 py-2 font-medium text-gray-600 dark:text-gray-300">Status</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {data?.data.map((user) => (
                <tr key={user._id} className="border-t border-gray-100 dark:border-gray-800">
                  <td className="px-4 py-2 text-gray-900 dark:text-gray-100">{user.name}</td>
                  <td className="px-4 py-2 text-gray-500 dark:text-gray-400">{user.email}</td>
                  <td className="px-4 py-2">
                    <Badge tone={ROLE_BADGE_TONE[user.role] ?? 'gray'}>{roleLabel(user.role)}</Badge>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() =>
                          toggleActiveMutation.mutate({ id: user._id, isActive: !user.isActive })
                        }
                        className="text-xs text-brand-600 hover:underline"
                      >
                        {user.isActive ? 'Active (click to disable)' : 'Disabled (click to enable)'}
                      </button>
                      {user.isSuspended && <Badge tone="red">Suspended</Badge>}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Can I="update" a="users">
                      <div className="flex justify-end gap-3">
                        <button
                          onClick={() => {
                            setChangeRoleTarget(user);
                            setSelectedNewRole(user.role);
                          }}
                          className="text-xs text-brand-600 hover:underline"
                        >
                          Change Role
                        </button>
                        {user.isSuspended ? (
                          <button
                            onClick={() => unsuspendMutation.mutate(user._id)}
                            className="text-xs text-brand-600 hover:underline"
                          >
                            Unsuspend
                          </button>
                        ) : (
                          <button
                            onClick={() => setSuspendTarget(user)}
                            className="text-xs text-red-600 hover:underline"
                          >
                            Suspend
                          </button>
                        )}
                        <button
                          onClick={() => setResetPasswordTarget(user)}
                          className="text-xs text-gray-600 hover:underline dark:text-gray-300"
                        >
                          Reset Password
                        </button>
                      </div>
                    </Can>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Pagination page={page} limit={limit} total={data?.meta?.total ?? 0} onPageChange={setPage} />

      <Drawer isOpen={isFormOpen} onClose={() => setIsFormOpen(false)} title="New Admin User">
        <form
          onSubmit={handleSubmit((values) => createMutation.mutate(values))}
          className="flex flex-col gap-4"
        >
          <Input label="Name" error={errors.name?.message} {...register('name')} />
          <Input label="Email" type="email" error={errors.email?.message} {...register('email')} />
          <Input
            label="Temporary password"
            type="password"
            error={errors.password?.message}
            {...register('password')}
          />
          <Select
            label="Role"
            options={DEFAULT_ROLES.map((r) => ({ label: r, value: r }))}
            {...register('role')}
          />
          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isSubmitting}>
              Create
            </Button>
          </div>
        </form>
      </Drawer>

      <ConfirmDialog
        isOpen={!!suspendTarget}
        title={`Suspend ${suspendTarget?.name ?? 'user'}`}
        message={
          <div className="flex flex-col gap-3">
            <p>
              This immediately revokes all active sessions for this user. They will be unable to
              sign in until unsuspended.
            </p>
            <Textarea
              label="Reason (optional)"
              value={suspendReason}
              onChange={(e) => setSuspendReason(e.target.value)}
              rows={3}
            />
          </div>
        }
        confirmLabel="Suspend"
        isDangerous
        isLoading={suspendMutation.isPending}
        onConfirm={() => {
          if (!suspendTarget) return;
          suspendMutation.mutate({ id: suspendTarget._id, reason: suspendReason });
        }}
        onCancel={() => {
          setSuspendTarget(null);
          setSuspendReason('');
        }}
      />

      <Modal
        isOpen={!!resetPasswordTarget}
        onClose={() => {
          setResetPasswordTarget(null);
          resetResetPasswordForm();
        }}
        title={`Reset password — ${resetPasswordTarget?.name ?? ''}`}
        size="sm"
      >
        <form
          onSubmit={handleSubmitResetPassword((values) => {
            if (!resetPasswordTarget) return;
            resetPasswordMutation.mutate({
              id: resetPasswordTarget._id,
              newPassword: values.newPassword,
            });
          })}
          className="flex flex-col gap-4"
        >
          <Input
            label="New password"
            type="password"
            error={resetPasswordErrors.newPassword?.message}
            {...registerResetPassword('newPassword')}
          />
          <Input
            label="Confirm password"
            type="password"
            error={resetPasswordErrors.confirmPassword?.message}
            {...registerResetPassword('confirmPassword')}
          />
          <div className="mt-2 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setResetPasswordTarget(null);
                resetResetPasswordForm();
              }}
            >
              Cancel
            </Button>
            <Button type="submit" isLoading={isSubmittingResetPassword}>
              Reset Password
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={!!changeRoleTarget}
        onClose={() => setChangeRoleTarget(null)}
        title={`Change role — ${changeRoleTarget?.name ?? ''}`}
        size="sm"
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-gray-500">
            Current role: <Badge tone={ROLE_BADGE_TONE[changeRoleTarget?.role ?? ''] ?? 'gray'}>
              {roleLabel(changeRoleTarget?.role)}
            </Badge>
          </p>
          <Select
            label="New role"
            value={selectedNewRole}
            onChange={(e) => setSelectedNewRole(e.target.value)}
            options={DEFAULT_ROLES.map((r) => ({ label: roleLabel(r), value: r }))}
          />
          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setChangeRoleTarget(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!changeRoleTarget || selectedNewRole === changeRoleTarget.role}
              onClick={() => {
                if (!changeRoleTarget) return;
                setRoleChangeConfirm({ user: changeRoleTarget, newRole: selectedNewRole });
                setChangeRoleTarget(null);
              }}
            >
              Continue
            </Button>
          </div>
        </div>
      </Modal>

      {/* Part 11 — the explicit "Current Role -> New Role" confirmation step, separate from the Select above, so a role change always takes two deliberate actions. */}
      <ConfirmDialog
        isOpen={!!roleChangeConfirm}
        title="Confirm role change"
        message={
          roleChangeConfirm && (
            <p>
              Change <span className="font-medium">{roleChangeConfirm.user.name}</span>&apos;s role
              from <Badge tone={ROLE_BADGE_TONE[roleChangeConfirm.user.role] ?? 'gray'}>
                {roleLabel(roleChangeConfirm.user.role)}
              </Badge>{' '}
              to{' '}
              <Badge tone={ROLE_BADGE_TONE[roleChangeConfirm.newRole] ?? 'gray'}>
                {roleLabel(roleChangeConfirm.newRole)}
              </Badge>
              ?
              {roleChangeConfirm.newRole === 'super_admin' && (
                <span className="mt-2 block text-red-600">
                  This grants full Super Admin access — the highest privilege level.
                </span>
              )}
            </p>
          )
        }
        confirmLabel="Change Role"
        isDangerous={
          roleChangeConfirm?.newRole === 'super_admin' || roleChangeConfirm?.user.role === 'super_admin'
        }
        isLoading={changeRoleMutation.isPending}
        onConfirm={() => {
          if (!roleChangeConfirm) return;
          changeRoleMutation.mutate({ id: roleChangeConfirm.user._id, role: roleChangeConfirm.newRole });
        }}
        onCancel={() => setRoleChangeConfirm(null)}
      />
    </div>
  );
}
