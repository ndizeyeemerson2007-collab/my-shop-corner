const API_BASE = '/api/';
const LOCAL_AUTH_TOKEN = 'shopcorner_token';
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

function getAuthHeaders(): HeadersInit {
  if (typeof window === 'undefined') return {};
  const token = localStorage.getItem(LOCAL_AUTH_TOKEN) || '';
  const headers: Record<string, string> = {
    'X-Requested-With': 'XMLHttpRequest',
    'X-Session-Id': getSessionId(),
    'Content-Type': 'application/json'
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
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
  
  const defaultHeaders = getAuthHeaders();

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
  localStorage.removeItem(LOCAL_AUTH_TOKEN);
  localStorage.removeItem(LOCAL_USER_INFO);
}
