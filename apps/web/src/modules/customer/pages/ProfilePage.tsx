import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { changePasswordRequest, requestEmailVerificationRequest } from '../../../api/auth.api';
import {
  confirmPhoneChange,
  deactivateAccount,
  getMyExtendedProfile,
  requestPhoneChange,
  updateMyExtendedProfile,
  type NotificationPreferences,
} from '../../../api/profile.api';
import { uploadImageDirect } from '../../../api/uploads.api';
import { Avatar } from '../../../components/common/Avatar';
import { Badge } from '../../../components/common/Badge';
import { Button } from '../../../components/common/Button';
import { Card } from '../../../components/common/Card';
import { ConfirmDialog } from '../../../components/common/ConfirmDialog';
import { Input } from '../../../components/common/Input';
import { Switch } from '../../../components/common/Switch';
import { Textarea } from '../../../components/common/Textarea';
import { useAuth } from '../../../context/AuthContext';
import { toast } from '../../../utils/toast';

const PREFERENCE_LABELS: { key: keyof NotificationPreferences; label: string }[] = [
  { key: 'orderUpdates', label: 'Order updates' },
  { key: 'paymentUpdates', label: 'Payment updates' },
  { key: 'deliveryUpdates', label: 'Delivery updates' },
  { key: 'offersAndAnnouncements', label: 'Offers & announcements' },
  { key: 'emailEnabled', label: 'Email notifications' },
  { key: 'smsEnabled', label: 'SMS notifications' },
];

function ChangePasswordCard() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const mutation = useMutation({
    mutationFn: () => changePasswordRequest(currentPassword, newPassword),
    onSuccess: () => {
      toast.success('Password changed — other sessions signed out');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Card className="max-w-lg p-5">
      <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">
        Change Password
      </h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (newPassword.length < 8) return toast.error('New password must be at least 8 characters');
          if (newPassword !== confirmPassword) return toast.error('Passwords do not match');
          mutation.mutate();
        }}
        className="flex flex-col gap-3"
      >
        <Input
          type="password"
          label="Current password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
        />
        <Input
          type="password"
          label="New password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
        <Input
          type="password"
          label="Confirm new password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
        <Button type="submit" isLoading={mutation.isPending} className="self-start">
          Update Password
        </Button>
      </form>
    </Card>
  );
}

/** Prompt 21 Part 3 — OTP-verified phone change (reuses the existing OTP system, never a blind write). */
function PhoneChangeCard({ currentPhone }: { currentPhone: string }) {
  const queryClient = useQueryClient();
  const [newPhone, setNewPhone] = useState(currentPhone);
  const [awaitingCode, setAwaitingCode] = useState(false);
  const [code, setCode] = useState('');

  const requestMutation = useMutation({
    mutationFn: () => requestPhoneChange(newPhone),
    onSuccess: () => {
      setAwaitingCode(true);
      toast.success('Verification code sent to your new number');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const confirmMutation = useMutation({
    mutationFn: () => confirmPhoneChange(code),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile', 'me'] });
      toast.success('Phone number updated');
      setAwaitingCode(false);
      setCode('');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Card className="max-w-lg p-5">
      <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">Phone Number</h2>
      {!awaitingCode ? (
        <div className="flex items-end gap-2">
          <Input
            label="Phone"
            value={newPhone}
            onChange={(e) => setNewPhone(e.target.value)}
            className="flex-1"
          />
          <Button
            variant="outline"
            isLoading={requestMutation.isPending}
            disabled={!newPhone || newPhone === currentPhone}
            onClick={() => requestMutation.mutate()}
          >
            Verify &amp; Save
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Enter the code sent to {newPhone}.
          </p>
          <div className="flex items-end gap-2">
            <Input label="Verification code" value={code} onChange={(e) => setCode(e.target.value)} />
            <Button isLoading={confirmMutation.isPending} onClick={() => confirmMutation.mutate()}>
              Confirm
            </Button>
            <Button variant="outline" onClick={() => setAwaitingCode(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

/** Prompt 21 Part 35 — safe, reversible-by-admin self-deactivation (never a hard delete). */
function DeactivateAccountCard() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [reason, setReason] = useState('');

  const mutation = useMutation({
    mutationFn: () => deactivateAccount(password, reason || undefined),
    onSuccess: async () => {
      toast.success('Your account has been deactivated');
      setIsOpen(false);
      await logout();
      navigate('/login', { replace: true });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Card className="max-w-lg border-red-200 p-5 dark:border-red-900">
      <h2 className="mb-1 text-sm font-semibold text-red-700 dark:text-red-400">Deactivate Account</h2>
      <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
        Your account will be deactivated and you&apos;ll be signed out everywhere. Your orders,
        invoices, and other records are kept — contact support to reactivate.
      </p>
      <Button variant="danger" size="sm" onClick={() => setIsOpen(true)}>
        Deactivate my account
      </Button>

      <ConfirmDialog
        isOpen={isOpen}
        title="Deactivate account"
        message={
          <div className="flex flex-col gap-3">
            <Input
              type="password"
              label="Confirm your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Textarea
              label="Reason (optional)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        }
        confirmLabel="Deactivate"
        isDangerous
        isLoading={mutation.isPending}
        onConfirm={() => {
          if (!password) return toast.error('Please enter your password');
          mutation.mutate();
        }}
        onCancel={() => {
          setIsOpen(false);
          setPassword('');
        }}
      />
    </Card>
  );
}

export default function ProfilePage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const { data: profile } = useQuery({
    queryKey: ['profile', 'me'],
    queryFn: getMyExtendedProfile,
  });

  const resendVerification = useMutation({
    mutationFn: requestEmailVerificationRequest,
    onSuccess: () => toast.success('Verification email sent'),
    onError: () => toast.error('Could not send verification email'),
  });

  const patchProfile = useMutation({
    mutationFn: updateMyExtendedProfile,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile', 'me'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const asset = await uploadImageDirect(file, 'profile_picture', `avatars/${user?.id}`);
      await patchProfile.mutateAsync({ avatarUrl: asset.url });
      toast.success('Profile picture updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploadingAvatar(false);
    }
  }

  function togglePreference(key: keyof NotificationPreferences, value: boolean) {
    patchProfile.mutate({ notificationPreferences: { [key]: value } });
  }

  if (!user) return null;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">My Profile</h1>

      <Card className="max-w-lg p-5">
        <div className="mb-4 flex items-center gap-4">
          {profile?.avatarUrl ? (
            <img
              src={profile.avatarUrl}
              alt={user.name}
              className="h-16 w-16 rounded-full object-cover"
            />
          ) : (
            <Avatar name={user.name} size="lg" />
          )}
          <div>
            <Button
              variant="outline"
              size="sm"
              isLoading={uploadingAvatar}
              onClick={() => fileInputRef.current?.click()}
            >
              Change photo
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarChange}
            />
          </div>
        </div>

        <dl className="space-y-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-gray-500">Name</dt>
            <dd className="font-medium text-gray-900 dark:text-gray-100">{user.name}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">Email</dt>
            <dd className="flex items-center gap-2 font-medium text-gray-900 dark:text-gray-100">
              {user.email}
              {user.emailVerified ? (
                <Badge tone="green">Verified</Badge>
              ) : (
                <Badge tone="yellow">Unverified</Badge>
              )}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">Role</dt>
            <dd className="font-medium capitalize text-gray-900 dark:text-gray-100">
              {user.role.replace('_', ' ')}
            </dd>
          </div>
        </dl>

        {!user.emailVerified && (
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            isLoading={resendVerification.isPending}
            onClick={() => resendVerification.mutate()}
          >
            Resend verification email
          </Button>
        )}
      </Card>

      <PhoneChangeCard currentPhone={profile?.phone ?? ''} />

      <Card className="max-w-lg p-5">
        <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">
          Notification Settings
        </h2>
        <div className="flex flex-col gap-3">
          {PREFERENCE_LABELS.map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-300">{label}</span>
              <Switch
                checked={profile?.notificationPreferences?.[key] ?? true}
                onChange={(checked) => togglePreference(key, checked)}
              />
            </div>
          ))}
        </div>
      </Card>

      <ChangePasswordCard />
      <DeactivateAccountCard />
    </div>
  );
}
