import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSupabase } from './utils';

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export type AccountProfile = {
  id: string;
  email: string;
  full_name?: string | null;
  phone?: string | null;
  address?: string | null;
  role?: string | null;
  account_status?: string | null;
  seller_approval_status?: string | null;
  business_name?: string | null;
  profile_pic?: string | null;
};

export async function getAuthenticatedAccount(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return {
      ok: false as const,
      response: NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 }),
    };
  }

  const token = authHeader.substring(7);
  const supabase = getSupabase;
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return {
      ok: false as const,
      response: NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 }),
    };
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('users')
    .select('id, email, full_name, phone, address, role, account_status, seller_approval_status, business_name, profile_pic')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError || !profile) {
    return {
      ok: false as const,
      response: NextResponse.json({ success: false, message: 'Account profile not found' }, { status: 403 }),
    };
  }

  return {
    ok: true as const,
    authUser: user,
    profile: profile as AccountProfile,
    account: { ...user, ...profile },
  };
}

export function hasRole(profile: Pick<AccountProfile, 'role'> | null | undefined, roles: string[]) {
  return roles.includes(String(profile?.role || '').toLowerCase());
}

export function forbiddenResponse(message = 'Forbidden') {
  return NextResponse.json({ success: false, message }, { status: 403 });
}
