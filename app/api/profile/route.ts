import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAccount, supabaseAdmin } from '../../../lib/server-auth';

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Server error';
}

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthenticatedAccount(req);
    if (!auth.ok) return auth.response;

    const { data: profile, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', auth.profile.id)
      .maybeSingle();

    if (error || !profile) {
      return NextResponse.json({ success: false, message: 'Profile not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, user: { ...auth.authUser, ...profile } });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, message: getErrorMessage(err) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await getAuthenticatedAccount(req);
    if (!auth.ok) return auth.response;

    const body = await req.json();
    const full_name = (body.full_name || '').trim();
    const phone = (body.phone || '').trim();
    const address = (body.address || '').trim();
    const business_name = (body.business_name || '').trim();
    const profile_pic = (body.profile_pic || '').trim();

    if (full_name.length > 100) {
      return NextResponse.json({ success: false, message: 'Full name must be 100 characters or less' }, { status: 400 });
    }
    if (phone.length > 20) {
      return NextResponse.json({ success: false, message: 'Phone must be 20 characters or less' }, { status: 400 });
    }
    if (business_name.length > 120) {
      return NextResponse.json({ success: false, message: 'Business name must be 120 characters or less' }, { status: 400 });
    }
    if (profile_pic.length > 255) {
      return NextResponse.json({ success: false, message: 'Profile image URL is too long' }, { status: 400 });
    }

    const updates: Record<string, unknown> = {
      full_name,
      phone,
      address,
      ...(auth.profile.role === 'seller' ? { business_name } : {}),
    };

    if (profile_pic) {
      updates.profile_pic = profile_pic;
    }

    const { data, error } = await supabaseAdmin
      .from('users')
      .update(updates)
      .eq('id', auth.profile.id)
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, user: { ...auth.authUser, ...data } });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, message: getErrorMessage(err) }, { status: 500 });
  }
}
