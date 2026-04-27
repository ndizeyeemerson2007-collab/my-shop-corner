'use client';

import { useEffect, useMemo, useState } from 'react';
import AuthStatusCard from '../../components/AuthStatusCard';
import { useConfirm } from '../../components/ConfirmProvider';
import { useProtectedAuth } from '../../hooks/useProtectedAuth';
import { resolveProductImagePath, safeFetch } from '../../services/api';

type AdminStats = {
  total_users: number;
  active_users: number;
  suspended_users: number;
  total_sellers: number;
  pending_sellers: number;
  approved_sellers: number;
  total_buyers: number;
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
};

const emptyStats: AdminStats = {
  total_users: 0,
  active_users: 0,
  suspended_users: 0,
  total_sellers: 0,
  pending_sellers: 0,
  approved_sellers: 0,
  total_buyers: 0,
  total_products: 0,
  total_orders: 0,
  total_revenue: 0,
  delivery_fees: 0,
  product_sales: 0,
};

function getUserLabel(user: AdminUser) {
  return user.full_name || user.business_name || user.email || 'Unknown user';
}

function getRoleLabel(user: AdminUser) {
  if (user.role === 'seller') return 'Seller';
  if (user.role === 'admin') return 'Admin';
  return 'Buyer';
}

export default function AdminPage() {
  const confirm = useConfirm();
  const { loading, user, accessBlocked, message } = useProtectedAuth({ requiredRole: 'admin' });
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState('');
  const [stats, setStats] = useState<AdminStats>(emptyStats);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [revenueChart, setRevenueChart] = useState<RevenuePoint[]>([]);
  const [pendingSellers, setPendingSellers] = useState<AdminUser[]>([]);
  const [recentlyApprovedSellers, setRecentlyApprovedSellers] = useState<AdminUser[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [suspendedUsers, setSuspendedUsers] = useState<AdminUser[]>([]);
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [userSearch, setUserSearch] = useState('');

  const loadDashboard = async () => {
    setDashboardLoading(true);
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
    } catch (error) {
      console.error('Admin dashboard error', error);
    } finally {
      setDashboardLoading(false);
    }
  };

  useEffect(() => {
    if (loading || accessBlocked || !user) return;
    void loadDashboard();
  }, [accessBlocked, loading, user]);

  const handleUserAction = async (
    targetUser: AdminUser,
    action: 'approve_seller' | 'reject_seller' | 'suspend' | 'reactivate' | 'deactivate',
  ) => {
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

      await loadDashboard();
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

      await loadDashboard();
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

  const maxRevenue = Math.max(1, ...revenueChart.map((item) => item.revenue || 0));

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
      <section className="admin-central-hero">
        <div>
          <p className="admin-central-kicker">MyShop command room</p>
          <h1>Admin dashboard for approvals, platform control, and user safety.</h1>
          <p>
            Review seller requests, monitor trade value, control product visibility, and suspend or reactivate accounts from one place.
          </p>
        </div>
        <div className="admin-central-hero-stats">
          <div className="admin-central-stat-pill">
            <strong>{stats.pending_sellers}</strong>
            <span>Pending sellers</span>
          </div>
          <div className="admin-central-stat-pill">
            <strong>{stats.total_revenue.toLocaleString()}</strong>
            <span>Platform GMV</span>
          </div>
          <div className="admin-central-stat-pill">
            <strong>{stats.suspended_users}</strong>
            <span>Suspended users</span>
          </div>
        </div>
      </section>

      <section className="admin-central-grid">
        <article className="admin-phone-card">
          <h2>Seller Approvals</h2>
          <div className="admin-phone-shell">
            <div className="admin-phone-topbar">
              <span>MyShop Central</span>
              <span>{stats.pending_sellers} pending</span>
            </div>
            <div className="admin-phone-body">
              <div className="admin-phone-sidebar">
                <i className="fa-solid fa-house"></i>
                <i className="fa-solid fa-users"></i>
                <i className="fa-solid fa-user-check"></i>
                <i className="fa-solid fa-gear"></i>
              </div>
              <div className="admin-phone-content">
                <div className="admin-panel-section">
                  <h3>New Seller Requests</h3>
                  <p>Approve sellers only after reviewing their details.</p>
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
                            onClick={() => void handleUserAction(seller, 'approve_seller')}
                            disabled={actionLoadingId === seller.id}
                          >
                            {actionLoadingId === seller.id ? 'Working...' : 'Approve'}
                          </button>
                          <button
                            type="button"
                            className="admin-central-btn reject"
                            onClick={() => void handleUserAction(seller, 'reject_seller')}
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
                  {recentlyApprovedSellers.slice(0, 4).map((seller) => (
                    <div key={seller.id} className="admin-mini-row">
                      <div>
                        <strong>{seller.business_name || getUserLabel(seller)}</strong>
                        <small>{seller.email}</small>
                      </div>
                      <span className="admin-status-chip verified">Approved</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </article>

        <article className="admin-phone-card">
          <h2>Global Product Manager</h2>
          <div className="admin-phone-shell">
            <div className="admin-phone-topbar">
              <span>MyShop Central</span>
              <span>{stats.total_products} products</span>
            </div>
            <div className="admin-phone-body">
              <div className="admin-phone-sidebar">
                <i className="fa-solid fa-box"></i>
                <i className="fa-solid fa-layer-group"></i>
                <i className="fa-solid fa-store"></i>
                <i className="fa-solid fa-filter"></i>
              </div>
              <div className="admin-phone-content">
                <div className="admin-search-wrap">
                  <input
                    type="text"
                    value={productSearch}
                    onChange={(event) => setProductSearch(event.target.value)}
                    placeholder="Search products or sellers"
                  />
                </div>
                <div className="admin-product-list">
                  {filteredProducts.slice(0, 7).map((product) => (
                    <div key={product.id} className="admin-product-row-card">
                      <div className="admin-product-row-main">
                        {resolveProductImagePath(product.image) ? (
                          <img src={resolveProductImagePath(product.image)} alt={product.name} />
                        ) : (
                          <div className="admin-product-row-fallback" />
                        )}
                        <div>
                          <strong>{product.name}</strong>
                          <p>{product.seller_business_name || product.seller_name || 'Unknown seller'}</p>
                        </div>
                      </div>
                      <div className="admin-product-row-meta">
                        <span>RWF {Number(product.price || 0).toLocaleString()}</span>
                        <small>Stock {Number(product.stock || 0)}</small>
                      </div>
                      <button
                        type="button"
                        className="admin-central-btn danger-outline"
                        onClick={() => void handleDeleteProduct(product)}
                        disabled={actionLoadingId === `product-${product.id}`}
                      >
                        {actionLoadingId === `product-${product.id}` ? 'Removing...' : 'Remove'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </article>

        <article className="admin-phone-card">
          <h2>Money Monitor</h2>
          <div className="admin-phone-shell">
            <div className="admin-phone-topbar">
              <span>MyShop Central</span>
              <span>{stats.total_orders} orders</span>
            </div>
            <div className="admin-phone-body">
              <div className="admin-phone-sidebar">
                <i className="fa-solid fa-wallet"></i>
                <i className="fa-solid fa-chart-line"></i>
                <i className="fa-solid fa-chart-pie"></i>
                <i className="fa-solid fa-chart-column"></i>
              </div>
              <div className="admin-phone-content">
                <div className="admin-money-hero">
                  <span>Total Platform GMV</span>
                  <strong>RWF {Number(stats.total_revenue || 0).toLocaleString()}</strong>
                  <small>Products: RWF {Number(stats.product_sales || 0).toLocaleString()} | Delivery: RWF {Number(stats.delivery_fees || 0).toLocaleString()}</small>
                </div>
                <div className="admin-money-grid">
                  <div className="admin-money-card">
                    <span>Pending</span>
                    <strong>{statusCounts.pending || 0}</strong>
                  </div>
                  <div className="admin-money-card">
                    <span>Paid</span>
                    <strong>{statusCounts.paid || 0}</strong>
                  </div>
                  <div className="admin-money-card">
                    <span>Processing</span>
                    <strong>{statusCounts.processing || 0}</strong>
                  </div>
                  <div className="admin-money-card">
                    <span>Delivered</span>
                    <strong>{statusCounts.delivered || 0}</strong>
                  </div>
                </div>
                <div className="admin-chart-card">
                  <h3>Revenue Trend</h3>
                  <div className="admin-bar-chart">
                    {revenueChart.map((item) => (
                      <div key={item.key} className="admin-bar-column">
                        <div
                          className="admin-bar-fill"
                          style={{ height: `${Math.max(12, (item.revenue / maxRevenue) * 120)}px` }}
                        />
                        <span>{item.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </article>

        <article className="admin-phone-card">
          <h2>User Suspension Control</h2>
          <div className="admin-phone-shell">
            <div className="admin-phone-topbar">
              <span>MyShop Central</span>
              <span>{stats.suspended_users} suspended</span>
            </div>
            <div className="admin-phone-body">
              <div className="admin-phone-sidebar">
                <i className="fa-solid fa-user-shield"></i>
                <i className="fa-solid fa-user-slash"></i>
                <i className="fa-solid fa-user-check"></i>
                <i className="fa-solid fa-gear"></i>
              </div>
              <div className="admin-phone-content">
                <div className="admin-search-wrap">
                  <input
                    type="text"
                    value={userSearch}
                    onChange={(event) => setUserSearch(event.target.value)}
                    placeholder="Search username, email, phone"
                  />
                </div>
                <div className="admin-panel-section">
                  <h3>Manage Access</h3>
                </div>
                <div className="admin-list-stack">
                  {filteredUsers.slice(0, 6).map((entry) => (
                    <div key={entry.id} className="admin-central-item-card">
                      <div className="admin-central-item-head">
                        <strong>{getUserLabel(entry)}</strong>
                        <span className={`admin-status-chip ${String(entry.account_status || 'active').toLowerCase()}`}>
                          {String(entry.account_status || 'active')}
                        </span>
                      </div>
                      <p>{entry.email}</p>
                      <p>Type: {getRoleLabel(entry)}</p>
                      <div className="admin-central-actions">
                        <button
                          type="button"
                          className="admin-central-btn reject"
                          onClick={() => void handleUserAction(entry, 'suspend')}
                          disabled={actionLoadingId === entry.id || String(entry.account_status || '').toLowerCase() === 'suspended'}
                        >
                          Suspend
                        </button>
                        <button
                          type="button"
                          className="admin-central-btn danger-outline"
                          onClick={() => void handleUserAction(entry, 'deactivate')}
                          disabled={actionLoadingId === entry.id || String(entry.account_status || '').toLowerCase() === 'deactivated'}
                        >
                          Deactivate
                        </button>
                      </div>
                    </div>
                  ))}
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
                          onClick={() => void handleUserAction(entry, 'reactivate')}
                          disabled={actionLoadingId === entry.id}
                        >
                          Reactivate
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </article>
      </section>
    </main>
  );
}
