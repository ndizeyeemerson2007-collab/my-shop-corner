import { supabase } from './supabase';

export { supabase as getSupabase };

/**
 * Get the current user from localStorage session
 */
export function getCurrentUser() {
  if (typeof window === 'undefined') return null;
  try {
    const userStr = localStorage.getItem('shopcorner_user');
    return userStr ? JSON.parse(userStr) : null;
  } catch (err) {
    console.error('Error parsing user from localStorage:', err);
    return null;
  }
}

/**
 * Get the current session from localStorage
 */
export function getCurrentSession() {
  if (typeof window === 'undefined') return null;
  try {
    const sessionStr = localStorage.getItem('supabase_session');
    return sessionStr ? JSON.parse(sessionStr) : null;
  } catch (err) {
    console.error('Error parsing session from localStorage:', err);
    return null;
  }
}

/**
 * Get auth header for API requests
 */
export function getAuthHeader() {
  const session = getCurrentSession();
  if (!session?.access_token) return {};
  return {
    'Authorization': `Bearer ${session.access_token}`,
  };
}