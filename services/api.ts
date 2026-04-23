const API_BASE = '/api/';
const LOCAL_AUTH_SESSION = 'supabase_session';
const LOCAL_USER_INFO = 'shopcorner_user';

function getSessionId(): string {
  if (typeof window === 'undefined') return '';
  let id = localStorage.getItem('shopcorner_session_id');
  if (!id) {
    id = `sid_${Math.random().toString(36).slice(2)}_${Date.now()}`;
    localStorage.setItem('shopcorner_session_id', id);
  }
  return id;
}

function getAuthHeaders(includeJsonContentType = true): HeadersInit {
  if (typeof window === 'undefined') return {};
  
  // Try to get Supabase session
  let accessToken = '';
  try {
    const sessionStr = localStorage.getItem(LOCAL_AUTH_SESSION);
    if (sessionStr) {
      const session = JSON.parse(sessionStr);
      accessToken = session.access_token || '';
    }
  } catch (err) {
    console.error('Error parsing session:', err);
  }

  const headers: Record<string, string> = {
    'X-Requested-With': 'XMLHttpRequest',
    'X-Session-Id': getSessionId(),
  };

  if (includeJsonContentType) {
    headers['Content-Type'] = 'application/json';
  }

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  return headers;
}

export async function safeFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  // Removes .js extension if it exists
  const cleanEndpoint = endpoint.replace(/\.js(\?|$)/, '$1');
  
  // Prevent double prefixing if API_BASE is /api/ and endpoint is /api/products
  const url = cleanEndpoint.startsWith(API_BASE) || cleanEndpoint.startsWith('/api') 
    ? cleanEndpoint 
    : `${API_BASE}${cleanEndpoint.replace(/^\//, '')}`;
  
  const isFormDataRequest = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const defaultHeaders = getAuthHeaders(!isFormDataRequest);

  const response = await fetch(url, {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP ${response.status} ${response.statusText}: ${errorText}`);
  }
  
  return response.json() as Promise<T>;
}

// Helpers for auth
export function storeAuthSession(session: unknown) {
  if (typeof window === 'undefined' || !session) return;
  localStorage.setItem(LOCAL_AUTH_SESSION, JSON.stringify(session));
}

export function storeAuthUser(user: unknown) {
  if (typeof window === 'undefined' || !user) return;
  localStorage.setItem(LOCAL_USER_INFO, JSON.stringify(user));
}

export function storeAuthState(session: unknown, user: unknown) {
  storeAuthSession(session);
  storeAuthUser(user);
}

export function getStoredUser() {
  if (typeof window === 'undefined') return null;
  try {
    return JSON.parse(localStorage.getItem(LOCAL_USER_INFO) || 'null');
  } catch {
    return null;
  }
}

export function handleLogoutLocal() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(LOCAL_AUTH_SESSION);
  localStorage.removeItem(LOCAL_USER_INFO);
}

export async function getCurrentUserWithToken(accessToken: string) {
  const response = await fetch('/api/auth', {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'X-Requested-With': 'XMLHttpRequest',
      'X-Session-Id': getSessionId(),
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to load user: ${response.status}`);
  }

  const result = await response.json() as { success: boolean; isLoggedIn: boolean; user?: any };
  if (result.success && result.isLoggedIn && result.user) {
    storeAuthUser(result.user);
    return result.user;
  }

  handleLogoutLocal();
  return null;
}

export async function login(email: string, password: string) {
  const response = await safeFetch<{ success: boolean; session?: any; user?: any; redirect?: string; message?: string }>('/auth', {
    method: 'POST',
    body: JSON.stringify({ email, password, mode: 'login' }),
  });
  if (response.success && response.session && response.user) {
    storeAuthState(response.session, response.user);
    return { success: true, redirect: response.redirect };
  }
  return { success: false, message: response.message };
}

export async function signup(email: string, password: string, full_name: string, phone: string, address: string) {
  const response = await safeFetch<{
    success: boolean;
    session?: any;
    user?: any;
    redirect?: string;
    message?: string;
    requiresEmailVerification?: boolean;
  }>('/auth', {
    method: 'POST',
    body: JSON.stringify({ email, password, full_name, phone, address, mode: 'signup' }),
  });
  if (response.success && response.session && response.user) {
    storeAuthState(response.session, response.user);
    return { success: true, redirect: response.redirect };
  }
  if (response.success && response.requiresEmailVerification) {
    return {
      success: true,
      redirect: '/auth/callback',
      message: response.message,
      requiresEmailVerification: true,
    };
  }
  return { success: false, message: response.message };
}

export async function logout() {
  await safeFetch('/auth', {
    method: 'POST',
    body: JSON.stringify({ mode: 'logout' }),
  });
  handleLogoutLocal();
}

/**
 * Fetch the current user from the server
 * Always gets fresh data from the database and validates session
 * Returns null if user was deleted or session is invalid
 */
export async function getCurrentUserFromServer() {
  if (typeof window === 'undefined') return null;
  try {
    const result = await safeFetch<{ success: boolean; isLoggedIn: boolean; user?: any }>('/auth');
    if (result.success && result.isLoggedIn && result.user) {
      // Update localStorage with fresh data
      localStorage.setItem(LOCAL_USER_INFO, JSON.stringify(result.user));
      return result.user;
    } else {
      // User not logged in or deleted - clear localStorage
      console.warn('User not logged in or was deleted from database');
      handleLogoutLocal();
      return null;
    }
  } catch (err) {
    console.error('Error fetching current user:', err);
    handleLogoutLocal();
    return null;
  }
}

function isAbsoluteImageUrl(value: string) {
  return /^(https?:)?\/\//i.test(value) || value.startsWith('data:') || value.startsWith('blob:');
}

function sanitizeImageValue(value?: string | null) {
  return String(value || '').trim().replace(/\\/g, '/').replace(/^['"]+|['"]+$/g, '');
}

function parseImageList(value?: string | string[] | null) {
  if (Array.isArray(value)) {
    return value.map((image) => sanitizeImageValue(String(image))).filter(Boolean);
  }

  const trimmed = String(value || '').trim();
  if (!trimmed) return [];

  if (trimmed.startsWith('[')) {
    try {
      const jsonImages = JSON.parse(trimmed);
      if (Array.isArray(jsonImages)) {
        return jsonImages.map((image) => sanitizeImageValue(String(image))).filter(Boolean);
      }
    } catch {
      return trimmed.split(',').map((image) => sanitizeImageValue(image)).filter(Boolean);
    }
  }

  if (trimmed.includes(',')) {
    return trimmed.split(',').map((image) => sanitizeImageValue(image)).filter(Boolean);
  }

  return [sanitizeImageValue(trimmed)].filter(Boolean);
}

export function resolveProductImagePath(value?: string | null) {
  const normalized = parseImageList(value)[0] || '';
  if (!normalized) return '';
  if (isAbsoluteImageUrl(normalized)) return normalized;
  if (normalized.startsWith('/')) return normalized;
  if (normalized.startsWith('public/')) return `/${normalized.slice('public/'.length)}`;
  if (normalized.startsWith('upload/')) return `/${normalized}`;
  if (normalized.includes('/')) return `/${normalized}`;
  return `/upload/${normalized}`;
}

export function normalizeProductImages(product?: { image?: string | null; images?: string | string[] | null } | null) {
  if (!product) return [];

  const imageColumnImages = parseImageList(product.image);
  const parsedImages = parseImageList(product.images);
  const allImages = [...imageColumnImages, ...parsedImages];
  const uniqueImages = Array.from(new Set(allImages.map(resolveProductImagePath).filter(Boolean)));

  return uniqueImages;
}
