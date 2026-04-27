import { NextRequest, NextResponse } from 'next/server';
import { forbiddenResponse, getAuthenticatedAccount, hasRole, supabaseAdmin } from '../../../../lib/server-auth';

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Internal Server Error';
}

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedAccount(request);
    if (!auth.ok) return auth.response;
    if (!hasRole(auth.profile, ['admin'])) {
      return forbiddenResponse();
    }

    const [usersResult, productsResult, productCountResult, ordersResult] = await Promise.all([
      supabaseAdmin
        .from('users')
        .select('id, email, full_name, phone, address, role, business_name, created_at, account_status, seller_approval_status')
        .order('created_at', { ascending: false }),
      supabaseAdmin
        .from('products')
        .select('id, name, price, stock, image, badge, category, created_at, seller_id')
        .or('badge.is.null,badge.neq.__archived__')
        .order('created_at', { ascending: false })
        .limit(24),
      supabaseAdmin
        .from('products')
        .select('id', { count: 'exact', head: true })
        .or('badge.is.null,badge.neq.__archived__'),
      supabaseAdmin
        .from('orders')
        .select('id, total_amount, delivery_fee, delivery_distance_km, status, created_at, user_id')
        .order('created_at', { ascending: false }),
    ]);

    if (usersResult.error) {
      return NextResponse.json({ success: false, message: usersResult.error.message }, { status: 500 });
    }

    if (productsResult.error) {
      return NextResponse.json({ success: false, message: productsResult.error.message }, { status: 500 });
    }

    if (productCountResult.error) {
      return NextResponse.json({ success: false, message: productCountResult.error.message }, { status: 500 });
    }

    if (ordersResult.error) {
      return NextResponse.json({ success: false, message: ordersResult.error.message }, { status: 500 });
    }

    const users = usersResult.data || [];
    const products = productsResult.data || [];
    const orders = ordersResult.data || [];
    const userMap = new Map(users.map((user) => [user.id, user]));

    const pendingSellers = users.filter((user) => user.role === 'seller' && String(user.seller_approval_status || 'pending').toLowerCase() === 'pending');
    const approvedSellers = users.filter((user) => user.role === 'seller' && String(user.seller_approval_status || 'approved').toLowerCase() === 'approved');
    const suspendedUsers = users.filter((user) => String(user.account_status || 'active').toLowerCase() === 'suspended');
    const activeUsers = users.filter((user) => String(user.account_status || 'active').toLowerCase() === 'active');
    const buyers = users.filter((user) => user.role === 'user');
    const sellers = users.filter((user) => user.role === 'seller');
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const newBuyers = buyers.filter((buyer) => {
      const createdAt = buyer.created_at ? new Date(buyer.created_at) : null;
      return createdAt && !Number.isNaN(createdAt.getTime()) && createdAt >= sevenDaysAgo;
    });

    const totalRevenue = orders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0);
    const totalDeliveryFees = orders.reduce((sum, order) => sum + Number(order.delivery_fee || 0), 0);
    const netProductSales = totalRevenue - totalDeliveryFees;
    const statusCounts = orders.reduce<Record<string, number>>((acc, order) => {
      const key = String(order.status || 'pending').toLowerCase();
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    const chartDays = Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - index));
      const key = date.toISOString().slice(0, 10);
      return {
        key,
        label: date.toLocaleDateString(undefined, { weekday: 'short' }),
        revenue: 0,
      };
    });

    for (const order of orders) {
      const key = new Date(String(order.created_at || '')).toISOString().slice(0, 10);
      const match = chartDays.find((day) => day.key === key);
      if (match) {
        match.revenue += Number(order.total_amount || 0);
      }
    }

    const transactionDistribution = [
      { label: 'Product Sales', value: Math.max(netProductSales, 0), color: '#f97316' },
      { label: 'Delivery Fees', value: Math.max(totalDeliveryFees, 0), color: '#fdba74' },
      { label: 'Pending Value', value: (statusCounts.pending || 0) * 1000, color: '#1f2937' },
    ];

    const revenueBreakdown = [
      { label: 'Seller Revenue', value: Math.max(netProductSales * 0.85, 0), color: '#fb923c' },
      { label: 'Admin Revenue', value: Math.max(netProductSales * 0.15, 0), color: '#7c2d12' },
    ];

    return NextResponse.json({
      success: true,
      stats: {
        total_users: users.length,
        active_users: activeUsers.length,
        suspended_users: suspendedUsers.length,
        total_sellers: sellers.length,
        active_sellers: approvedSellers.filter((seller) => String(seller.account_status || 'active').toLowerCase() === 'active').length,
        pending_sellers: pendingSellers.length,
        approved_sellers: approvedSellers.length,
        total_buyers: buyers.length,
        new_buyers: newBuyers.length,
        total_products: productCountResult.count || products.length,
        total_orders: orders.length,
        total_revenue: totalRevenue,
        delivery_fees: totalDeliveryFees,
        product_sales: netProductSales,
      },
      order_status_counts: statusCounts,
      sales_velocity: chartDays,
      revenue_chart: chartDays,
      transaction_distribution: transactionDistribution,
      revenue_breakdown: revenueBreakdown,
      pending_sellers: pendingSellers,
      recently_approved_sellers: approvedSellers.slice(0, 6),
      users,
      suspended_users_list: suspendedUsers,
      products: products.map((product) => ({
        ...product,
        seller_name: userMap.get(product.seller_id || '')?.full_name || null,
        seller_business_name: userMap.get(product.seller_id || '')?.business_name || null,
      })),
    });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, message: getErrorMessage(error) }, { status: 500 });
  }
}
