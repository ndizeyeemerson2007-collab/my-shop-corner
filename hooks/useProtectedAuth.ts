'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUserFromServer, handleLogoutLocal } from '../services/api';
import { User } from '../types';

type UseProtectedAuthOptions = {
  redirectTo?: string;
  requiredRole?: string;
};

type ProtectedAuthState = {
  loading: boolean;
  user: User | null;
  accessBlocked: boolean;
  message: string;
};

const EMAIL_VERIFICATION_MESSAGE = 'Please verify your email before accessing this page';
const SELLER_APPROVAL_MESSAGE = 'Your seller account is waiting for admin approval.';
const SUSPENDED_ACCOUNT_MESSAGE = 'This account is suspended. Please contact the admin team.';
const DEACTIVATED_ACCOUNT_MESSAGE = 'This account has been deactivated. Please contact the admin team.';

export function useProtectedAuth(options: UseProtectedAuthOptions = {}) {
  const { redirectTo = '/login', requiredRole } = options;
  const router = useRouter();
  const [state, setState] = useState<ProtectedAuthState>({
    loading: true,
    user: null,
    accessBlocked: false,
    message: '',
  });

  useEffect(() => {
    let active = true;

    const loadUser = async () => {
      setState((current) => ({ ...current, loading: true, message: '' }));

      const serverUser = await getCurrentUserFromServer();
      if (!active) return;

      if (!serverUser) {
        handleLogoutLocal();
        window.dispatchEvent(new CustomEvent('userLogout'));
        setState({
          loading: false,
          user: null,
          accessBlocked: false,
          message: '',
        });
        router.replace(redirectTo);
        return;
      }

      if (!serverUser.email_confirmed_at) {
        setState({
          loading: false,
          user: serverUser,
          accessBlocked: true,
          message: EMAIL_VERIFICATION_MESSAGE,
        });
        return;
      }

      const accountStatus = String(serverUser.account_status || 'active').toLowerCase();
      const sellerApprovalStatus = String(serverUser.seller_approval_status || (serverUser.role === 'seller' ? 'pending' : 'approved')).toLowerCase();

      if (accountStatus === 'suspended') {
        setState({
          loading: false,
          user: serverUser,
          accessBlocked: true,
          message: SUSPENDED_ACCOUNT_MESSAGE,
        });
        return;
      }

      if (accountStatus === 'deactivated') {
        setState({
          loading: false,
          user: serverUser,
          accessBlocked: true,
          message: DEACTIVATED_ACCOUNT_MESSAGE,
        });
        return;
      }

      if (requiredRole === 'seller' && sellerApprovalStatus !== 'approved') {
        setState({
          loading: false,
          user: serverUser,
          accessBlocked: true,
          message: sellerApprovalStatus === 'rejected'
            ? 'Your seller request was rejected. Please contact the admin team.'
            : SELLER_APPROVAL_MESSAGE,
        });
        return;
      }

      if (requiredRole && serverUser.role !== requiredRole) {
        setState({
          loading: false,
          user: serverUser,
          accessBlocked: true,
          message: 'You do not have permission to access this page',
        });
        return;
      }

      setState({
        loading: false,
        user: serverUser,
        accessBlocked: false,
        message: '',
      });
    };

    loadUser();

    return () => {
      active = false;
    };
  }, [redirectTo, requiredRole, router]);

  return state;
}

export const protectedRouteEmailMessage = EMAIL_VERIFICATION_MESSAGE;
