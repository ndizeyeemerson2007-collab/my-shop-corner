'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AuthStatusCard from '../../components/AuthStatusCard';
import { useProtectedAuth } from '../../hooks/useProtectedAuth';

export default function DashboardPage() {
  const router = useRouter();
  const { loading, user, accessBlocked, message } = useProtectedAuth();

  useEffect(() => {
    if (loading || accessBlocked || !user) {
      return;
    }

    if (user.role === 'admin') {
      router.replace('/admin');
      return;
    }

    router.replace('/profile');
  }, [accessBlocked, loading, router, user]);

  if (loading) {
    return (
      <AuthStatusCard
        title="Loading dashboard"
        message="Checking your session and preparing your account."
        loading
      />
    );
  }

  if (accessBlocked) {
    return (
      <AuthStatusCard
        title="Verification required"
        message={message}
      />
    );
  }

  return (
    <AuthStatusCard
      title="Opening your dashboard"
      message="Your account is verified. Redirecting now."
      loading
    />
  );
}
