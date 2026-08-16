import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useSearchParams } from 'react-router-dom';

import { resetPasswordRequest } from '../../../api/auth.api';
import { Button } from '../../../components/common/Button';
import { Input } from '../../../components/common/Input';
import {
  resetPasswordSchema,
  type ResetPasswordFormValues,
} from '../../../validators/auth.validators';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const resetSessionToken = searchParams.get('resetSessionToken') ?? '';
  const [done, setDone] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordFormValues>({ resolver: zodResolver(resetPasswordSchema) });

  if (!token && !resetSessionToken) {
    return (
      <p className="text-sm text-gray-500">
        This reset link is missing its token. Please use the link from your email, or{' '}
        <Link to="/forgot-password" className="font-medium text-brand-600 hover:underline">
          request a new one
        </Link>
        .
      </p>
    );
  }

  async function onSubmit(values: ResetPasswordFormValues) {
    setFormError(null);
    try {
      await resetPasswordRequest(
        resetSessionToken ? { resetSessionToken } : { token },
        values.password,
      );
      setDone(true);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Reset failed');
    }
  }

  if (done) {
    return (
      <div className="flex flex-col gap-3 text-center">
        <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Password updated</h1>
        <p className="text-sm text-gray-500">You can now sign in with your new password.</p>
        <Link to="/login" className="text-sm font-medium text-brand-600 hover:underline">
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
        Reset your password
      </h1>

      {formError && (
        <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/20">
          {formError}
        </p>
      )}

      <Input
        label="New password"
        type="password"
        autoComplete="new-password"
        error={errors.password?.message}
        {...register('password')}
      />
      <Input
        label="Confirm new password"
        type="password"
        autoComplete="new-password"
        error={errors.confirmPassword?.message}
        {...register('confirmPassword')}
      />

      <Button type="submit" isLoading={isSubmitting} className="w-full">
        Reset password
      </Button>
    </form>
  );
}
