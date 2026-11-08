import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';

import { authConfigRequest, resendRegisterOtpRequest, type RegisterOtpChallenge } from '../../../api/auth.api';
import { Button } from '../../../components/common/Button';
import { Checkbox } from '../../../components/common/Checkbox';
import { Input } from '../../../components/common/Input';
import { useAuth } from '../../../context/AuthContext';
import { otpSchema, registerSchema, type OtpFormValues, type RegisterFormValues } from '../../../validators/auth.validators';
import { GoogleSignInButton } from '../components/GoogleSignInButton';

const GOOGLE_ERROR_MESSAGES: Record<string, string> = {
  access_denied: 'Google sign-up was cancelled.',
  invalid_state: 'Google sign-up session expired. Please try again.',
  email_not_verified: 'Your Google account email is not verified.',
  staff_account_use_admin_login: 'This email belongs to a staff account. Please use the admin sign-in page.',
  account_inactive: 'This account is disabled.',
  account_suspended: 'This account has been suspended. Contact support.',
  google_verification_failed: 'Google sign-up failed. Please try again.',
};

export default function RegisterPage() {
  const { register: registerAccount, completeOtpRegistration, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [formError, setFormError] = useState<string | null>(null);
  const [otpStep, setOtpStep] = useState<(RegisterOtpChallenge & { cooldownRemaining: number }) | null>(
    null,
  );
  const [googleCustomerLoginEnabled, setGoogleCustomerLoginEnabled] = useState(false);
  const googleError = searchParams.get('googleError');

  useEffect(() => {
    authConfigRequest()
      .then((cfg) => setGoogleCustomerLoginEnabled(cfg.googleCustomerLoginEnabled))
      .catch(() => setGoogleCustomerLoginEnabled(false));
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
  } = useForm<RegisterFormValues>({ resolver: zodResolver(registerSchema) });

  const {
    register: registerOtp,
    handleSubmit: handleOtpSubmit,
    formState: { errors: otpErrors, isSubmitting: isVerifyingOtp },
    reset: resetOtpForm,
  } = useForm<OtpFormValues>({ resolver: zodResolver(otpSchema) });

  if (isAuthenticated) return <Navigate to="/" replace />;

  async function onSubmit(values: RegisterFormValues) {
    setFormError(null);
    try {
      const result = await registerAccount(
        values.name,
        values.email,
        values.password,
        values.acceptedTerms,
        values.acceptedPrivacy,
      );
      if (result.otpRequired) {
        setOtpStep({ ...result, cooldownRemaining: result.resendCooldownSeconds });
        resetOtpForm();
        return;
      }
      navigate('/');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Registration failed');
    }
  }

  async function onSubmitOtp(values: OtpFormValues) {
    if (!otpStep) return;
    setFormError(null);
    try {
      await completeOtpRegistration(otpStep.challengeToken, values.code);
      navigate('/');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'OTP verification failed');
    }
  }

  async function onResendOtp() {
    if (!otpStep) return;
    setFormError(null);
    try {
      const result = await resendRegisterOtpRequest(otpStep.challengeToken);
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
        <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Verify your email</h1>
        <p className="text-sm text-gray-500 dark:text-night-muted">
          We sent a verification code to <span className="font-medium">{otpStep.maskedContact}</span>.
          Enter it below to activate your account.
        </p>

        {formError && (
          <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
            {formError}
          </p>
        )}
        {otpStep.devOnlyCode && (
          <p className="rounded bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
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
          Verify &amp; create account
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
            className="text-gray-500 hover:underline dark:text-night-muted"
            onClick={() => {
              setOtpStep(null);
              setFormError(null);
            }}
          >
            Use a different email
          </button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
        Create your account
      </h1>

      {googleError && (
        <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
          {GOOGLE_ERROR_MESSAGES[googleError] ?? 'Google sign-up failed. Please try again.'}
        </p>
      )}
      {formError && (
        <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
          {formError}
        </p>
      )}

      {googleCustomerLoginEnabled && (
        <>
          <GoogleSignInButton flow="customer" origin="register" label="Sign up with Google" />
          <p className="text-center text-xs text-gray-400 dark:text-night-muted">
            By continuing, you agree to our{' '}
            <Link to="/terms" target="_blank" rel="noopener noreferrer" className="underline hover:text-brand-600">
              Terms &amp; Conditions
            </Link>{' '}
            and{' '}
            <Link
              to="/privacy-policy"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-brand-600"
            >
              Privacy Policy
            </Link>
            .
          </p>
          <div className="flex items-center gap-3 text-xs text-gray-400 dark:text-night-muted">
            <div className="h-px flex-1 bg-gray-200 dark:bg-night-elevated" />
            <span>or create an account with email</span>
            <div className="h-px flex-1 bg-gray-200 dark:bg-night-elevated" />
          </div>
        </>
      )}

      <Input
        label="Full name"
        autoComplete="name"
        error={errors.name?.message}
        {...register('name')}
      />
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
        autoComplete="new-password"
        error={errors.password?.message}
        {...register('password')}
      />
      <Input
        label="Confirm password"
        type="password"
        autoComplete="new-password"
        error={errors.confirmPassword?.message}
        {...register('confirmPassword')}
      />

      <div className="flex flex-col gap-2">
        <Checkbox
          label={
            <>
              I agree to the{' '}
              <Link
                to="/terms"
                target="_blank"
                rel="noopener noreferrer"
                // Without this, the click bubbles up to the enclosing
                // <label> (Checkbox.tsx wraps its whole content in one) and
                // toggles the checkbox as an unwanted side effect of
                // following the link.
                onClick={(e) => e.stopPropagation()}
                className="font-medium text-brand-600 hover:underline"
              >
                Terms &amp; Conditions
              </Link>
            </>
          }
          {...register('acceptedTerms')}
        />
        {errors.acceptedTerms && (
          <p className="text-xs text-red-600 dark:text-red-400">{errors.acceptedTerms.message}</p>
        )}
        <Checkbox
          label={
            <>
              I have read the{' '}
              <Link
                to="/privacy-policy"
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="font-medium text-brand-600 hover:underline"
              >
                Privacy Policy
              </Link>
            </>
          }
          {...register('acceptedPrivacy')}
        />
        {errors.acceptedPrivacy && (
          <p className="text-xs text-red-600 dark:text-red-400">{errors.acceptedPrivacy.message}</p>
        )}
      </div>

      <Button variant="gradient" type="submit" isLoading={isSubmitting} className="w-full">
        Create account
      </Button>

      <p className="text-center text-sm text-gray-500 dark:text-night-muted">
        Already have an account?{' '}
        <Link to="/login" className="font-medium text-brand-600 hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
