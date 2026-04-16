'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUserFromServer, handleLogoutLocal, safeFetch } from '../../services/api';
import { User } from '../../types';
import { useConfirm } from '../../components/ConfirmProvider';

type UserOrder = {
  id: number;
  status: string;
  total_amount: number;
  created_at: string;
  items?: Array<{
    id: number;
    product_name: string;
    quantity: number;
    color?: string | null;
    size?: string | null;
  }>;
};

export default function ProfilePage() {
  const confirm = useConfirm();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'dash' | 'settings' | 'orders'>('dash');
  const [saving, setSaving] = useState(false);
  const [orders, setOrders] = useState<UserOrder[]>([]);
  const [form, setForm] = useState({ full_name: '', phone: '', address: '' });
  const [original, setOriginal] = useState({ full_name: '', phone: '', address: '' });
  const router = useRouter();

  useEffect(() => {
    const loadUser = async () => {
      setLoading(true);
      const serverUser = await getCurrentUserFromServer();
      if (!serverUser) {
        router.push('/login');
        return;
      }
      const mapped = {
        full_name: serverUser.full_name || '',
        phone: serverUser.phone || '',
        address: serverUser.address || '',
      };
      setUser(serverUser);
      setForm(mapped);
      setOriginal(mapped);
      await loadOrders();
      setLoading(false);
    };
    loadUser();
  }, [router]);

  const loadOrders = async () => {
    try {
      const result = await safeFetch<{ success: boolean; orders?: UserOrder[] }>('/api/orders');
      if (result.success) {
        setOrders(result.orders || []);
      }
    } catch {
      setOrders([]);
    }
  };

  const handleLogout = async () => {
    const confirmed = await confirm({
      title: 'Logout',
      message: 'Are you sure you want to logout?',
      confirmText: 'Yes',
      cancelText: 'No',
      iconClass: 'fa-solid fa-right-from-bracket',
    });
    if (!confirmed) return;

    handleLogoutLocal();
    try {
      await safeFetch('/api/auth', {
        method: 'POST',
        body: JSON.stringify({ mode: 'logout' }),
      });
    } catch {
      // local logout still succeeds
    }
    router.push('/login');
  };

  const hasChanges =
    form.full_name !== original.full_name ||
    form.phone !== original.phone ||
    form.address !== original.address;

  const handleDiscard = () => {
    if (!hasChanges) return;
    if (!window.confirm('Discard unsaved changes?')) return;
    setForm(original);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    try {
      const result = await safeFetch<{ success: boolean; user?: User; message?: string }>('/api/profile', {
        method: 'PATCH',
        body: JSON.stringify(form),
      });
      if (result.success && result.user) {
        setUser(result.user);
        const next = {
          full_name: result.user.full_name || '',
          phone: result.user.phone || '',
          address: result.user.address || '',
        };
        setForm(next);
        setOriginal(next);
        localStorage.setItem('shopcorner_user', JSON.stringify(result.user));
        window.dispatchEvent(new CustomEvent('userLogin'));
        window.alert('Profile updated successfully.');
      } else {
        window.alert(result.message || 'Failed to update profile');
      }
    } catch (err: any) {
      window.alert(err?.message || 'Could not save changes');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="profile-loading">Loading...</div>;
  }

  if (!user) {
    return <div className="profile-loading">Loading...</div>;
  }

  const initial = (user.full_name?.charAt(0) || user.email?.charAt(0) || 'U').toUpperCase();
  const displayName = user.full_name || 'ShopCorner User';
  const totalSpent = orders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0);
  const completedCount = orders.filter((o) => String(o.status).toLowerCase() === 'delivered').length;

  const statusClass = (status: string) => `order-status status-${String(status || '').toLowerCase()}`;

  return (
    <main className="profile-page-shell">
      <section className="profile-header-card">
        <div className="profile-avatar-circle">{initial}</div>
        <h2>{displayName}</h2>
        <p>{user.email}</p>
      </section>

      <nav className="profile-nav-sticky">
        <div className="horizontal-scroll-nav">
          <button className={`nav-tab ${activeTab === 'dash' ? 'active' : ''}`} onClick={() => setActiveTab('dash')}>Dashboard</button>
          <button className={`nav-tab ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}>Settings</button>
          <button className={`nav-tab ${activeTab === 'orders' ? 'active' : ''}`} onClick={() => setActiveTab('orders')}>Orders</button>
          <button className="nav-tab nav-tab-danger" onClick={handleLogout}>Logout</button>
        </div>
      </nav>

      <section className={`profile-tab-content ${activeTab === 'dash' ? 'active' : ''}`}>
        <div className="profile-stats-grid">
          <div className="settings-container profile-stat-box">
            <i className="fa-solid fa-bag-shopping"></i>
            <div className="profile-stat-value">{orders.length}</div>
            <div className="profile-stat-label">Orders</div>
          </div>
          <div className="settings-container profile-stat-box">
            <i className="fa-solid fa-wallet"></i>
            <div className="profile-stat-value">RWF {Number(totalSpent).toLocaleString()}</div>
            <div className="profile-stat-label">Spent</div>
          </div>
          <div className="settings-container profile-stat-box">
            <i className="fa-solid fa-circle-check"></i>
            <div className="profile-stat-value">{completedCount}</div>
            <div className="profile-stat-label">Delivered</div>
          </div>
        </div>
      </section>

      <section className={`profile-tab-content ${activeTab === 'settings' ? 'active' : ''}`}>
        <div className="settings-container">
          <form onSubmit={handleSave}>
            <div className="input-group">
              <label>Full Name</label>
              <input
                type="text"
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                placeholder="Enter name"
              />
            </div>
            <div className="input-group">
              <label>Phone Number</label>
              <input
                type="text"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+250..."
              />
            </div>
            <div className="input-group">
              <label>Delivery Address</label>
              <input
                type="text"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="Kigali, Rwanda"
              />
            </div>

            <div className="actions-flex">
              {hasChanges && (
                <button type="button" className="btn-discard-outline profile-btn-visible" onClick={handleDiscard}>
                  Discard
                </button>
              )}
              <button type="submit" className="btn-save-full" disabled={saving}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      </section>

      <section className={`profile-tab-content ${activeTab === 'orders' ? 'active' : ''}`}>
        {orders.length === 0 ? (
          <div className="profile-empty-state">
            <i className="fa-solid fa-box-open"></i>
            <p>No orders placed yet.</p>
          </div>
        ) : (
          <div className="orders-list">
            {orders.map((order) => (
              <article key={order.id} className="order-card">
                <div className="order-card-head">
                  <h4>Order #{order.id}</h4>
                  <span className={statusClass(order.status)}>{order.status}</span>
                </div>
                <p className="order-card-meta">
                  {new Date(order.created_at).toLocaleString()}
                </p>
                <p className="order-card-total">Total: RWF {Number(order.total_amount || 0).toLocaleString()}</p>
                {(order.items || []).map((item) => (
                  <div key={item.id} className="order-item-row">
                    <span>{item.product_name}</span>
                    <small>
                      x{item.quantity}
                      {item.color ? `, ${item.color}` : ''}
                      {item.size ? `, ${item.size}` : ''}
                    </small>
                  </div>
                ))}
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
