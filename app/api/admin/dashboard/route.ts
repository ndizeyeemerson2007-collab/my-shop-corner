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

    const { count: productsCount } = await supabaseAdmin
      .from('products')
      .select('*', { count: 'exact', head: true });

    const { data: trendingProducts } = await supabaseAdmin
      .from('products')
      .select('id')
      .eq('is_trend', true);

    let ordersCount = 0;
    let revenue = 0;
    let orders: any[] = [];

    const ordersCountQuery = await supabaseAdmin
      .from('orders')
      .select('*', { count: 'exact', head: true });
    if (!ordersCountQuery.error) {
      ordersCount = ordersCountQuery.count || 0;

      const ordersQuery = await supabaseAdmin
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
      if (!ordersQuery.error && ordersQuery.data) {
        orders = ordersQuery.data;
        revenue = orders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0);
      }
    }

    return NextResponse.json({
      success: true,
      stats: {
        revenue,
        orders: ordersCount,
        products: productsCount || 0,
        trend_products: trendingProducts?.length || 0,
      },
      orders,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
