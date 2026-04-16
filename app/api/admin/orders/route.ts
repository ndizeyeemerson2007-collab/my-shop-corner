import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSupabase } from '../../../../lib/utils';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function requireAdmin(request: NextRequest) {
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

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('users')
    .select('id, role')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError || !profile || profile.role !== 'admin') {
    return { ok: false as const, response: NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 }) };
  }

  return { ok: true as const };
}

export async function GET(request: NextRequest) {
  try {
    const adminCheck = await requireAdmin(request);
    if (!adminCheck.ok) return adminCheck.response;

    const { data: orders, error } = await supabaseAdmin
      .from('orders')
      .select(`
        *,
        users:user_id (
          id,
          email,
          full_name,
          phone,
          address
        )
      `)
      .order('created_at', { ascending: false })
      .limit(100);

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

    const hydrated = (orders || []).map((order: any) => ({
      ...order,
      full_name: order.full_name || order.users?.full_name || null,
      phone: order.phone || order.users?.phone || null,
      location: order.location || order.users?.address || null,
      customer_email: order.users?.email || null,
      customer: order.users || null,
      items: itemsByOrder[String(order.id)] || [],
    }));

    return NextResponse.json({ success: true, orders: hydrated });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const adminCheck = await requireAdmin(request);
    if (!adminCheck.ok) return adminCheck.response;

    const body = await request.json();
    const orderId = Number(body.order_id);
    const status = String(body.status || '').toLowerCase();
    const allowed = ['pending', 'paid', 'processing', 'delivered', 'canceled'];

    if (!orderId || !allowed.includes(status)) {
      return NextResponse.json({ success: false, message: 'Invalid order update payload' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('orders')
      .update({ status })
      .eq('id', orderId)
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, order: data });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
