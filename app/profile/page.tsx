'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { handleLogoutLocal, safeFetch, resolveProductImagePath } from '../../services/api';
import { User } from '../../types';
import { useConfirm } from '../../components/ConfirmProvider';
import LoadingDots from '../../components/LoadingDots';
import AuthStatusCard from '../../components/AuthStatusCard';
import { useProtectedAuth } from '../../hooks/useProtectedAuth';

type UserOrder = {
  id: number;
  status: string;
  total_amount: number;
  delivery_distance_km?: number | null;
  delivery_fee?: number | null;
  created_at: string;
  location?: string | null;
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
    price?: number | null;
    color?: string | null;
    size?: string | null;
  }>;
};

type FollowedSeller = {
  id: string;
  full_name?: string | null;
  business_name?: string | null;
  image?: string | null;
};

type OrderNotification = {
  id: string;
  icon: string;
  title: string;
  body: string;
  time: string;
  kind: 'placed' | 'paid';
};

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

type SettingsPanel = 'overview' | 'profile' | 'password';

const NOTIFICATION_RETENTION_MS = 24 * 60 * 60 * 1000;

function getNotificationSeenKey(userId: string) {
  return `shopcorner_seen_notifications_${userId}`;
}

function readSeenNotifications(userId: string) {
  if (typeof window === 'undefined') return {} as Record<string, string>;

  try {
    const raw = window.localStorage.getItem(getNotificationSeenKey(userId));
    if (!raw) return {};

    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeSeenNotifications(userId: string, value: Record<string, string>) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(getNotificationSeenKey(userId), JSON.stringify(value));
}

function buildOrderNotifications(orders: UserOrder[]): OrderNotification[] {
  return orders
    .flatMap((order) => {
      const normalized = String(order.status || '').toLowerCase();
      const placedNotice: OrderNotification = {
        id: `placed-${order.id}`,
        icon: 'fa-solid fa-bag-shopping',
        title: `Order #${order.id} made`,
        body: `Your order for RWF ${Number(order.total_amount || 0).toLocaleString()} was placed successfully.`,
        time: order.created_at,
        kind: 'placed',
      };

      if (['paid', 'processing', 'delivered'].includes(normalized)) {
        return [
          {
            id: `paid-${order.id}`,
            icon: 'fa-solid fa-wallet',
            title: `Order #${order.id} paid`,
            body: 'Seller confirmed your order payment.',
            time: order.created_at,
            kind: 'paid' as const,
          },
          placedNotice,
        ];
      }

      return [placedNotice];
    })
    .sort((a, b) => {
      if (a.kind !== b.kind) {
        return a.kind === 'paid' ? -1 : 1;
      }

      return new Date(b.time).getTime() - new Date(a.time).getTime();
    });
}

function sanitizePdfText(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function wrapPdfText(value: string, maxLength = 82) {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxLength) {
      current = next;
      continue;
    }

    if (current) {
      lines.push(current);
    }
    current = word;
  }

  if (current) {
    lines.push(current);
  }

  return lines.length > 0 ? lines : [''];
}

function buildPdfBlob(lines: string[]) {
  const pageWidth = 595;
  const pageHeight = 842;
  const left = 48;
  const top = 790;
  const lineHeight = 16;
  const linesPerPage = 44;

  const pages: string[][] = [];
  for (let index = 0; index < lines.length; index += linesPerPage) {
    pages.push(lines.slice(index, index + linesPerPage));
  }

  const objects: string[] = [];
  const addObject = (content: string) => {
    objects.push(content);
    return objects.length;
  };

  const fontObjectId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const pageObjectIds: number[] = [];
  const contentObjectIds: number[] = [];

  for (const pageLines of pages) {
    const textCommands = pageLines.map((line, lineIndex) => {
      const y = top - lineIndex * lineHeight;
      return `BT /F1 11 Tf 1 0 0 1 ${left} ${y} Tm (${sanitizePdfText(line)}) Tj ET`;
    }).join('\n');

    const stream = `<< /Length ${textCommands.length} >>\nstream\n${textCommands}\nendstream`;
    const contentObjectId = addObject(stream);
    contentObjectIds.push(contentObjectId);
    pageObjectIds.push(addObject(''));
  }

  const pagesObjectId = addObject('');

  pageObjectIds.forEach((pageObjectId, index) => {
    objects[pageObjectId - 1] = `<< /Type /Page /Parent ${pagesObjectId} 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontObjectId} 0 R >> >> /Contents ${contentObjectIds[index]} 0 R >>`;
  });

  objects[pagesObjectId - 1] = `<< /Type /Pages /Count ${pageObjectIds.length} /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] >>`;
  const catalogObjectId = addObject(`<< /Type /Catalog /Pages ${pagesObjectId} 0 R >>`);

  let pdf = '%PDF-1.4\n';
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogObjectId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return new Blob([pdf], { type: 'application/pdf' });
}

export default function ProfilePage() {
  const confirm = useConfirm();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { loading, user: protectedUser, accessBlocked, message } = useProtectedAuth();
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<'dash' | 'orders' | 'settings'>('dash');
  const [settingsPanel, setSettingsPanel] = useState<SettingsPanel>('overview');
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [orders, setOrders] = useState<UserOrder[]>([]);
  const [followedSellers, setFollowedSellers] = useState<FollowedSeller[]>([]);
  const [profileForm, setProfileForm] = useState({ full_name: '', phone: '', address: '', profile_pic: '' });
  const [profileOriginal, setProfileOriginal] = useState({ full_name: '', phone: '', address: '', profile_pic: '' });
  const [profilePicFile, setProfilePicFile] = useState<File | null>(null);
  const [profilePicPreview, setProfilePicPreview] = useState('');
  const [passwordForm, setPasswordForm] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  });
  const [showAvatarMenu, setShowAvatarMenu] = useState(false);
  const profilePicInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!protectedUser || accessBlocked) {
      setUser(null);
      return;
    }

    const mapped = {
      full_name: protectedUser.full_name || '',
      phone: protectedUser.phone || '',
      address: protectedUser.address || '',
      profile_pic: protectedUser.profile_pic || '',
    };

    setUser(protectedUser);
    setProfileForm(mapped);
    setProfileOriginal(mapped);
    setProfilePicPreview(protectedUser.profile_pic || '');
    setProfilePicFile(null);
    loadOrders();
    loadFollowedSellers();
  }, [accessBlocked, protectedUser]);

  useEffect(() => {
    const requestedTab = searchParams.get('tab');
    if (requestedTab !== 'dash' && requestedTab !== 'orders' && requestedTab !== 'settings') {
      return;
    }

    setActiveTab(requestedTab);
  }, [searchParams]);

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

  const loadFollowedSellers = async () => {
    try {
      const result = await safeFetch<{ success: boolean; followed_sellers?: FollowedSeller[] }>('/api/follows');
      if (result.success) {
        setFollowedSellers(result.followed_sellers || []);
      }
    } catch {
      setFollowedSellers([]);
    }
  };

  const handleUnfollowSeller = async (sellerId: string) => {
    try {
      const result = await safeFetch<{ success: boolean; message?: string }>('/api/follows', {
        method: 'DELETE',
        body: JSON.stringify({ seller_id: sellerId }),
      });

      if (!result.success) {
        window.alert(result.message || 'Could not unfollow seller');
        return;
      }

      setFollowedSellers((current) => current.filter((seller) => seller.id !== sellerId));
    } catch (err: unknown) {
      window.alert(err instanceof Error ? err.message : 'Could not unfollow seller');
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
    window.dispatchEvent(new CustomEvent('userLogout'));
    try {
      await safeFetch('/api/auth', {
        method: 'POST',
        body: JSON.stringify({ mode: 'logout' }),
      });
    } catch {
      // local logout still succeeds
    }
    router.replace('/login');
    router.refresh();
  };

  const hasProfileChanges =
    profileForm.full_name !== profileOriginal.full_name ||
    profileForm.phone !== profileOriginal.phone ||
    profileForm.address !== profileOriginal.address ||
    profileForm.profile_pic !== profileOriginal.profile_pic ||
    Boolean(profilePicFile);

  const handleDiscardProfile = () => {
    if (!hasProfileChanges) return;
    if (!window.confirm('Discard unsaved changes?')) return;
    setProfileForm(profileOriginal);
    setProfilePicPreview(profileOriginal.profile_pic || '');
    setProfilePicFile(null);
  };

  const handleProfilePicChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      window.alert('Please select a valid image file.');
      return;
    }

    setProfilePicFile(file);
    setProfilePicPreview(URL.createObjectURL(file));
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setSavingProfile(true);
    try {
      let profilePicUrl = profileForm.profile_pic;

      if (profilePicFile) {
        const uploadData = new FormData();
        uploadData.append('files', profilePicFile);

        const uploadResult = await safeFetch<{ success: boolean; paths?: string[]; message?: string }>('/api/upload', {
          method: 'POST',
          body: uploadData,
        });

        if (!uploadResult.success || !Array.isArray(uploadResult.paths) || uploadResult.paths.length === 0) {
          window.alert(uploadResult.message || 'Could not upload profile picture.');
          return;
        }

        profilePicUrl = uploadResult.paths[0];
      }

      const payload = {
        full_name: profileForm.full_name,
        phone: profileForm.phone,
        address: profileForm.address,
        profile_pic: profilePicUrl,
      };

      const result = await safeFetch<{ success: boolean; user?: User; message?: string }>('/api/profile', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });

      if (result.success && result.user) {
        setUser(result.user);
        const next = {
          full_name: result.user.full_name || '',
          phone: result.user.phone || '',
          address: result.user.address || '',
          profile_pic: result.user.profile_pic || '',
        };
        setProfileForm(next);
        setProfileOriginal(next);
        setProfilePicPreview(result.user.profile_pic || '');
        setProfilePicFile(null);
        localStorage.setItem('shopcorner_user', JSON.stringify(result.user));
        window.dispatchEvent(new CustomEvent('userLogin'));
        window.alert('Profile updated successfully.');
        setSettingsPanel('overview');
      } else {
        window.alert(result.message || 'Failed to update profile');
      }
    } catch (err: unknown) {
      window.alert(err instanceof Error ? err.message : 'Could not save changes');
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
    } catch (err: unknown) {
      window.alert(err instanceof Error ? err.message : 'Could not update password');
    } finally {
      setSavingPassword(false);
    }
  };

  const statusClass = (status: string) => `order-status status-${String(status || '').toLowerCase()}`;
  const canCancelOrder = (status: string) => {
    const normalized = String(status || '').toLowerCase();
    return normalized === 'pending';
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
    } catch (err: unknown) {
      window.alert(err instanceof Error ? err.message : 'Could not cancel order');
    }
  };

  const handleExportOrder = (order: UserOrder) => {
    if (typeof window === 'undefined') return;

    const itemTotal = (order.items || []).reduce(
      (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0),
      0,
    );
    const lines = [
      'ShopCorner Order Document',
      `Order #${order.id}`,
      '',
      `Status: ${order.status}`,
      `Date: ${new Date(order.created_at).toLocaleString()}`,
      `Customer: ${order.customer?.full_name || user?.full_name || user?.email || 'N/A'}`,
      `Phone: ${order.customer?.phone || 'N/A'}`,
      ...wrapPdfText(`Delivery: ${order.location || order.customer?.address || 'N/A'}`),
      '',
      'Items',
      'Item | Variant | Qty | Price | Subtotal',
      '------------------------------------------------------------',
      ...(order.items || []).flatMap((item) => {
        const unitPrice = Number(item.price || 0);
        const subtotal = unitPrice * Number(item.quantity || 0);
        const variant = [item.color, item.size].filter(Boolean).join(' / ') || '-';

        return wrapPdfText(
          `${item.product_name} | ${variant} | ${Number(item.quantity || 0)} | RWF ${unitPrice.toLocaleString()} | RWF ${subtotal.toLocaleString()}`,
        );
      }),
      '',
      `Items total: RWF ${itemTotal.toLocaleString()}`,
      `Delivery fee: RWF ${Number(order.delivery_fee || 0).toLocaleString()}`,
      `Total: RWF ${Number(order.total_amount || 0).toLocaleString()}`,
    ];

    const blob = buildPdfBlob(lines);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `shopcorner-order-${order.id}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const allOrderNotifications = buildOrderNotifications(orders);
  const seenNotifications = user?.id ? readSeenNotifications(String(user.id)) : {};
  const now = Date.now();
  const orderNotifications = allOrderNotifications.filter((notification) => {
    const seenAt = seenNotifications[notification.id];
    if (!seenAt) return true;

    const seenTime = new Date(seenAt).getTime();
    if (Number.isNaN(seenTime)) {
      return true;
    }

    return now - seenTime < NOTIFICATION_RETENTION_MS;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !user?.id || activeTab !== 'dash' || orderNotifications.length === 0) {
      return;
    }

    const storedSeen = readSeenNotifications(String(user.id));
    const nextSeen = { ...storedSeen };
    const seenAt = new Date().toISOString();
    let changed = false;

    for (const notification of orderNotifications) {
      if (!nextSeen[notification.id]) {
        nextSeen[notification.id] = seenAt;
        changed = true;
      }
    }

    for (const [notificationId, timestamp] of Object.entries(nextSeen)) {
      const timestampMs = new Date(timestamp).getTime();
      if (Number.isNaN(timestampMs) || now - timestampMs >= NOTIFICATION_RETENTION_MS) {
        delete nextSeen[notificationId];
        changed = true;
      }
    }

    if (changed) {
      writeSeenNotifications(String(user.id), nextSeen);
    }
  }, [activeTab, now, orderNotifications, user?.id]);

  if (loading) {
    return (
      <AuthStatusCard
        title="Loading your dashboard"
        message="Checking your account before we load your profile."
        loading
      />
    );
  }

  if (accessBlocked) {
    return (
      <AuthStatusCard
        title="Verification required"
        message={message}
      />
    );
  }

  if (!user) {
    return null;
  }

  const initial = (user.full_name?.charAt(0) || user.email?.charAt(0) || 'U').toUpperCase();
  const displayName = user.full_name || 'ShopCorner User';
  const totalSpent = orders.reduce((sum, order) => {
    const normalized = String(order.status || '').toLowerCase();
    if (!['paid', 'processing', 'delivered'].includes(normalized)) {
      return sum;
    }

    return sum + Number(order.total_amount || 0);
  }, 0);
  const completedCount = orders.filter((o) => String(o.status).toLowerCase() === 'delivered').length;

  return (
    <main className="profile-page-shell">
      <section className="profile-header-card">
        <div className="profile-avatar-circle">
          {profilePicPreview ? (
            <img src={profilePicPreview} alt="Profile" />
          ) : user.profile_pic ? (
            <img src={resolveProductImagePath(user.profile_pic)} alt="Profile" />
          ) : (
            initial
          )}
        </div>
        {(profilePicPreview || user.profile_pic) && (
          <div className="avatar-edit-container">
            <button className="avatar-edit-btn-small" onClick={() => setShowAvatarMenu(!showAvatarMenu)}>
              <i className="fa-solid fa-pen"></i>
            </button>
            {showAvatarMenu && (
              <div className="avatar-menu">
                <button onClick={() => { profilePicInputRef.current?.click(); setShowAvatarMenu(false); }}>Change Picture</button>
                <button onClick={async () => {
                  setShowAvatarMenu(false);
                  setProfilePicPreview('');
                  setProfilePicFile(null);
                  setProfileForm(prev => ({ ...prev, profile_pic: '' }));
                  try {
                    const result = await safeFetch<{ success: boolean; user?: User; message?: string }>('/api/profile', {
                      method: 'PATCH',
                      body: JSON.stringify({ profile_pic: '' }),
                    });
                    if (result.success && result.user) {
                      setUser(result.user);
                      setProfileForm(prev => ({ ...prev, profile_pic: '' }));
                      setProfileOriginal(prev => ({ ...prev, profile_pic: '' }));
                      localStorage.setItem('shopcorner_user', JSON.stringify(result.user));
                      window.dispatchEvent(new CustomEvent('userLogin'));
                    } else {
                      window.alert(result.message || 'Failed to remove profile picture.');
                    }
                  } catch (error: unknown) {
                    window.alert(getErrorMessage(error, 'Could not remove profile picture.'));
                  }
                }}>Remove Picture</button>
              </div>
            )}
          </div>
        )}
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
          <div className="settings-container profile-stat-box">
            <i className="fa-solid fa-bell"></i>
            <div className="profile-stat-value">{orderNotifications.length}</div>
            <div className="profile-stat-label">Notifications</div>
          </div>
        </div>

        <div className="profile-followed-section">
          <div className="profile-followed-head">
            <h3>Notifications</h3>
            <p>Order updates from your shop activity</p>
          </div>

          {orderNotifications.length === 0 ? (
            <div className="profile-followed-empty">No notifications yet.</div>
          ) : (
            <div className="profile-notification-list">
              {orderNotifications.map((notification) => (
                <div key={notification.id} className="profile-notification-card">
                  <div className="profile-notification-icon">
                    <i className={notification.icon}></i>
                  </div>
                  <div className="profile-notification-copy">
                    <strong>{notification.title}</strong>
                    <p>{notification.body}</p>
                    <small>{new Date(notification.time).toLocaleString()}</small>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="profile-followed-section">
          <div className="profile-followed-head">
            <h3>Followed sellers</h3>
            <p>Stores you follow</p>
          </div>

          {followedSellers.length === 0 ? (
            <div className="profile-followed-empty">No followed sellers yet.</div>
          ) : (
            <div className="profile-followed-list">
              {followedSellers.map((seller) => {
                const sellerLabel = seller.business_name || seller.full_name || 'Seller';
                const sellerInitial = sellerLabel.charAt(0).toUpperCase();

                return (
                  <div key={seller.id} className="profile-followed-card">
                    <div className="profile-followed-brand">
                      <div className="profile-followed-logo">{sellerInitial}</div>
                      <div>
                        <strong>{sellerLabel}</strong>
                        <small>{seller.full_name || 'ShopCorner seller'}</small>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="profile-followed-btn"
                      onClick={() => handleUnfollowSeller(seller.id)}
                    >
                      Unfollow
                    </button>
                  </div>
                );
              })}
            </div>
          )}
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
                <p className="order-card-meta">
                  Delivery: {order.location || order.customer?.address || 'No saved delivery location'}
                </p>
                <p className="order-card-meta">
                  Delivery fee: RWF {Number(order.delivery_fee || 0).toLocaleString()}
                  {order.delivery_distance_km ? ` | ${Number(order.delivery_distance_km).toFixed(2)} km from Kicukiro HQ` : ''}
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
                <button
                  type="button"
                  className="profile-print-btn"
                  onClick={() => handleExportOrder(order)}
                >
                  Export PDF
                </button>
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

              <label className="adm-label">Profile Picture</label>
              <input
                type="file"
                accept="image/*"
                className="adm-input profile-pic-input"
                onChange={handleProfilePicChange}
                ref={profilePicInputRef}
              />

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
                  {savingProfile ? (
                    <LoadingDots label="Loading" size="sm" className="dot-loader--inverse dot-loader--button" />
                  ) : 'Save'}
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
                  {savingPassword ? (
                    <LoadingDots label="Loading" size="sm" className="dot-loader--inverse dot-loader--button" />
                  ) : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        ) : null}
      </section>
    </main>
  );
}
