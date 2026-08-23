import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';

import {
  confirmAddressMobileOtp,
  requestAddressMobileOtp,
  type Address,
  type AddressMobileOtpChallenge,
} from '../../api/addresses.api';
import { toast } from '../../utils/toast';
import { otpCodeSchema, type OtpCodeFormValues } from '../../validators/address.validators';
import { Button } from '../common/Button';
import { Input } from '../common/Input';

/**
 * Inline mobile-OTP verification for one address card — its own small form.
 * Shared between the account Addresses page and Checkout ( 1: checkout
 * must show the SAME verification flow in place, not a second implementation
 * of it, since checkout gates on this exact per-address `mobileVerified` flag).
 */
export function MobileVerifyPanel({ address, onDone }: { address: Address; onDone: () => void }) {
  const [challenge, setChallenge] = useState<(AddressMobileOtpChallenge & { cooldownRemaining: number }) | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const {
    register: registerOtp,
    handleSubmit: handleOtpSubmit,
    formState: { errors: otpErrors, isSubmitting: isVerifying },
    reset: resetOtpForm,
  } = useForm<OtpCodeFormValues>({ resolver: zodResolver(otpCodeSchema) });

  const requestMutation = useMutation({
    mutationFn: () => requestAddressMobileOtp(address._id),
    onSuccess: (result) => {
      setChallenge({ ...result, cooldownRemaining: result.resendCooldownSeconds });
      resetOtpForm();
      setError(null);
    },
    onError: (err: Error) => setError(err.message),
  });

  const confirmMutation = useMutation({
    mutationFn: (code: string) => confirmAddressMobileOtp(address._id, code),
    onSuccess: () => {
      toast.success('Phone number verified');
      onDone();
    },
    onError: (err: Error) => setError(err.message),
  });

  // Guards against React StrictMode's deliberate double-invocation of
  // mount effects in development: without this, two OTP requests fire on
  // mount, and the dev-mode code shown on screen can end up being from the
  // request that ISN'T the most-recently-issued one the backend actually
  // checks against (otp.service.ts's verifyOtp matches the newest
  // unconsumed token) — a real, reproducible "Incorrect OTP" on the very
  // first attempt with the exact code displayed. `useRef` (not state)
  // because it must survive the synthetic unmount/remount StrictMode does
  // to the same component instance without itself triggering a re-render.
  const hasRequestedRef = useRef(false);
  useEffect(() => {
    if (hasRequestedRef.current) return;
    hasRequestedRef.current = true;
    requestMutation.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!challenge || challenge.cooldownRemaining <= 0) return;
    const timer = setInterval(() => {
      setChallenge((prev) => (prev ? { ...prev, cooldownRemaining: Math.max(0, prev.cooldownRemaining - 1) } : prev));
    }, 1000);
    return () => clearInterval(timer);
  }, [challenge]);

  return (
    <div className="mt-3 flex flex-col gap-2 rounded border border-gray-200 p-3 dark:border-gray-700">
      {requestMutation.isPending && !challenge ? (
        <p className="text-xs text-gray-500">Sending verification code…</p>
      ) : challenge ? (
        <>
          <p className="text-xs text-gray-500">
            Code sent to <span className="font-medium">{challenge.maskedContact}</span>
          </p>
          {challenge.devOnlyCode && (
            <p className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-700 dark:bg-amber-900/20">
              Dev-mode only — code: <span className="font-mono font-semibold">{challenge.devOnlyCode}</span>
            </p>
          )}
          {error && <p className="text-xs text-red-600">{error}</p>}
          <form
            onSubmit={handleOtpSubmit((values) => confirmMutation.mutate(values.code))}
            className="flex items-end gap-2"
          >
            <Input
              label="Verification code"
              inputMode="numeric"
              autoComplete="one-time-code"
              error={otpErrors.code?.message}
              {...registerOtp('code')}
            />
            <Button type="submit" isLoading={isVerifying || confirmMutation.isPending} size="sm">
              Verify
            </Button>
          </form>
          <div className="flex items-center justify-between text-xs">
            <button
              type="button"
              className="font-medium text-brand-600 hover:underline disabled:cursor-not-allowed disabled:text-gray-400 disabled:no-underline"
              disabled={challenge.cooldownRemaining > 0 || requestMutation.isPending}
              onClick={() => requestMutation.mutate()}
            >
              {challenge.cooldownRemaining > 0 ? `Resend code in ${challenge.cooldownRemaining}s` : 'Resend code'}
            </button>
            <button type="button" className="text-gray-500 hover:underline" onClick={onDone}>
              Cancel
            </button>
          </div>
        </>
      ) : (
        error && <p className="text-xs text-red-600">{error}</p>
      )}
    </div>
  );
}
