import { NextRequest, NextResponse } from 'next/server';
import { forbiddenResponse, getAuthenticatedAccount, hasRole, supabaseAdmin } from '../../../../lib/server-auth';
import { z } from 'zod';

const ARCHIVED_PRODUCT_BADGE = '__archived__';
const adminProductActionSchema = z.object({
  action: z.enum(['unlist']),
  product_id: z.number().int().positive(),
});

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Internal Server Error';
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await getAuthenticatedAccount(request);
    if (!auth.ok) return auth.response;
    if (!hasRole(auth.profile, ['admin'])) {
      return forbiddenResponse();
    }

    const { searchParams } = new URL(request.url);
    const id = Number(searchParams.get('id'));
    if (!id) {
      return NextResponse.json({ success: false, message: 'Product id is required.' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('products')
      .delete()
      .eq('id', id);

    if (error) {
      const isForeignKeyError =
        error.code === '23503' ||
        String(error.message || '').toLowerCase().includes('foreign key constraint');

      if (!isForeignKeyError) {
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
      }

      const { error: archiveError } = await supabaseAdmin
        .from('products')
        .update({
          badge: ARCHIVED_PRODUCT_BADGE,
          is_trend: false,
          stock: 0,
        })
        .eq('id', id);

      if (archiveError) {
        return NextResponse.json({ success: false, message: archiveError.message }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        message: 'Product removed from storefront and inventory, but kept in past orders.',
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, message: getErrorMessage(error) }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await getAuthenticatedAccount(request);
    if (!auth.ok) return auth.response;
    if (!hasRole(auth.profile, ['admin'])) {
      return forbiddenResponse();
    }

    const parsed = adminProductActionSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ success: false, message: 'Invalid admin product action.' }, { status: 400 });
    }

    const { product_id: productId } = parsed.data;

    const { data, error } = await supabaseAdmin
      .from('products')
      .update({
        badge: ARCHIVED_PRODUCT_BADGE,
        is_trend: false,
        stock: 0,
      })
      .eq('id', productId)
      .select('id')
      .maybeSingle();

    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ success: false, message: 'Product not found.' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, message: getErrorMessage(error) }, { status: 500 });
  }
}
