import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSupabase } from '../../../lib/utils';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function getAuthenticatedUser(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { ok: false as const, response: NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 }) };
  }

  const token = authHeader.substring(7);
  const supabase = getSupabase;
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) {
    return { ok: false as const, response: NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 }) };
  }

  return { ok: true as const, user };
}

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(req);
    if (!auth.ok) return auth.response;

    const { data: profile, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', auth.user.id)
      .maybeSingle();

    if (error || !profile) {
      return NextResponse.json({ success: false, message: 'Profile not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, user: { ...auth.user, ...profile } });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message || 'Server error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(req);
    if (!auth.ok) return auth.response;

    const body = await req.json();
    const full_name = (body.full_name || '').trim();
    const phone = (body.phone || '').trim();
    const address = (body.address || '').trim();

    if (full_name.length > 100) {
      return NextResponse.json({ success: false, message: 'Full name must be 100 characters or less' }, { status: 400 });
    }
    if (phone.length > 20) {
      return NextResponse.json({ success: false, message: 'Phone must be 20 characters or less' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('users')
      .update({ full_name, phone, address })
      .eq('id', auth.user.id)
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, user: { ...auth.user, ...data } });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message || 'Server error' }, { status: 500 });
  }
}
