import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';

import {
  authConfigRequest,
  forgotPasswordRequest,
  forgotPasswordVerifyOtpRequest,
} from '../../../api/auth.api';
import { Button } from '../../../components/common/Button';
import { Input } from '../../../components/common/Input';
import {
  forgotPasswordSchema,
  otpSchema,
  type ForgotPasswordFormValues,
  type OtpFormValues,
} from '../../../validators/auth.validators';

type Step = 'request' | 'otp' | 'sent';

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('request');
  const [otpEnabled, setOtpEnabled] = useState(false);
  const [email, setEmail] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    authConfigRequest()
      .then((cfg) => setOtpEnabled(cfg.otpPasswordResetEnabled))
      .catch(() => setOtpEnabled(false));
  }, []);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordFormValues>({ resolver: zodResolver(forgotPasswordSchema) });

  const {
    register: registerOtp,
    handleSubmit: handleOtpSubmit,
    formState: { errors: otpErrors, isSubmitting: isVerifyingOtp },
  } = useForm<OtpFormValues>({ resolver: zodResolver(otpSchema) });

  async function onSubmit(values: ForgotPasswordFormValues) {
    setFormError(null);
    await forgotPasswordRequest(values.email);
    setEmail(values.email);
    // Config-driven: the OTP step only makes sense when the backend actually
    // sent an OTP rather than an emailed link — decided ahead of time via
    // `authConfigRequest`, not from this (deliberately generic) response.
    setStep(otpEnabled ? 'otp' : 'sent');
  }

  async function onSubmitOtp(values: OtpFormValues) {
    setFormError(null);
    try {
      const { resetSessionToken } = await forgotPasswordVerifyOtpRequest(email, values.code);
      navigate(`/reset-password?resetSessionToken=${encodeURIComponent(resetSessionToken)}`);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'OTP verification failed');
    }
  }

  if (step === 'sent') {
    return (
      <div className="flex flex-col gap-3 text-center">
        <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Check your email</h1>
        <p className="text-sm text-gray-500">
          If an account exists for that email, we&apos;ve sent a link to reset your password.
        </p>
        <Link to="/login" className="text-sm font-medium text-brand-600 hover:underline">
          Back to sign in
        </Link>
      </div>
    );
  }

  if (step === 'otp') {
    return (
      <form onSubmit={handleOtpSubmit(onSubmitOtp)} className="flex flex-col gap-4">
        <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Enter verification code</h1>
        <p className="text-sm text-gray-500">
          If an account exists for <span className="font-medium">{email}</span>, we&apos;ve sent a code
          to it.
        </p>

        {formError && (
          <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/20">
            {formError}
          </p>
        )}

        <Input
          label="Verification code"
          inputMode="numeric"
          autoComplete="one-time-code"
          error={otpErrors.code?.message}
          {...registerOtp('code')}
        />

        <Button type="submit" isLoading={isVerifyingOtp} className="w-full">
          Verify code
        </Button>

        <p className="text-center text-sm text-gray-500">
          <Link to="/login" className="font-medium text-brand-600 hover:underline">
            Back to sign in
          </Link>
        </p>
      </form>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Forgot password</h1>
      <p className="text-sm text-gray-500">
        {otpEnabled
          ? "Enter your email and we'll send you a verification code."
          : "Enter your email and we'll send you a reset link."}
      </p>

      <Input
        label="Email"
        type="email"
        autoComplete="email"
        error={errors.email?.message}
        {...register('email')}
      />

      <Button type="submit" isLoading={isSubmitting} className="w-full">
        {otpEnabled ? 'Send code' : 'Send reset link'}
      </Button>

      <p className="text-center text-sm text-gray-500">
        <Link to="/login" className="font-medium text-brand-600 hover:underline">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
