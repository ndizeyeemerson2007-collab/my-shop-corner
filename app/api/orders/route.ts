import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSupabase } from '../../../lib/utils';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

function getSessionId(req: NextRequest) {
  return req.headers.get('X-Session-Id') || 'anonymous_session';
}

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
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    const orderIds = (orders || []).map((o: any) => o.id);
    let itemsByOrder: Record<string, any[]> = {};

    if (orderIds.length > 0) {
      const { data: items } = await supabaseAdmin
        .from('order_items')
        .select(`
          *,
          products(name, image)
        `)
        .in('order_id', orderIds);

      itemsByOrder = (items || []).reduce((acc: Record<string, any[]>, item: any) => {
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

    const hydratedOrders = (orders || []).map((order: any) => ({
      ...order,
      items: itemsByOrder[String(order.id)] || [],
    }));

    return NextResponse.json({ success: true, orders: hydratedOrders });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (!auth.ok) return auth.response;

    const sessionId = getSessionId(request);

    const { data: cartData, error: cartError } = await supabaseAdmin
      .from('cart')
      .select('*, products(id, name, price, image, stock)')
      .eq('session_id', sessionId);

    if (cartError) {
      return NextResponse.json({ success: false, message: cartError.message }, { status: 500 });
    }

    const cartItems = cartData || [];
    if (cartItems.length === 0) {
      return NextResponse.json({ success: false, message: 'Cart is empty' }, { status: 400 });
    }

    const totalAmount = cartItems.reduce((sum: number, item: any) => {
      const price = Number(item.products?.price || 0);
      return sum + price * Number(item.quantity || 1);
    }, 0);

    const { data: newOrder, error: orderError } = await supabaseAdmin
      .from('orders')
      .insert([{
        user_id: auth.user.id,
        status: 'pending',
        total_amount: totalAmount,
        full_name: auth.profile?.full_name || auth.user.email || 'Customer',
        phone: auth.profile?.phone || null,
        location: auth.profile?.address || null,
      }])
      .select('*')
      .single();

    if (orderError || !newOrder) {
      return NextResponse.json({ success: false, message: orderError?.message || 'Could not create order' }, { status: 500 });
    }

    const orderItemsPayload = cartItems.map((item: any) => ({
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
      return NextResponse.json({ success: false, message: orderItemsError.message }, { status: 500 });
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
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
