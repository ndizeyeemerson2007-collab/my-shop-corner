import { NextRequest, NextResponse } from 'next/server';
import { forbiddenResponse, getAuthenticatedAccount, hasRole, supabaseAdmin } from '../../../../lib/server-auth';

type SellerItemRow = {
  id: number;
  order_id: number;
  quantity: number;
  color?: string | null;
  size?: string | null;
  price?: number | null;
  product_name?: string | null;
  products?: {
    name?: string | null;
    image?: string | null;
  } | null;
};

type SellerStatusRow = {
  order_id: number;
  status: string;
};

type SellerOrderRow = {
  id: number;
  user_id?: string | null;
  status?: string | null;
  created_at?: string;
  delivery_distance_km?: number | null;
  delivery_fee?: number | null;
  location?: string | null;
};

type SellerCustomerRow = {
  id: string;
  email?: string | null;
  full_name?: string | null;
  phone?: string | null;
  address?: string | null;
};

const allowedStatuses = ['pending', 'paid', 'processing', 'delivered', 'canceled'];

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

    const { data: sellerItems, error } = await supabaseAdmin
      .from('order_items')
      .select(`
        id,
        order_id,
        product_id,
        quantity,
        color,
        size,
        price,
        product_name,
        created_at,
        products!inner (
          id,
          name,
          image,
          seller_id
        )
      `)
      .eq('products.seller_id', auth.profile.id)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    const typedSellerItems = (sellerItems || []) as SellerItemRow[];
    const orderIds = Array.from(new Set(typedSellerItems.map((item) => Number(item.order_id))));
    if (orderIds.length === 0) {
      return NextResponse.json({ success: true, orders: [] });
    }

    const [{ data: orders, error: ordersError }, { data: sellerStatuses, error: statusError }] = await Promise.all([
      supabaseAdmin
        .from('orders')
        .select('*')
        .in('id', orderIds)
        .order('created_at', { ascending: false }),
      supabaseAdmin
        .from('seller_order_statuses')
        .select('order_id, status')
        .eq('seller_id', auth.profile.id)
        .in('order_id', orderIds),
    ]);

    if (ordersError) {
      return NextResponse.json({ success: false, message: ordersError.message }, { status: 500 });
    }

    if (statusError) {
      return NextResponse.json({ success: false, message: statusError.message }, { status: 500 });
    }

    const customerIds = Array.from(new Set(((orders || []) as SellerOrderRow[]).map((order) => String(order.user_id || '')).filter(Boolean)));
    let customersById: Record<string, SellerCustomerRow> = {};

    if (customerIds.length > 0) {
      const { data: customers, error: customersError } = await supabaseAdmin
        .from('users')
        .select('id, email, full_name, phone, address')
        .in('id', customerIds);

      if (customersError) {
        return NextResponse.json({ success: false, message: customersError.message }, { status: 500 });
      }

      customersById = (customers || []).reduce<Record<string, SellerCustomerRow>>((acc, customer) => {
        acc[String(customer.id)] = customer;
        return acc;
      }, {});
    }

    const sellerStatusByOrder = ((sellerStatuses || []) as SellerStatusRow[]).reduce<Record<string, string>>((acc, statusRow) => {
      acc[String(statusRow.order_id)] = statusRow.status;
      return acc;
    }, {});

    const itemsByOrder = typedSellerItems.reduce<Record<string, Array<SellerItemRow & { product_image: string | null; subtotal: number }>>>((acc, item) => {
      const key = String(item.order_id);
      if (!acc[key]) acc[key] = [];
      acc[key].push({
        ...item,
        product_name: item.products?.name || item.product_name || 'Unknown product',
        product_image: item.products?.image || null,
        subtotal: Number(item.price || 0) * Number(item.quantity || 0),
      });
      return acc;
    }, {});

    const hydratedOrders = ((orders || []) as SellerOrderRow[]).map((order) => {
      const items = itemsByOrder[String(order.id)] || [];
      const customer = customersById[String(order.user_id || '')] || null;
      const sellerStatus = sellerStatusByOrder[String(order.id)] || String(order.status || 'pending');

      return {
        ...order,
        status: sellerStatus,
        full_name: customer?.full_name || null,
        phone: customer?.phone || null,
        location: order.location || customer?.address || null,
        delivery_distance_km: Number(order.delivery_distance_km || 0),
        delivery_fee: Number(order.delivery_fee || 0),
        customer_email: customer?.email || null,
        customer,
        items,
        seller_total: items.reduce((sum, item) => sum + Number(item.subtotal || 0), 0),
      };
    });

    return NextResponse.json({ success: true, orders: hydratedOrders });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, message: getErrorMessage(error) }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await getAuthenticatedAccount(request);
    if (!auth.ok) return auth.response;
    if (!hasRole(auth.profile, ['seller'])) {
      return forbiddenResponse();
    }

    const body = await request.json();
    const orderId = Number(body.order_id);
    const status = String(body.status || '').toLowerCase();

    if (!orderId || !allowedStatuses.includes(status)) {
      return NextResponse.json({ success: false, message: 'Invalid order update payload' }, { status: 400 });
    }

    const { data: ownedItem, error: ownershipError } = await supabaseAdmin
      .from('order_items')
      .select(`
        id,
        products!inner (
          seller_id
        )
      `)
      .eq('order_id', orderId)
      .eq('products.seller_id', auth.profile.id)
      .maybeSingle();

    if (ownershipError) {
      return NextResponse.json({ success: false, message: ownershipError.message }, { status: 500 });
    }

    if (!ownedItem) {
      return NextResponse.json({ success: false, message: 'Order not found for this seller' }, { status: 404 });
    }

    const { data, error } = await supabaseAdmin
      .from('seller_order_statuses')
      .upsert([{
        order_id: orderId,
        seller_id: auth.profile.id,
        status,
        updated_at: new Date().toISOString(),
      }], { onConflict: 'order_id,seller_id' })
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, seller_order_status: data });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, message: getErrorMessage(error) }, { status: 500 });
  }
}
