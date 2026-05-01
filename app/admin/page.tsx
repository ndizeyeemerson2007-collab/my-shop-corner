'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import AuthStatusCard from '../../components/AuthStatusCard';
import { useConfirm } from '../../components/ConfirmProvider';
import { useProtectedAuth } from '../../hooks/useProtectedAuth';
import { resolveProductImagePath, safeFetch } from '../../services/api';

type AdminStats = {
  total_users: number;
  active_users: number;
  suspended_users: number;
  total_sellers: number;
  active_sellers?: number;
  pending_sellers: number;
  approved_sellers: number;
  total_buyers: number;
  new_buyers?: number;
  total_products: number;
  total_orders: number;
  total_revenue: number;
  delivery_fees: number;
  product_sales: number;
};

type AdminUser = {
  id: string;
  email: string;
  full_name?: string | null;
  phone?: string | null;
  address?: string | null;
  role?: string | null;
  business_name?: string | null;
  created_at?: string;
  account_status?: string | null;
  seller_approval_status?: string | null;
};

type AdminProduct = {
  id: number;
  name: string;
  price: number;
  stock?: number | null;
  image?: string | null;
  badge?: string | null;
  category?: string | null;
  seller_name?: string | null;
  seller_business_name?: string | null;
};

type RevenuePoint = {
  key: string;
  label: string;
  revenue: number;
};

type AdminNotification = {
  id: string;
  tone: 'warning' | 'success' | 'neutral';
  title: string;
  detail: string;
};

type RecentOrder = {
  id: number;
  status?: string | null;
  total_amount?: number | null;
  delivery_fee?: number | null;
  created_at?: string | null;
  full_name?: string | null;
  buyer_name?: string | null;
  buyer_email?: string | null;
};

type AdminTab = 'overview' | 'sellers' | 'products' | 'users';

type DashboardPayload = {
  success: boolean;
  stats: AdminStats;
  order_status_counts: Record<string, number>;
  revenue_chart: RevenuePoint[];
  pending_sellers: AdminUser[];
  recently_approved_sellers: AdminUser[];
  users: AdminUser[];
  suspended_users_list: AdminUser[];
  products: AdminProduct[];
  low_stock_products: AdminProduct[];
  recent_orders: RecentOrder[];
};

const emptyStats: AdminStats = {
  total_users: 0,
  active_users: 0,
  suspended_users: 0,
  total_sellers: 0,
  active_sellers: 0,
  pending_sellers: 0,
  approved_sellers: 0,
  total_buyers: 0,
  new_buyers: 0,
  total_products: 0,
  total_orders: 0,
  total_revenue: 0,
  delivery_fees: 0,
  product_sales: 0,
};

type UserAction = 'approve_seller' | 'reject_seller' | 'suspend' | 'reactivate' | 'deactivate';

function getUserLabel(user: AdminUser) {
  return user.full_name || user.business_name || user.email || 'Unknown user';
}

function getRoleLabel(user: AdminUser) {
  if (user.role === 'seller') return 'Seller';
  if (user.role === 'admin') return 'Admin';
  return 'Buyer';
}

function formatCurrency(value: number) {
  return `RWF ${Number(value || 0).toLocaleString()}`;
}

function formatDate(value?: string | null) {
  if (!value) return 'Recently';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Recently';

  return parsed.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getOrderStatusTone(status?: string | null) {
  const value = String(status || 'pending').toLowerCase();
  if (value === 'delivered' || value === 'paid') return 'active';
  if (value === 'processing') return 'pending';
  if (value === 'cancelled' || value === 'failed') return 'rejected';
  return 'pending';
}

type OverviewViewProps = {
  stats: AdminStats;
  statusCounts: Record<string, number>;
  revenueChart: RevenuePoint[];
  maxRevenue: number;
  notifications: AdminNotification[];
  pendingSellers: AdminUser[];
  lowStockProducts: AdminProduct[];
  recentOrders: RecentOrder[];
  lastUpdatedLabel: string;
  refreshing: boolean;
  onRefresh: () => Promise<void>;
};

function OverviewView({
  stats,
  statusCounts,
  revenueChart,
  maxRevenue,
  notifications,
  pendingSellers,
  lowStockProducts,
  recentOrders,
  lastUpdatedLabel,
  refreshing,
  onRefresh,
}: OverviewViewProps) {
  const activeUserRate = stats.total_users > 0 ? Math.round((stats.active_users / stats.total_users) * 100) : 0;
  const sellerApprovalRate = stats.total_sellers > 0 ? Math.round((stats.approved_sellers / stats.total_sellers) * 100) : 0;
  const deliveredRate = stats.total_orders > 0 ? Math.round(((statusCounts.delivered || 0) / stats.total_orders) * 100) : 0;

  const highlightCards = [
    { label: 'Revenue', value: formatCurrency(stats.total_revenue), meta: `${stats.total_orders} orders tracked` },
    { label: 'Pending sellers', value: String(stats.pending_sellers), meta: `${stats.approved_sellers} already approved` },
    { label: 'Active users', value: `${activeUserRate}%`, meta: `${stats.active_users} of ${stats.total_users}` },
    { label: 'Seller approval', value: `${sellerApprovalRate}%`, meta: `${stats.active_sellers || 0} active shops` },
  ];

  const pipelineCards = [
    { label: 'Pending orders', value: statusCounts.pending || 0 },
    { label: 'Processing', value: statusCounts.processing || 0 },
    { label: 'Delivered', value: statusCounts.delivered || 0 },
    { label: 'New buyers', value: stats.new_buyers || 0 },
  ];

  return (
    <div className="admin-mobile-view">
      <section className="admin-dashboard-hero">
        <div className="admin-dashboard-hero-copy">
          <p className="admin-central-kicker">Admin command center</p>
          <h1>SHOP CORNER RWANDA CONTROL</h1>
          
        </div>

        <div className="admin-dashboard-hero-side">
          <div className="admin-dashboard-live-card">
            <span>Last updated</span>
            <strong>{lastUpdatedLabel}</strong>
            <button
              type="button"
              className="admin-central-btn danger-outline"
              onClick={() => void onRefresh()}
              disabled={refreshing}
            >
              {refreshing ? 'Refreshing...' : 'Refresh data'}
            </button>
          </div>

          <div className="admin-dashboard-live-card dark">
            <span>Delivery completion</span>
            <strong>{deliveredRate}%</strong>
            <small>{statusCounts.delivered || 0} delivered orders</small>
          </div>
        </div>
      </section>

      <section className="admin-dashboard-grid admin-dashboard-grid-top">
        {highlightCards.map((card) => (
          <article key={card.label} className="admin-kpi-card">
            <span>{card.label}</span>
            <strong>{card.value}</strong>
            <small>{card.meta}</small>
          </article>
        ))}
      </section>

      <section className="admin-dashboard-grid admin-dashboard-grid-main">
        <article className="admin-dashboard-panel admin-dashboard-panel-wide">
          <div className="admin-dashboard-panel-head">
            <div>
              <h2>Platform notifications</h2>
              <p>Priority signals generated from live admin data.</p>
            </div>
          </div>

          <div className="admin-notification-list">
            {notifications.map((item) => (
              <div key={item.id} className={`admin-notification-card ${item.tone}`}>
                <strong>{item.title}</strong>
                <span>{item.detail}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="admin-dashboard-panel">
          <div className="admin-dashboard-panel-head">
            <div>
              <h2>Order pipeline</h2>
              <p>Current queue across the platform.</p>
            </div>
          </div>

          <div className="admin-compact-grid">
            {pipelineCards.map((card) => (
              <div key={card.label} className="admin-money-card">
                <span>{card.label}</span>
                <strong>{card.value}</strong>
              </div>
            ))}
          </div>
        </article>

        <article className="admin-dashboard-panel admin-dashboard-panel-wide">
          <div className="admin-dashboard-panel-head">
            <div>
              <h2>Revenue trend</h2>
              <p>Last 7 days of order value.</p>
            </div>
            <strong className="admin-panel-figure">{formatCurrency(stats.product_sales)}</strong>
          </div>

          <div className="admin-chart-card admin-chart-card-embedded">
            <div className="admin-bar-chart">
              {revenueChart.map((item) => (
                <div key={item.key} className="admin-bar-column">
                  <div
                    className="admin-bar-fill"
                    style={{ height: `${Math.max(14, (item.revenue / maxRevenue) * 170)}px` }}
                    title={`${item.label}: ${formatCurrency(item.revenue)}`}
                  />
                  <small>{formatCurrency(item.revenue)}</small>
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </article>

        <article className="admin-dashboard-panel">
          <div className="admin-dashboard-panel-head">
            <div>
              <h2>Seller queue</h2>
              <p>Newest applications waiting for review.</p>
            </div>
          </div>

          <div className="admin-mini-list">
            {pendingSellers.length === 0 ? (
              <div className="admin-central-empty">No pending seller requests.</div>
            ) : (
              pendingSellers.slice(0, 4).map((seller) => (
                <div key={seller.id} className="admin-mini-row">
                  <div>
                    <strong>{seller.business_name || getUserLabel(seller)}</strong>
                    <small>{seller.email}</small>
                  </div>
                  <span className="admin-status-chip pending">Pending</span>
                </div>
              ))
            )}
          </div>
        </article>

        <article className="admin-dashboard-panel">
          <div className="admin-dashboard-panel-head">
            <div>
              <h2>Low stock alerts</h2>
              <p>Products that may need restocking soon.</p>
            </div>
          </div>

          <div className="admin-mini-list">
            {lowStockProducts.length === 0 ? (
              <div className="admin-central-empty">No low-stock items in the recent catalog view.</div>
            ) : (
              lowStockProducts.map((product) => (
                <div key={product.id} className="admin-mini-row">
                  <div>
                    <strong>{product.name}</strong>
                    <small>{product.seller_business_name || product.seller_name || 'Unknown seller'}</small>
                  </div>
                  <span className="admin-status-chip pending">Stock {Number(product.stock || 0)}</span>
                </div>
              ))
            )}
          </div>
        </article>

        <article className="admin-dashboard-panel admin-dashboard-panel-wide">
          <div className="admin-dashboard-panel-head">
            <div>
              <h2>Recent orders</h2>
              <p>Latest activity reaching the storefront.</p>
            </div>
          </div>

          <div className="admin-order-feed">
            {recentOrders.length === 0 ? (
              <div className="admin-central-empty">No recent orders yet.</div>
            ) : (
              recentOrders.map((order) => (
                <div key={order.id} className="admin-order-feed-row">
                  <div>
                    <strong>Order #{order.id}</strong>
                    <p>{order.full_name || order.buyer_name || order.buyer_email || 'Unknown buyer'}</p>
                  </div>
                  <div>
                    <strong>{formatCurrency(Number(order.total_amount || 0))}</strong>
                    <p>{formatDate(order.created_at)}</p>
                  </div>
                  <span className={`admin-status-chip ${getOrderStatusTone(order.status)}`}>
                    {String(order.status || 'pending')}
                  </span>
                </div>
              ))
            )}
          </div>
        </article>
      </section>
    </div>
  );
}

type SellersViewProps = {
  pendingSellers: AdminUser[];
  recentlyApprovedSellers: AdminUser[];
  actionLoadingId: string;
  onUserAction: (targetUser: AdminUser, action: UserAction) => Promise<void>;
};

function SellersView({
  pendingSellers,
  recentlyApprovedSellers,
  actionLoadingId,
  onUserAction,
}: SellersViewProps) {
  return (
    <section className="admin-mobile-view admin-mobile-section">
      <div className="admin-mobile-section-head">
        <div>
          <h2>Seller approvals</h2>
          <p>Review shop requests and track recent approvals.</p>
        </div>
      </div>

      <div className="admin-panel-section">
        <h3>New Seller Requests</h3>
        <p>Approve or reject applications.</p>
      </div>

      <div className="admin-list-stack">
        {pendingSellers.length === 0 ? (
          <div className="admin-central-empty">No pending seller requests.</div>
        ) : (
          pendingSellers.map((seller) => (
            <div key={seller.id} className="admin-central-item-card">
              <div className="admin-central-item-head">
                <strong>{getUserLabel(seller)}</strong>
                <span className="admin-status-chip pending">Pending</span>
              </div>
              <p>Store: {seller.business_name || 'No store name'}</p>
              <p>Email: {seller.email}</p>
              <p>Phone: {seller.phone || 'N/A'}</p>
              <div className="admin-central-actions">
                <button
                  type="button"
                  className="admin-central-btn approve"
                  onClick={() => void onUserAction(seller, 'approve_seller')}
                  disabled={actionLoadingId === seller.id}
                >
                  {actionLoadingId === seller.id ? 'Working...' : 'Approve'}
                </button>
                <button
                  type="button"
                  className="admin-central-btn reject"
                  onClick={() => void onUserAction(seller, 'reject_seller')}
                  disabled={actionLoadingId === seller.id}
                >
                  Reject
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="admin-panel-section">
        <h3>Recently Approved</h3>
      </div>
      <div className="admin-mini-list">
        {recentlyApprovedSellers.length === 0 ? (
          <div className="admin-central-empty">No recently approved sellers yet.</div>
        ) : (
          recentlyApprovedSellers.map((seller) => (
            <div key={seller.id} className="admin-mini-row">
              <div>
                <strong>{seller.business_name || getUserLabel(seller)}</strong>
                <small>{seller.email}</small>
              </div>
              <span className="admin-status-chip verified">Approved</span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

type ProductsViewProps = {
  productSearch: string;
  onProductSearchChange: (value: string) => void;
  filteredProducts: AdminProduct[];
  actionLoadingId: string;
  onDeleteProduct: (product: AdminProduct) => Promise<void>;
};

function ProductsView({
  productSearch,
  onProductSearchChange,
  filteredProducts,
  actionLoadingId,
  onDeleteProduct,
}: ProductsViewProps) {
  return (
    <section className="admin-mobile-view admin-mobile-section">
      <div className="admin-mobile-section-head">
        <div>
          <h2>Catalog control</h2>
          <p>Search products and remove anything that should not stay live.</p>
        </div>
      </div>

      <div className="admin-search-wrap">
        <input
          type="text"
          value={productSearch}
          onChange={(event) => onProductSearchChange(event.target.value)}
          placeholder="Search products or sellers"
        />
      </div>

      <div className="admin-product-list">
        {filteredProducts.length === 0 ? (
          <div className="admin-central-empty">No products match the current search.</div>
        ) : (
          filteredProducts.map((product) => (
            <div key={product.id} className="admin-product-row-card admin-product-row-card-full">
              <div className="admin-product-row-main">
                {resolveProductImagePath(product.image) ? (
                  <Image
                    src={resolveProductImagePath(product.image)}
                    alt={product.name}
                    width={48}
                    height={48}
                  />
                ) : (
                  <div className="admin-product-row-fallback" />
                )}
                <div>
                  <strong>{product.name}</strong>
                  <p>{product.seller_business_name || product.seller_name || 'Unknown seller'}</p>
                  <p>{product.category || 'Uncategorized product'}</p>
                </div>
              </div>
              <div className="admin-product-row-meta">
                <span>{formatCurrency(Number(product.price || 0))}</span>
                <small>Stock {Number(product.stock || 0)}</small>
              </div>
              <button
                type="button"
                className="admin-central-btn danger-outline"
                onClick={() => void onDeleteProduct(product)}
                disabled={actionLoadingId === `product-${product.id}`}
              >
                {actionLoadingId === `product-${product.id}` ? 'Removing...' : 'Remove'}
              </button>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

type UsersViewProps = {
  userSearch: string;
  onUserSearchChange: (value: string) => void;
  filteredUsers: AdminUser[];
  suspendedUsers: AdminUser[];
  actionLoadingId: string;
  onUserAction: (targetUser: AdminUser, action: UserAction) => Promise<void>;
};

function UsersView({
  userSearch,
  onUserSearchChange,
  filteredUsers,
  suspendedUsers,
  actionLoadingId,
  onUserAction,
}: UsersViewProps) {
  return (
    <section className="admin-mobile-view admin-mobile-section">
      <div className="admin-mobile-section-head">
        <div>
          <h2>User control</h2>
          <p>Search accounts, suspend risky users, and reactivate them when needed.</p>
        </div>
      </div>

      <div className="admin-search-wrap">
        <input
          type="text"
          value={userSearch}
          onChange={(event) => onUserSearchChange(event.target.value)}
          placeholder="Search username, email, phone"
        />
      </div>

      <div className="admin-panel-section">
        <h3>Manage Access</h3>
        <p>Control account status from one list.</p>
      </div>

      <div className="admin-list-stack">
        {filteredUsers.length === 0 ? (
          <div className="admin-central-empty">No users match the current search.</div>
        ) : (
          filteredUsers.map((entry) => {
            const accountStatus = String(entry.account_status || 'active').toLowerCase();

            return (
              <div key={entry.id} className="admin-central-item-card">
                <div className="admin-central-item-head">
                  <strong>{getUserLabel(entry)}</strong>
                  <span className={`admin-status-chip ${accountStatus}`}>
                    {String(entry.account_status || 'active')}
                  </span>
                </div>
                <p>{entry.email}</p>
                <p>Type: {getRoleLabel(entry)}</p>
                <div className="admin-central-actions">
                  <button
                    type="button"
                    className="admin-central-btn reject"
                    onClick={() => void onUserAction(entry, 'suspend')}
                    disabled={actionLoadingId === entry.id || accountStatus === 'suspended'}
                  >
                    Suspend
                  </button>
                  <button
                    type="button"
                    className="admin-central-btn danger-outline"
                    onClick={() => void onUserAction(entry, 'deactivate')}
                    disabled={actionLoadingId === entry.id || accountStatus === 'deactivated'}
                  >
                    Deactivate
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="admin-panel-section">
        <h3>Currently Suspended</h3>
      </div>

      <div className="admin-mini-list">
        {suspendedUsers.length === 0 ? (
          <div className="admin-central-empty">No suspended users.</div>
        ) : (
          suspendedUsers.map((entry) => (
            <div key={entry.id} className="admin-mini-row">
              <div>
                <strong>{getUserLabel(entry)}</strong>
                <small>{entry.email}</small>
              </div>
              <button
                type="button"
                className="admin-central-btn approve"
                onClick={() => void onUserAction(entry, 'reactivate')}
                disabled={actionLoadingId === entry.id}
              >
                Reactivate
              </button>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

export default function AdminPage() {
  const searchParams = useSearchParams();
  const confirm = useConfirm();
  const { loading, user, accessBlocked, message } = useProtectedAuth({ requiredRole: 'admin' });
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState('');
  const [stats, setStats] = useState<AdminStats>(emptyStats);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [revenueChart, setRevenueChart] = useState<RevenuePoint[]>([]);
  const [pendingSellers, setPendingSellers] = useState<AdminUser[]>([]);
  const [recentlyApprovedSellers, setRecentlyApprovedSellers] = useState<AdminUser[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [suspendedUsers, setSuspendedUsers] = useState<AdminUser[]>([]);
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [lowStockProducts, setLowStockProducts] = useState<AdminProduct[]>([]);
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [lastUpdatedAt, setLastUpdatedAt] = useState('');

  const loadDashboard = async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setDashboardLoading(true);
    }

    try {
      const result = await safeFetch<DashboardPayload>('/api/admin/dashboard');
      if (!result.success) {
        throw new Error('Could not load admin dashboard');
      }

      setStats(result.stats || emptyStats);
      setStatusCounts(result.order_status_counts || {});
      setRevenueChart(result.revenue_chart || []);
      setPendingSellers(result.pending_sellers || []);
      setRecentlyApprovedSellers(result.recently_approved_sellers || []);
      setUsers(result.users || []);
      setSuspendedUsers(result.suspended_users_list || []);
      setProducts(result.products || []);
      setLowStockProducts(result.low_stock_products || []);
      setRecentOrders(result.recent_orders || []);
      setLastUpdatedAt(new Date().toISOString());
    } catch (error) {
      console.error('Admin dashboard error', error);
    } finally {
      setDashboardLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (loading || accessBlocked || !user) return;
    void loadDashboard();
  }, [accessBlocked, loading, user]);

  const handleUserAction = async (targetUser: AdminUser, action: UserAction) => {
    const actionLabelMap = {
      approve_seller: 'approve this seller request',
      reject_seller: 'reject this seller request',
      suspend: 'suspend this user',
      reactivate: 'reactivate this user',
      deactivate: 'deactivate this user',
    } as const;

    const confirmed = await confirm({
      title: 'Confirm Admin Action',
      message: `Do you want to ${actionLabelMap[action]}?`,
      confirmText: 'Yes',
      cancelText: 'No',
      iconClass: 'fa-solid fa-shield-halved',
    });

    if (!confirmed) return;

    setActionLoadingId(targetUser.id);

    try {
      const result = await safeFetch<{ success: boolean; message?: string }>('/api/admin/users', {
        method: 'PATCH',
        body: JSON.stringify({ user_id: targetUser.id, action }),
      });

      if (!result.success) {
        window.alert(result.message || 'Action failed.');
        return;
      }

      await loadDashboard(true);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Action failed.');
    } finally {
      setActionLoadingId('');
    }
  };

  const handleDeleteProduct = async (product: AdminProduct) => {
    const confirmed = await confirm({
      title: 'Remove Product',
      message: `Do you want to remove ${product.name} from the platform?`,
      confirmText: 'Remove',
      cancelText: 'Keep',
      iconClass: 'fa-solid fa-trash-can',
    });

    if (!confirmed) return;

    setActionLoadingId(`product-${product.id}`);

    try {
      const result = await safeFetch<{ success: boolean; message?: string }>(`/api/admin/products?id=${product.id}`, {
        method: 'DELETE',
      });

      if (!result.success) {
        window.alert(result.message || 'Could not remove product.');
        return;
      }

      await loadDashboard(true);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Could not remove product.');
    } finally {
      setActionLoadingId('');
    }
  };

  const filteredProducts = useMemo(() => {
    const searchValue = productSearch.trim().toLowerCase();
    if (!searchValue) return products;

    return products.filter((product) =>
      [product.name, product.category, product.seller_name, product.seller_business_name]
        .map((value) => String(value || '').toLowerCase())
        .some((value) => value.includes(searchValue)),
    );
  }, [productSearch, products]);

  const filteredUsers = useMemo(() => {
    const searchValue = userSearch.trim().toLowerCase();
    if (!searchValue) return users;

    return users.filter((entry) =>
      [entry.full_name, entry.email, entry.business_name, entry.phone]
        .map((value) => String(value || '').toLowerCase())
        .some((value) => value.includes(searchValue)),
    );
  }, [userSearch, users]);

  const notifications = useMemo<AdminNotification[]>(() => {
    const items: AdminNotification[] = [];

    if (stats.pending_sellers > 0) {
      items.push({
        id: 'pending-sellers',
        tone: 'warning',
        title: `${stats.pending_sellers} seller request${stats.pending_sellers > 1 ? 's' : ''} waiting`,
        detail: 'Open the Sellers tab to approve new shops before they lose momentum.',
      });
    }

    if (lowStockProducts.length > 0) {
      items.push({
        id: 'low-stock',
        tone: 'warning',
        title: `${lowStockProducts.length} low-stock product${lowStockProducts.length > 1 ? 's' : ''}`,
        detail: 'Some items are almost sold out and may need restocking or visibility checks.',
      });
    }

    if ((statusCounts.processing || 0) + (statusCounts.pending || 0) > 0) {
      const queuedOrders = (statusCounts.processing || 0) + (statusCounts.pending || 0);
      items.push({
        id: 'order-queue',
        tone: 'neutral',
        title: `${queuedOrders} order${queuedOrders > 1 ? 's' : ''} in queue`,
        detail: 'Track these orders closely so delivery and payment flow stay healthy.',
      });
    }

    if (stats.new_buyers && stats.new_buyers > 0) {
      items.push({
        id: 'new-buyers',
        tone: 'success',
        title: `${stats.new_buyers} new buyer${stats.new_buyers > 1 ? 's' : ''} this week`,
        detail: 'Customer growth is moving. Keep inventory and support ready for repeat orders.',
      });
    }

    if (stats.suspended_users > 0) {
      items.push({
        id: 'suspended-users',
        tone: 'neutral',
        title: `${stats.suspended_users} account${stats.suspended_users > 1 ? 's' : ''} suspended`,
        detail: 'Review account safety regularly to avoid blocking users longer than needed.',
      });
    }

    if (items.length === 0) {
      items.push({
        id: 'steady-state',
        tone: 'success',
        title: 'Everything looks stable',
        detail: 'No urgent seller, stock, or order alerts are coming from the current dashboard data.',
      });
    }

    return items.slice(0, 5);
  }, [lowStockProducts.length, stats.new_buyers, stats.pending_sellers, stats.suspended_users, statusCounts.pending, statusCounts.processing]);

  const activeTabParam = searchParams.get('tab');
  const activeTab: AdminTab =
    activeTabParam === 'sellers' || activeTabParam === 'products' || activeTabParam === 'users'
      ? activeTabParam
      : 'overview';

  const maxRevenue = Math.max(1, ...revenueChart.map((item) => item.revenue || 0));
  const lastUpdatedLabel = lastUpdatedAt ? formatDate(lastUpdatedAt) : 'Not yet updated';

  const renderActiveView = () => {
    switch (activeTab) {
      case 'overview':
        return (
          <OverviewView
            stats={stats}
            statusCounts={statusCounts}
            revenueChart={revenueChart}
            maxRevenue={maxRevenue}
            notifications={notifications}
            pendingSellers={pendingSellers}
            lowStockProducts={lowStockProducts}
            recentOrders={recentOrders}
            lastUpdatedLabel={lastUpdatedLabel}
            refreshing={refreshing}
            onRefresh={() => loadDashboard(true)}
          />
        );
      case 'sellers':
        return (
          <SellersView
            pendingSellers={pendingSellers}
            recentlyApprovedSellers={recentlyApprovedSellers}
            actionLoadingId={actionLoadingId}
            onUserAction={handleUserAction}
          />
        );
      case 'products':
        return (
          <ProductsView
            productSearch={productSearch}
            onProductSearchChange={setProductSearch}
            filteredProducts={filteredProducts}
            actionLoadingId={actionLoadingId}
            onDeleteProduct={handleDeleteProduct}
          />
        );
      case 'users':
        return (
          <UsersView
            userSearch={userSearch}
            onUserSearchChange={setUserSearch}
            filteredUsers={filteredUsers}
            suspendedUsers={suspendedUsers}
            actionLoadingId={actionLoadingId}
            onUserAction={handleUserAction}
          />
        );
      default:
        return null;
    }
  };

  if (loading || dashboardLoading) {
    return (
      <AuthStatusCard
        title="Loading admin control center"
        message="Checking your admin session and preparing the dashboard."
        loading
      />
    );
  }

  if (accessBlocked) {
    return (
      <AuthStatusCard
        title="Admin access blocked"
        message={message}
      />
    );
  }

  return (
    <main className="admin-central-page">
      <section className="admin-mobile-shell" data-active-tab={activeTab}>
        {renderActiveView()}
      </section>
    </main>
  );
}
