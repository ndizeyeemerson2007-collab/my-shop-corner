'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import AuthStatusCard from '../../../components/AuthStatusCard';
import { supabase } from '../../../lib/supabase';
import { getCurrentUserWithToken, handleLogoutLocal, storeAuthSession } from '../../../services/api';

export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState('Verifying your email and creating your session.');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const resolveCallback = async () => {
      const authCode = searchParams.get('code');
      const callbackError = searchParams.get('error_description') || searchParams.get('error');

      if (callbackError) {
        if (!active) return;
        handleLogoutLocal();
        setMessage('This verification link is invalid or has expired. Please request a new one.');
        setLoading(false);
        return;
      }

      try {
        if (authCode) {
          const { error } = await supabase.auth.exchangeCodeForSession(authCode);
          if (error) {
            throw error;
          }
        }

        const { data, error } = await supabase.auth.getSession();
        if (error) {
          throw error;
        }

        if (!data.session?.access_token) {
          if (!active) return;
          handleLogoutLocal();
          setMessage('No active session was created. This verification link may have expired.');
          setLoading(false);
          return;
        }

        storeAuthSession(data.session);
        const currentUser = await getCurrentUserWithToken(data.session.access_token);
        if (!currentUser) {
          if (!active) return;
          handleLogoutLocal();
          setMessage('We created a session, but could not load your account. Please sign in again.');
          setLoading(false);
          return;
        }
        if (!active) return;

        window.dispatchEvent(new CustomEvent('userLogin'));
        setMessage('Email verified. Redirecting to your dashboard.');
        router.replace(
          currentUser.role === 'seller'
            ? '/seller'
            : '/dashboard'
        );
      } catch (error) {
        console.error('Auth callback error:', error);
        if (!active) return;
        handleLogoutLocal();
        setMessage('We could not verify this link. Please try again or request a new verification email.');
        setLoading(false);
      }
    };

    void resolveCallback();

    return () => {
      active = false;
    };
  }, [router, searchParams]);

  return (
    <AuthStatusCard
      title="Verifying your email"
      message={message}
      loading={loading}
    />
  );
}
