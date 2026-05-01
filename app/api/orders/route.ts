import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSupabase } from '../../../lib/utils';
import { reverseGeocodeLocation } from '../../../lib/reverse-geocode';
import { calculateDeliveryQuote } from '../../../lib/delivery';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

function normalizeDatabaseError(message: string | undefined) {
  if (!message) return 'Internal Server Error';

  if (message.includes('invalid input syntax for type integer')) {
    return 'Database schema mismatch: orders.user_id is still integer in Supabase, but the app uses UUID auth users. Run db/fix-orders-schema.sql in Supabase SQL Editor.';
  }

  if (message.includes('null value in column "session_id" of relation "orders" violates not-null constraint')) {
    return 'Database schema mismatch: the live orders table still requires session_id. The app now sends it too, but you should still run db/fix-orders-schema.sql in Supabase SQL Editor to align the schema.';
  }

  if (message.includes("Could not find the 'full_name' column of 'orders'")) {
    return 'Database schema mismatch: the live orders table is outdated. Run db/fix-orders-schema.sql in Supabase SQL Editor.';
  }

  if (message.includes("Could not find the 'delivery_fee' column of 'orders'")) {
    return 'Database schema mismatch: orders.delivery_fee is missing. Run orders-schema.sql in Supabase SQL Editor to add delivery columns.';
  }

  if (message.includes("Could not find the 'delivery_distance_km' column of 'orders'")) {
    return 'Database schema mismatch: orders.delivery_distance_km is missing. Run orders-schema.sql in Supabase SQL Editor to add delivery columns.';
  }

  return message;
}

function getSessionId(req: NextRequest) {
  return req.headers.get('X-Session-Id') || 'anonymous_session';
}

type DeliveryLocationInput = {
  accuracy?: number | null;
  capturedAt?: string;
  label?: string;
  latitude?: number;
  longitude?: number;
  manualText?: string;
};

type OrderUserRow = {
  id: string;
  email?: string | null;
  full_name?: string | null;
  phone?: string | null;
  address?: string | null;
};

type SellerStatusRow = {
  order_id: number;
  status?: string | null;
};

type OrderRow = {
  id: number;
  user_id?: string | null;
  status?: string | null;
  created_at?: string | null;
  total_amount?: number | null;
  delivery_fee?: number | null;
  delivery_distance_km?: number | null;
};

type OrderItemRow = {
  id?: number;
  order_id: number;
  product_name?: string | null;
  product_id?: number | null;
  quantity?: number | null;
  color?: string | null;
  size?: string | null;
  price?: number | null;
  products?: {
    name?: string | null;
    image?: string | null;
    price?: number | null;
    stock?: number | null;
  } | null;
};

type HydratedOrderItem = OrderItemRow & {
  product_image: string | null;
};

type CartRow = {
  product_id: number;
  quantity?: number | null;
  color?: string | null;
  size?: string | null;
  products?: {
    id?: number | null;
    name?: string | null;
    price?: number | null;
    image?: string | null;
    stock?: number | null;
  } | null;
};

async function requireUser(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { ok: false as const, response: NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 }) };
  }

  const token = authHeader.substring(7);
  const supabase = getSupabase;
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return { ok: false as const, response: NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 }) };
  }

  const { data: profile } = await supabaseAdmin
    .from('users')
    .select('id, full_name, phone, address')
    .eq('id', user.id)
    .maybeSingle();

  return {
    ok: true as const,
    user,
    profile: profile || null,
  };
}

function canUserCancelOrder(status: string | null | undefined) {
  const normalized = String(status || '').toLowerCase();
  return normalized === 'pending';
}

function normalizeOrderStatus(status?: string | null) {
  const normalized = String(status || 'pending').toLowerCase();
  return normalized === 'cancelled' ? 'canceled' : normalized;
}

function getEffectiveOrderStatus(baseStatus?: string | null, sellerStatuses?: Array<string | null | undefined>) {
  const normalizedSellerStatuses = (sellerStatuses || [])
    .map((status) => normalizeOrderStatus(status))
    .filter(Boolean);

  if (normalizedSellerStatuses.length === 0) {
    return normalizeOrderStatus(baseStatus);
  }

  if (normalizedSellerStatuses.every((status) => status === 'delivered')) {
    return 'delivered';
  }

  if (normalizedSellerStatuses.every((status) => status === 'canceled')) {
    return 'canceled';
  }

  if (normalizedSellerStatuses.some((status) => status === 'pending')) {
    return 'pending';
  }

  if (normalizedSellerStatuses.some((status) => status === 'paid')) {
    return 'paid';
  }

  if (normalizedSellerStatuses.some((status) => status === 'processing')) {
    return 'processing';
  }

  if (normalizedSellerStatuses.some((status) => status === 'delivered')) {
    return 'processing';
  }

  if (normalizedSellerStatuses.some((status) => status === 'canceled')) {
    return 'canceled';
  }

  return normalizeOrderStatus(baseStatus);
}

async function normalizeDeliveryLocation(input: DeliveryLocationInput | null | undefined, acceptLanguage?: string | null) {
  if (!input) return null;

  const clientLabel = String(input.label || input.manualText || '').trim();

  const latitude = Number(input.latitude);
  const longitude = Number(input.longitude);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return clientLabel || null;
  }

  const resolved = await reverseGeocodeLocation({
    accuracy: input.accuracy,
    acceptLanguage,
    capturedAt: input.capturedAt,
    latitude,
    longitude,
  });

  if (clientLabel && !resolved.label) {
    return clientLabel;
  }

  return resolved.label || clientLabel || null;
}

function getDeliveryCoordinates(input: DeliveryLocationInput | null | undefined) {
  const latitude = Number(input?.latitude);
  const longitude = Number(input?.longitude);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return { latitude, longitude };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (!auth.ok) return auth.response;

    const { data: orders, error } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('user_id', auth.user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      return NextResponse.json({ success: false, message: normalizeDatabaseError(error.message) }, { status: 500 });
    }

    const typedOrders = (orders || []) as OrderRow[];
    const orderIds = typedOrders.map((order) => order.id);
    const userIds = Array.from(new Set(typedOrders.map((order) => String(order.user_id || '')).filter(Boolean)));
    let itemsByOrder: Record<string, HydratedOrderItem[]> = {};
    let usersById: Record<string, OrderUserRow> = {};
    let sellerStatusesByOrder: Record<string, string[]> = {};

    if (userIds.length > 0) {
      const { data: users, error: usersError } = await supabaseAdmin
        .from('users')
        .select('id, email, full_name, phone, address')
        .in('id', userIds);

      if (usersError) {
        return NextResponse.json({ success: false, message: normalizeDatabaseError(usersError.message) }, { status: 500 });
      }

      usersById = (users || []).reduce((acc: Record<string, OrderUserRow>, user: OrderUserRow) => {
        acc[String(user.id)] = user;
        return acc;
      }, {});
    }

    if (orderIds.length > 0) {
      const { data: sellerStatuses, error: sellerStatusesError } = await supabaseAdmin
        .from('seller_order_statuses')
        .select('order_id, status')
        .in('order_id', orderIds);

      if (sellerStatusesError) {
        return NextResponse.json({ success: false, message: normalizeDatabaseError(sellerStatusesError.message) }, { status: 500 });
      }

      sellerStatusesByOrder = ((sellerStatuses || []) as SellerStatusRow[]).reduce<Record<string, string[]>>((acc, row) => {
        const key = String(row.order_id);
        if (!acc[key]) acc[key] = [];
        acc[key].push(normalizeOrderStatus(row.status));
        return acc;
      }, {});

      const { data: items } = await supabaseAdmin
        .from('order_items')
        .select(`
          *,
          products(name, image)
        `)
        .in('order_id', orderIds);

      itemsByOrder = ((items || []) as OrderItemRow[]).reduce<Record<string, HydratedOrderItem[]>>((acc, item) => {
        const key = String(item.order_id);
        if (!acc[key]) acc[key] = [];
        acc[key].push({
          ...item,
          product_name: item.products?.name || item.product_name || 'Unknown product',
          product_image: item.products?.image || null,
        });
        return acc;
      }, {});
    }

    const hydratedOrders = typedOrders.map((order) => ({
      ...order,
      status: getEffectiveOrderStatus(order.status, sellerStatusesByOrder[String(order.id)] || []),
      customer: usersById[String(order.user_id)] || null,
      items: itemsByOrder[String(order.id)] || [],
    }));

    return NextResponse.json({ success: true, orders: hydratedOrders });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (!auth.ok) return auth.response;
    const body = await request.json().catch(() => ({}));
    const deliveryLocation = await normalizeDeliveryLocation(body?.delivery_location, request.headers.get('accept-language'));
    const deliveryCoordinates = getDeliveryCoordinates(body?.delivery_location);

    if (!deliveryLocation) {
      return NextResponse.json({ success: false, message: 'Delivery location is required before placing an order.' }, { status: 400 });
    }

    const sessionId = getSessionId(request);

    const { data: cartData, error: cartError } = await supabaseAdmin
      .from('cart')
      .select('*, products(id, name, price, image, stock)')
      .eq('session_id', sessionId);

    if (cartError) {
      return NextResponse.json({ success: false, message: cartError.message }, { status: 500 });
    }

    const cartItems = (cartData || []) as CartRow[];
    if (cartItems.length === 0) {
      return NextResponse.json({ success: false, message: 'Cart is empty' }, { status: 400 });
    }

    const productsTotal = cartItems.reduce((sum: number, item) => {
      const price = Number(item.products?.price || 0);
      return sum + price * Number(item.quantity || 1);
    }, 0);
    const deliveryQuote = deliveryCoordinates
      ? calculateDeliveryQuote(deliveryCoordinates.latitude, deliveryCoordinates.longitude)
      : { deliveryFee: 0, distanceKm: 0, ratePerKm: 0 };
    const totalAmount = productsTotal + Number(deliveryQuote.deliveryFee || 0);

    const { data: newOrder, error: orderError } = await supabaseAdmin
      .from('orders')
      .insert([{
        user_id: auth.user.id,
        session_id: sessionId,
        status: 'pending',
        total_amount: totalAmount,
        delivery_distance_km: deliveryQuote.distanceKm,
        delivery_fee: deliveryQuote.deliveryFee,
        full_name: auth.profile?.full_name || null,
        phone: auth.profile?.phone || null,
        location: deliveryLocation,
      }])
      .select('*')
      .single();

    if (orderError || !newOrder) {
      return NextResponse.json({ success: false, message: normalizeDatabaseError(orderError?.message) || 'Could not create order' }, { status: 500 });
    }

    const orderItemsPayload = cartItems.map((item) => ({
      order_id: newOrder.id,
      product_id: item.product_id,
      quantity: Number(item.quantity || 1),
      color: item.color || null,
      size: item.size || null,
      price: Number(item.products?.price || 0),
      product_name: item.products?.name || 'Unknown product',
    }));

    const { error: orderItemsError } = await supabaseAdmin
      .from('order_items')
      .insert(orderItemsPayload);

    if (orderItemsError) {
      await supabaseAdmin.from('orders').delete().eq('id', newOrder.id);
      return NextResponse.json({ success: false, message: normalizeDatabaseError(orderItemsError.message) }, { status: 500 });
    }

    for (const item of cartItems) {
      const stock = Number(item.products?.stock || 0);
      const qty = Number(item.quantity || 1);
      const nextStock = Math.max(0, stock - qty);
      await supabaseAdmin
        .from('products')
        .update({ stock: nextStock })
        .eq('id', item.product_id);
    }

    await supabaseAdmin
      .from('cart')
      .delete()
      .eq('session_id', sessionId);

    return NextResponse.json({ success: true, order: newOrder });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, message: normalizeDatabaseError(error instanceof Error ? error.message : 'Internal Server Error') }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const orderId = Number(body.order_id);
    const action = String(body.action || '').toLowerCase();

    if (!orderId || action !== 'cancel') {
      return NextResponse.json({ success: false, message: 'Invalid order update payload' }, { status: 400 });
    }

    const { data: existingOrder, error: existingError } = await supabaseAdmin
      .from('orders')
      .select('id, status, user_id')
      .eq('id', orderId)
      .eq('user_id', auth.user.id)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json({ success: false, message: normalizeDatabaseError(existingError.message) }, { status: 500 });
    }

    if (!existingOrder) {
      return NextResponse.json({ success: false, message: 'Order not found' }, { status: 404 });
    }

    const { data: sellerStatuses, error: sellerStatusesError } = await supabaseAdmin
      .from('seller_order_statuses')
      .select('order_id, status')
      .eq('order_id', orderId);

    if (sellerStatusesError) {
      return NextResponse.json({ success: false, message: normalizeDatabaseError(sellerStatusesError.message) }, { status: 500 });
    }

    const effectiveStatus = getEffectiveOrderStatus(
      existingOrder.status,
      ((sellerStatuses || []) as SellerStatusRow[]).map((row) => row.status),
    );

    if (!canUserCancelOrder(effectiveStatus)) {
      return NextResponse.json({ success: false, message: 'This order can no longer be canceled' }, { status: 400 });
    }

    const { data: updatedOrder, error: updateError } = await supabaseAdmin
      .from('orders')
      .update({ status: 'canceled' })
      .eq('id', orderId)
      .eq('user_id', auth.user.id)
      .select('*')
      .single();

    if (updateError) {
      return NextResponse.json({ success: false, message: normalizeDatabaseError(updateError.message) }, { status: 500 });
    }

    return NextResponse.json({ success: true, order: updatedOrder });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, message: normalizeDatabaseError(error instanceof Error ? error.message : 'Internal Server Error') }, { status: 500 });
  }
}
