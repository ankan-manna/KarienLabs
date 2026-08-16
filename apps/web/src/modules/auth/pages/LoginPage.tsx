import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';

import { authConfigRequest, resendLoginOtpRequest, type LoginOtpChallenge } from '../../../api/auth.api';
import { Button } from '../../../components/common/Button';
import { Checkbox } from '../../../components/common/Checkbox';
import { Input } from '../../../components/common/Input';
import { useAuth } from '../../../context/AuthContext';
import { loginSchema, otpSchema, type LoginFormValues, type OtpFormValues } from '../../../validators/auth.validators';
import { GoogleSignInButton } from '../components/GoogleSignInButton';

const GOOGLE_ERROR_MESSAGES: Record<string, string> = {
  access_denied: 'Google sign-in was cancelled.',
  invalid_state: 'Google sign-in session expired. Please try again.',
  email_not_verified: 'Your Google account email is not verified.',
  no_matching_admin_account:
    'No authorized admin account exists for this Google identity. Ask a super admin to create one first.',
  not_admin_role: 'This Google account is not authorized for admin access.',
  account_inactive: 'This account is disabled.',
  account_suspended: 'This account has been suspended. Contact a super admin.',
  google_verification_failed: 'Google sign-in failed. Please try again.',
};

export default function LoginPage() {
  const { login, completeOtpLogin, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [formError, setFormError] = useState<string | null>(null);
  const [otpStep, setOtpStep] = useState<(LoginOtpChallenge & { cooldownRemaining: number }) | null>(
    null,
  );
  const [googleAdminLoginEnabled, setGoogleAdminLoginEnabled] = useState(false);

  const googleError = searchParams.get('googleError');

  useEffect(() => {
    authConfigRequest()
      .then((cfg) => setGoogleAdminLoginEnabled(cfg.googleAdminLoginEnabled))
      .catch(() => setGoogleAdminLoginEnabled(false));
  }, []);

  useEffect(() => {
    if (!otpStep || otpStep.cooldownRemaining <= 0) return;
    const timer = setInterval(() => {
      setOtpStep((prev) => (prev ? { ...prev, cooldownRemaining: Math.max(0, prev.cooldownRemaining - 1) } : prev));
    }, 1000);
    return () => clearInterval(timer);
  }, [otpStep]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { rememberMe: true },
  });

  const {
    register: registerOtp,
    handleSubmit: handleOtpSubmit,
    formState: { errors: otpErrors, isSubmitting: isVerifyingOtp },
    reset: resetOtpForm,
  } = useForm<OtpFormValues>({ resolver: zodResolver(otpSchema) });

  if (isAuthenticated) {
    const from = (location.state as { from?: string })?.from ?? '/';
    return <Navigate to={from} replace />;
  }

  async function onSubmit(values: LoginFormValues) {
    setFormError(null);
    try {
      const result = await login(values.email, values.password, values.rememberMe);
      if (result.otpRequired) {
        setOtpStep({ ...result, cooldownRemaining: result.resendCooldownSeconds });
        resetOtpForm();
        return;
      }
      navigate((location.state as { from?: string })?.from ?? '/');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Login failed');
    }
  }

  async function onSubmitOtp(values: OtpFormValues) {
    if (!otpStep) return;
    setFormError(null);
    try {
      await completeOtpLogin(otpStep.challengeToken, values.code);
      navigate((location.state as { from?: string })?.from ?? '/');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'OTP verification failed');
    }
  }

  async function onResendOtp() {
    if (!otpStep) return;
    setFormError(null);
    try {
      const result = await resendLoginOtpRequest(otpStep.challengeToken);
      setOtpStep((prev) =>
        prev
          ? {
              ...prev,
              maskedContact: result.maskedContact,
              expiresAt: result.expiresAt,
              resendCooldownSeconds: result.resendCooldownSeconds,
              cooldownRemaining: result.resendCooldownSeconds,
              devOnlyCode: result.devOnlyCode,
            }
          : prev,
      );
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not resend OTP');
    }
  }

  if (otpStep) {
    return (
      <form onSubmit={handleOtpSubmit(onSubmitOtp)} className="flex flex-col gap-4">
        <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Verify your identity</h1>
        <p className="text-sm text-gray-500">
          We sent a verification code to <span className="font-medium">{otpStep.maskedContact}</span>.
        </p>

        {formError && (
          <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/20">
            {formError}
          </p>
        )}
        {otpStep.devOnlyCode && (
          <p className="rounded bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-900/20">
            Dev-mode only — code: <span className="font-mono font-semibold">{otpStep.devOnlyCode}</span>
          </p>
        )}

        <Input
          label="Verification code"
          inputMode="numeric"
          autoComplete="one-time-code"
          error={otpErrors.code?.message}
          {...registerOtp('code')}
        />

        <Button variant="gradient" type="submit" isLoading={isVerifyingOtp} className="w-full">
          Verify &amp; sign in
        </Button>

        <div className="flex items-center justify-between text-sm">
          <button
            type="button"
            className="font-medium text-brand-600 hover:underline disabled:cursor-not-allowed disabled:text-gray-400 disabled:no-underline"
            disabled={otpStep.cooldownRemaining > 0}
            onClick={onResendOtp}
          >
            {otpStep.cooldownRemaining > 0 ? `Resend code in ${otpStep.cooldownRemaining}s` : 'Resend code'}
          </button>
          <button
            type="button"
            className="text-gray-500 hover:underline"
            onClick={() => {
              setOtpStep(null);
              setFormError(null);
            }}
          >
            Use a different account
          </button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Sign in</h1>

      {googleError && (
        <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/20">
          {GOOGLE_ERROR_MESSAGES[googleError] ?? 'Google sign-in failed. Please try again.'}
        </p>
      )}
      {formError && (
        <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/20">
          {formError}
        </p>
      )}

      <Input
        label="Email"
        type="email"
        autoComplete="email"
        error={errors.email?.message}
        {...register('email')}
      />
      <Input
        label="Password"
        type="password"
        autoComplete="current-password"
        error={errors.password?.message}
        {...register('password')}
      />

      <div className="flex items-center justify-between">
        <Checkbox label="Remember me" {...register('rememberMe')} />
        <Link to="/forgot-password" className="text-sm text-brand-600 hover:underline">
          Forgot password?
        </Link>
      </div>

      <Button variant="gradient" type="submit" isLoading={isSubmitting} className="w-full">
        Sign in
      </Button>

      {googleAdminLoginEnabled && (
        <>
          <div className="flex items-center gap-3 text-xs text-gray-400">
            <div className="h-px flex-1 bg-gray-200 dark:bg-gray-800" />
            <span>Admin sign-in</span>
            <div className="h-px flex-1 bg-gray-200 dark:bg-gray-800" />
          </div>
          <GoogleSignInButton />
        </>
      )}

      <p className="text-center text-sm text-gray-500">
        Don&apos;t have an account?{' '}
        <Link to="/register" className="font-medium text-brand-600 hover:underline">
          Create one
        </Link>
      </p>
    </form>
  );
}
