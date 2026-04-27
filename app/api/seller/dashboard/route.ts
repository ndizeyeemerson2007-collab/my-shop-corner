import { NextRequest, NextResponse } from 'next/server';
import { forbiddenResponse, getAuthenticatedAccount, hasRole, supabaseAdmin } from '../../../../lib/server-auth';

const ARCHIVED_PRODUCT_BADGE = '__archived__';

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Internal Server Error';
}

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedAccount(request);
    if (!auth.ok) return auth.response;
    if (!hasRole(auth.profile, ['seller'])) {
      return forbiddenResponse();
    }

    const { count: productsCount } = await supabaseAdmin
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('seller_id', auth.profile.id)
      .or(`badge.is.null,badge.neq.${ARCHIVED_PRODUCT_BADGE}`);

    const { data: orderItems, error } = await supabaseAdmin
      .from('order_items')
      .select(`
        order_id,
        quantity,
        price,
        orders!inner (
          id,
          status,
          created_at
        ),
        products!inner (
          seller_id
        )
      `)
      .eq('products.seller_id', auth.profile.id);

    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    const uniqueOrders = new Set<number>();
    const pendingOrders = new Set<number>();
    let revenue = 0;

    for (const item of orderItems || []) {
      const order = Array.isArray(item.orders) ? item.orders[0] : item.orders;
      const orderId = Number(item.order_id);
      uniqueOrders.add(orderId);
      revenue += Number(item.price || 0) * Number(item.quantity || 0);

      if (String(order?.status || '').toLowerCase() === 'pending') {
        pendingOrders.add(orderId);
      }
    }

    return NextResponse.json({
      success: true,
      stats: {
        revenue,
        orders: uniqueOrders.size,
        products: productsCount || 0,
        pending_orders: pendingOrders.size,
      },
    });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, message: getErrorMessage(error) }, { status: 500 });
  }
}
