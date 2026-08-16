import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { confirmEmailVerificationRequest } from '../../../api/auth.api';
import { Spinner } from '../../../components/common/Spinner';
import { useAuth } from '../../../context/AuthContext';

type Status = 'verifying' | 'success' | 'error';

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [status, setStatus] = useState<Status>(token ? 'verifying' : 'error');
  const { refetchMe, isAuthenticated } = useAuth();

  useEffect(() => {
    if (!token) return;
    confirmEmailVerificationRequest(token)
      .then(async () => {
        setStatus('success');
        if (isAuthenticated) await refetchMe();
      })
      .catch(() => setStatus('error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (status === 'verifying') {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <Spinner size="lg" className="text-brand-500" />
        <p className="text-sm text-gray-500">Verifying your email…</p>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="flex flex-col gap-3 text-center">
        <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Email verified</h1>
        <p className="text-sm text-gray-500">Thanks — your email address is now confirmed.</p>
        <Link to="/" className="text-sm font-medium text-brand-600 hover:underline">
          Continue
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 text-center">
      <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
        Verification failed
      </h1>
      <p className="text-sm text-gray-500">This link is invalid or has expired.</p>
      <Link to="/account/profile" className="text-sm font-medium text-brand-600 hover:underline">
        Request a new link from your profile
      </Link>
    </div>
  );
}
