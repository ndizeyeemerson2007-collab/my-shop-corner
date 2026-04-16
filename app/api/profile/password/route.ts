import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSupabase } from '../../../../lib/utils';

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

export async function PATCH(req: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(req);
    if (!auth.ok) return auth.response;

    const body = await req.json();
    const currentPassword = String(body.current_password || '');
    const newPassword = String(body.new_password || '');
    const confirmPassword = String(body.confirm_password || '');

    if (!currentPassword || !newPassword || !confirmPassword) {
      return NextResponse.json({ success: false, message: 'All password fields are required' }, { status: 400 });
    }

    if (newPassword.length < 6) {
      return NextResponse.json({ success: false, message: 'New password must be at least 6 characters' }, { status: 400 });
    }

    if (newPassword !== confirmPassword) {
      return NextResponse.json({ success: false, message: 'New password and confirmation do not match' }, { status: 400 });
    }

    if (!auth.user.email) {
      return NextResponse.json({ success: false, message: 'User email not found' }, { status: 400 });
    }

    const supabase = getSupabase;
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: auth.user.email,
      password: currentPassword,
    });

    if (verifyError) {
      return NextResponse.json({ success: false, message: 'Current password is incorrect' }, { status: 400 });
    }

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(auth.user.id, {
      password: newPassword,
    });

    if (updateError) {
      return NextResponse.json({ success: false, message: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Password updated successfully' });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message || 'Server error' }, { status: 500 });
  }
}
