import { NextRequest, NextResponse } from 'next/server';
import { forbiddenResponse, getAuthenticatedAccount, hasRole, supabaseAdmin } from '../../../../lib/server-auth';
import { z } from 'zod';
const adminUserActionSchema = z.object({
  user_id: z.string().uuid(),
  action: z.enum(['approve_seller', 'reject_seller', 'suspend', 'reactivate', 'deactivate']),
});

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Internal Server Error';
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await getAuthenticatedAccount(request);
    if (!auth.ok) return auth.response;
    if (!hasRole(auth.profile, ['admin'])) {
      return forbiddenResponse();
    }

    const parsed = adminUserActionSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ success: false, message: 'Invalid admin user action.' }, { status: 400 });
    }

    const { user_id: userId, action } = parsed.data;

    if (userId === auth.profile.id) {
      return NextResponse.json({ success: false, message: 'You cannot change your own admin account here.' }, { status: 400 });
    }

    const { data: existingUser, error: existingError } = await supabaseAdmin
      .from('users')
      .select('id, role, account_status, seller_approval_status')
      .eq('id', userId)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json({ success: false, message: existingError.message }, { status: 500 });
    }

    if (!existingUser) {
      return NextResponse.json({ success: false, message: 'User not found.' }, { status: 404 });
    }

    const updates: Record<string, string> = {};

    switch (action) {
      case 'approve_seller':
        updates.seller_approval_status = 'approved';
        updates.account_status = 'active';
        break;
      case 'reject_seller':
        updates.seller_approval_status = 'rejected';
        break;
      case 'suspend':
        updates.account_status = 'suspended';
        break;
      case 'reactivate':
        updates.account_status = 'active';
        if (existingUser.role === 'seller' && String(existingUser.seller_approval_status || '').toLowerCase() === 'rejected') {
          updates.seller_approval_status = 'approved';
        }
        break;
      case 'deactivate':
        updates.account_status = 'deactivated';
        break;
      default:
        break;
    }

    const { data: updatedUser, error: updateError } = await supabaseAdmin
      .from('users')
      .update(updates)
      .eq('id', userId)
      .select('id, email, full_name, phone, address, role, business_name, created_at, account_status, seller_approval_status')
      .single();

    if (updateError) {
      return NextResponse.json({ success: false, message: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, user: updatedUser });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, message: getErrorMessage(error) }, { status: 500 });
  }
}
