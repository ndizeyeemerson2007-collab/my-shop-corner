import { NextRequest, NextResponse } from 'next/server';
import { forbiddenResponse, getAuthenticatedAccount, hasRole, supabaseAdmin } from '../../../../lib/server-auth';

const ARCHIVED_PRODUCT_BADGE = '__archived__';

type SellerStatusRow = {
  order_id: number;
  status?: string | null;
};

type RevenuePoint = {
  key: string;
  label: string;
  revenue: number;
};

type SellerNotification = {
  id: string;
  icon: string;
  title: string;
  body: string;
  time: string;
  tone: 'success' | 'warning' | 'neutral';
};

type FollowRow = {
  id: number;
  user_id: string;
  created_at?: string | null;
};

type FollowerUserRow = {
  id: string;
  full_name?: string | null;
  email?: string | null;
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Internal Server Error';
}

function normalizeOrderStatus(status?: string | null) {
  const normalized = String(status || 'pending').toLowerCase();
  return normalized === 'cancelled' ? 'canceled' : normalized;
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

    const [orderItemsResult, followerRowsResult] = await Promise.all([
      supabaseAdmin
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
        .eq('products.seller_id', auth.profile.id),
      supabaseAdmin
        .from('seller_follows')
        .select('id, user_id, created_at')
        .eq('seller_id', auth.profile.id)
        .order('created_at', { ascending: false })
        .limit(10),
    ]);

    if (orderItemsResult.error) {
      return NextResponse.json({ success: false, message: orderItemsResult.error.message }, { status: 500 });
    }

    if (followerRowsResult.error) {
      return NextResponse.json({ success: false, message: followerRowsResult.error.message }, { status: 500 });
    }

    const orderItems = orderItemsResult.data || [];
    const followerRows = (followerRowsResult.data || []) as FollowRow[];
    const uniqueOrders = new Set<number>();
    const pendingOrders = new Set<number>();
    let revenue = 0;
    const orderIds = Array.from(new Set(orderItems.map((item) => Number(item.order_id)).filter(Number.isFinite)));
    let sellerStatusByOrder: Record<string, string> = {};
    const notifications: SellerNotification[] = [];
    const revenueChart: RevenuePoint[] = Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - index));
      const key = date.toISOString().slice(0, 10);
      return {
        key,
        label: date.toLocaleDateString(undefined, { weekday: 'short' }),
        revenue: 0,
      };
    });

    if (orderIds.length > 0) {
      const { data: sellerStatuses, error: sellerStatusesError } = await supabaseAdmin
        .from('seller_order_statuses')
        .select('order_id, status')
        .eq('seller_id', auth.profile.id)
        .in('order_id', orderIds);

      if (sellerStatusesError) {
        return NextResponse.json({ success: false, message: sellerStatusesError.message }, { status: 500 });
      }

      sellerStatusByOrder = ((sellerStatuses || []) as SellerStatusRow[]).reduce<Record<string, string>>((acc, row) => {
        acc[String(row.order_id)] = normalizeOrderStatus(row.status);
        return acc;
      }, {});
    }

    const last24Hours = Date.now() - (24 * 60 * 60 * 1000);
    const sellerTotalsByOrder = orderItems.reduce<Record<string, number>>((acc, item) => {
      const key = String(item.order_id);
      acc[key] = (acc[key] || 0) + (Number(item.price || 0) * Number(item.quantity || 0));
      return acc;
    }, {});
    const orderNotificationMap = new Map<string, SellerNotification>();

    for (const item of orderItems) {
      const order = Array.isArray(item.orders) ? item.orders[0] : item.orders;
      const orderId = Number(item.order_id);
      const effectiveStatus = sellerStatusByOrder[String(orderId)] || normalizeOrderStatus(order?.status);
      const sellerSubtotal = Number(item.price || 0) * Number(item.quantity || 0);
      uniqueOrders.add(orderId);

      if (effectiveStatus === 'pending') {
        pendingOrders.add(orderId);
      }

      if (effectiveStatus !== 'paid') {
        continue;
      }

      revenue += sellerSubtotal;

      const orderDate = new Date(String(order?.created_at || ''));
      if (!Number.isNaN(orderDate.getTime())) {
        const orderKey = orderDate.toISOString().slice(0, 10);
        const matchingDay = revenueChart.find((day) => day.key === orderKey);
        if (matchingDay) {
          matchingDay.revenue += sellerSubtotal;
        }
      }
    }

    for (const orderId of orderIds) {
      const rawOrder = orderItems.find((item) => Number(item.order_id) === orderId);
      const order = rawOrder ? (Array.isArray(rawOrder.orders) ? rawOrder.orders[0] : rawOrder.orders) : null;
      const orderTime = new Date(String(order?.created_at || ''));
      if (Number.isNaN(orderTime.getTime()) || orderTime.getTime() < last24Hours) {
        continue;
      }

      const effectiveStatus = sellerStatusByOrder[String(orderId)] || normalizeOrderStatus(order?.status);
      const sellerTotal = Number(sellerTotalsByOrder[String(orderId)] || 0);
      const time = orderTime.toISOString();

      orderNotificationMap.set(`order-${orderId}`, {
        id: `order-${orderId}`,
        icon: 'fa-solid fa-cart-shopping',
        title: `New order #${orderId}`,
        body: `A customer placed an order containing your products worth RWF ${sellerTotal.toLocaleString()}.`,
        time,
        tone: effectiveStatus === 'pending' ? 'warning' : 'neutral',
      });

      if (['paid', 'processing', 'delivered'].includes(effectiveStatus)) {
        orderNotificationMap.set(`paid-${orderId}`, {
          id: `paid-${orderId}`,
          icon: 'fa-solid fa-wallet',
          title: `Payment confirmed for order #${orderId}`,
          body: `You can count RWF ${sellerTotal.toLocaleString()} in revenue for this sale.`,
          time,
          tone: 'success',
        });
      }
    }

    const followerIds = Array.from(new Set(followerRows.map((row) => row.user_id).filter(Boolean)));
    let followerUsersById: Record<string, FollowerUserRow> = {};

    if (followerIds.length > 0) {
      const { data: followerUsers, error: followerUsersError } = await supabaseAdmin
        .from('users')
        .select('id, full_name, email')
        .in('id', followerIds);

      if (followerUsersError) {
        return NextResponse.json({ success: false, message: followerUsersError.message }, { status: 500 });
      }

      followerUsersById = ((followerUsers || []) as FollowerUserRow[]).reduce<Record<string, FollowerUserRow>>((acc, user) => {
        acc[user.id] = user;
        return acc;
      }, {});
    }

    for (const row of followerRows) {
      const followedAt = new Date(String(row.created_at || ''));
      if (Number.isNaN(followedAt.getTime()) || followedAt.getTime() < last24Hours) {
        continue;
      }

      const follower = followerUsersById[row.user_id];
      const followerName = follower?.full_name || follower?.email || 'A customer';

      notifications.push({
        id: `follow-${row.id}`,
        icon: 'fa-solid fa-user-plus',
        title: 'New follower',
        body: `${followerName} started following your shop.`,
        time: followedAt.toISOString(),
        tone: 'neutral',
      });
    }

    notifications.push(...orderNotificationMap.values());
    notifications.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

    return NextResponse.json({
      success: true,
      stats: {
        revenue,
        orders: uniqueOrders.size,
        products: productsCount || 0,
        pending_orders: pendingOrders.size,
      },
      notifications: notifications.slice(0, 8),
      revenue_chart: revenueChart,
    });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, message: getErrorMessage(error) }, { status: 500 });
  }
}
