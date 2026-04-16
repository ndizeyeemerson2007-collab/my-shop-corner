'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUserFromServer, handleLogoutLocal, safeFetch } from '../../services/api';
import { User } from '../../types';
import { useConfirm } from '../../components/ConfirmProvider';

type UserOrder = {
  id: number;
  status: string;
  total_amount: number;
  created_at: string;
  customer?: {
    full_name?: string | null;
    phone?: string | null;
    address?: string | null;
    email?: string | null;
  } | null;
  items?: Array<{
    id: number;
    product_name: string;
    quantity: number;
    color?: string | null;
    size?: string | null;
  }>;
};

type SettingsPanel = 'overview' | 'profile' | 'password';

export default function ProfilePage() {
  const confirm = useConfirm();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'dash' | 'orders' | 'settings'>('dash');
  const [settingsPanel, setSettingsPanel] = useState<SettingsPanel>('overview');
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [orders, setOrders] = useState<UserOrder[]>([]);
  const [profileForm, setProfileForm] = useState({ full_name: '', phone: '', address: '' });
  const [profileOriginal, setProfileOriginal] = useState({ full_name: '', phone: '', address: '' });
  const [passwordForm, setPasswordForm] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  });

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
      setProfileForm(mapped);
      setProfileOriginal(mapped);
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

  const switchTab = (tab: 'dash' | 'orders' | 'settings') => {
    setActiveTab(tab);
    if (tab === 'settings') {
      setSettingsPanel('overview');
    }
    if (tab === 'orders') {
      loadOrders();
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

  const hasProfileChanges =
    profileForm.full_name !== profileOriginal.full_name ||
    profileForm.phone !== profileOriginal.phone ||
    profileForm.address !== profileOriginal.address;

  const handleDiscardProfile = () => {
    if (!hasProfileChanges) return;
    if (!window.confirm('Discard unsaved changes?')) return;
    setProfileForm(profileOriginal);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setSavingProfile(true);
    try {
      const result = await safeFetch<{ success: boolean; user?: User; message?: string }>('/api/profile', {
        method: 'PATCH',
        body: JSON.stringify(profileForm),
      });

      if (result.success && result.user) {
        setUser(result.user);
        const next = {
          full_name: result.user.full_name || '',
          phone: result.user.phone || '',
          address: result.user.address || '',
        };
        setProfileForm(next);
        setProfileOriginal(next);
        localStorage.setItem('shopcorner_user', JSON.stringify(result.user));
        window.dispatchEvent(new CustomEvent('userLogin'));
        window.alert('Profile updated successfully.');
        setSettingsPanel('overview');
      } else {
        window.alert(result.message || 'Failed to update profile');
      }
    } catch (err: any) {
      window.alert(err?.message || 'Could not save changes');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPassword(true);
    try {
      const result = await safeFetch<{ success: boolean; message?: string }>('/api/profile/password', {
        method: 'PATCH',
        body: JSON.stringify(passwordForm),
      });

      if (result.success) {
        setPasswordForm({
          current_password: '',
          new_password: '',
          confirm_password: '',
        });
        window.alert(result.message || 'Password updated successfully.');
        setSettingsPanel('overview');
      } else {
        window.alert(result.message || 'Failed to update password');
      }
    } catch (err: any) {
      window.alert(err?.message || 'Could not update password');
    } finally {
      setSavingPassword(false);
    }
  };

  const statusClass = (status: string) => `order-status status-${String(status || '').toLowerCase()}`;
  const canCancelOrder = (status: string) => {
    const normalized = String(status || '').toLowerCase();
    return normalized === 'pending' || normalized === 'paid';
  };

  const handleCancelOrder = async (orderId: number) => {
    const confirmed = await confirm({
      title: 'Cancel Order',
      message: 'Do you want to cancel this order?',
      confirmText: 'Cancel Order',
      cancelText: 'Keep',
      iconClass: 'fa-solid fa-ban',
    });
    if (!confirmed) return;

    try {
      const result = await safeFetch<{ success: boolean; message?: string }>('/api/orders', {
        method: 'PATCH',
        body: JSON.stringify({ order_id: orderId, action: 'cancel' }),
      });

      if (!result.success) {
        window.alert(result.message || 'Could not cancel order');
        return;
      }

      await loadOrders();
    } catch (err: any) {
      window.alert(err?.message || 'Could not cancel order');
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

  return (
    <main className="profile-page-shell">
      <section className="profile-header-card">
        <div className="profile-avatar-circle">{initial}</div>
        <h2>{displayName}</h2>
        <p>{user.email}</p>
      </section>

      <nav className="profile-nav-sticky">
        <div className="horizontal-scroll-nav">
          <button className={`nav-tab ${activeTab === 'dash' ? 'active' : ''}`} onClick={() => switchTab('dash')}>Dashboard</button>
          <button className={`nav-tab ${activeTab === 'orders' ? 'active' : ''}`} onClick={() => switchTab('orders')}>Orders</button>
          <button className={`nav-tab ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => switchTab('settings')}>Settings</button>
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
                <p className="order-card-meta">{new Date(order.created_at).toLocaleString()}</p>
                <p className="order-card-meta">
                  Contact: {order.customer?.full_name || user.full_name || user.email}
                  {order.customer?.phone ? ` | ${order.customer.phone}` : ''}
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
                {canCancelOrder(order.status) && (
                  <button
                    type="button"
                    className="btn-discard-outline profile-btn-visible"
                    onClick={() => handleCancelOrder(order.id)}
                  >
                    Cancel Order
                  </button>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      <section className={`profile-tab-content profile-settings-content ${activeTab === 'settings' ? 'active' : ''}`}>
        

        {settingsPanel === 'overview' ? (
          <div className="settings-overview">
            <div className="settings-grid">
              <button type="button" className="settings-tile" onClick={() => setSettingsPanel('profile')}>
                <span className="settings-tile-icon"><i className="fa-solid fa-user"></i></span>
                <div className="tile-text">
                  <strong>User Profile</strong>
                  <small>Update your name, phone, address and account details</small>
                </div>
                <i className="fa-solid fa-chevron-right settings-chevron"></i>
              </button>

              <button type="button" className="settings-tile" onClick={() => setSettingsPanel('password')}>
                <span className="settings-tile-icon"><i className="fa-solid fa-lock"></i></span>
                <div className="tile-text">
                  <strong>Change Password</strong>
                  <small>Update your login password securely</small>
                </div>
                <i className="fa-solid fa-chevron-right settings-chevron"></i>
              </button>

              <button type="button" className="settings-tile" onClick={() => switchTab('orders')}>
                <span className="settings-tile-icon"><i className="fa-solid fa-box"></i></span>
                <div className="tile-text">
                  <strong>Order History</strong>
                  <small>View your recent orders and track their status</small>
                </div>
                <i className="fa-solid fa-chevron-right settings-chevron"></i>
              </button>

              <div className="settings-tile switch-tile">
                <div className="switch-tile-row">
                  <span className="settings-tile-icon"><i className="fa-solid fa-bell"></i></span>
                  <div className="tile-text">
                    <strong>Push Notifications</strong>
                    <small>Receive alerts for new order updates</small>
                  </div>
                </div>
                <label className="switch-input">
                  <input type="checkbox" checked={notificationsEnabled} onChange={(e) => setNotificationsEnabled(e.target.checked)} />
                  <span className="switch-slider"></span>
                </label>
              </div>
            </div>

            <div className="settings-support-card">
              <div>
                <p>If you need help with your account or orders, support is ready to help.</p>
              </div>
              <a href="https://wa.me/250123456789" target="_blank" rel="noreferrer">WhatsApp Us</a>
            </div>
          </div>
        ) : null}

        {settingsPanel === 'profile' ? (
          <div className="settings-profile-panel">
            <header>
              <div>
                <h4>User Profile</h4>
                <p>Edit your personal details</p>
              </div>
              <button type="button" className="logout-btn" onClick={() => setSettingsPanel('overview')} aria-label="Close">
                <i className="fa-solid fa-xmark"></i>
              </button>
            </header>

            <form onSubmit={handleSaveProfile}>
              <label className="adm-label">Full Name</label>
              <input
                type="text"
                className="adm-input"
                value={profileForm.full_name}
                onChange={(e) => setProfileForm({ ...profileForm, full_name: e.target.value })}
                placeholder="Enter full name"
              />

              <label className="adm-label">Email</label>
              <input type="email" className="adm-input" value={user.email} readOnly />

              <label className="adm-label">Phone</label>
              <input
                type="text"
                className="adm-input"
                value={profileForm.phone}
                onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                placeholder="+250..."
              />

              <label className="adm-label">Address</label>
              <input
                type="text"
                className="adm-input"
                value={profileForm.address}
                onChange={(e) => setProfileForm({ ...profileForm, address: e.target.value })}
                placeholder="Kigali, Rwanda"
              />

              <div className="settings-form-actions">
                {hasProfileChanges ? (
                  <button type="button" className="settings-secondary-btn" onClick={handleDiscardProfile}>
                    Discard Changes
                  </button>
                ) : null}
                <button type="submit" className="adm-btn" disabled={savingProfile}>
                  {savingProfile ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        ) : null}

        {settingsPanel === 'password' ? (
          <div className="settings-profile-panel">
            <header>
              <div>
                <h4>Change Password</h4>
                <p>Use your current password to set a new one</p>
              </div>
              <button type="button" className="logout-btn" onClick={() => setSettingsPanel('overview')} aria-label="Close">
                <i className="fa-solid fa-xmark"></i>
              </button>
            </header>

            <form onSubmit={handleSavePassword}>
              <label className="adm-label">Current Password</label>
              <input
                type="password"
                className="adm-input"
                value={passwordForm.current_password}
                onChange={(e) => setPasswordForm({ ...passwordForm, current_password: e.target.value })}
                placeholder="Enter current password"
              />

              <label className="adm-label">New Password</label>
              <input
                type="password"
                className="adm-input"
                value={passwordForm.new_password}
                onChange={(e) => setPasswordForm({ ...passwordForm, new_password: e.target.value })}
                placeholder="Enter new password"
              />

              <label className="adm-label">Confirm Password</label>
              <input
                type="password"
                className="adm-input"
                value={passwordForm.confirm_password}
                onChange={(e) => setPasswordForm({ ...passwordForm, confirm_password: e.target.value })}
                placeholder="Confirm new password"
              />

              <div className="settings-form-actions">
                <button type="submit" className="adm-btn" disabled={savingPassword}>
                  {savingPassword ? 'Saving...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        ) : null}
      </section>
    </main>
  );
}
