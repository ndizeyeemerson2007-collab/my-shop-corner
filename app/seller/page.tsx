'use client';

import Image from 'next/image';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { handleLogoutLocal, safeFetch, resolveProductImagePath } from '../../services/api';
import { Product, User } from '../../types';
import { useConfirm } from '../../components/ConfirmProvider';
import LoadingDots from '../../components/LoadingDots';
import AuthStatusCard from '../../components/AuthStatusCard';
import { useProtectedAuth } from '../../hooks/useProtectedAuth';
import { BUSINESS_HQ } from '../../lib/delivery';

type SellerSection = 'stats' | 'products' | 'upload' | 'orders';
type SellerStats = {
  revenue: number;
  orders: number;
  products: number;
  trend_products: number;
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

type SellerOrderItem = {
  id: number;
  product_name: string;
  quantity: number;
  color?: string | null;
  size?: string | null;
};

type SellerOrder = {
  id: number;
  status: string;
  total_amount: number;
  delivery_distance_km?: number | null;
  delivery_fee?: number | null;
  seller_total?: number;
  full_name?: string | null;
  phone?: string | null;
  location?: string | null;
  customer_email?: string | null;
  customer?: {
    id?: string | null;
    email?: string | null;
    full_name?: string | null;
    phone?: string | null;
    address?: string | null;
  } | null;
  created_at: string;
  items?: SellerOrderItem[];
};

type OrderFilter = 'all' | 'pending' | 'paid' | 'processing' | 'canceled' | 'delivered';

const defaultProductForm = {
  name: '',
  description: '',
  price: '',
  stock: '100',
  category: '',
  colors: '',
  sizes: '',
  badge: '',
  sold: '0',
  is_trend: false,
  image: '',
  original_price: '',
};

const NOTIFICATION_RETENTION_MS = 24 * 60 * 60 * 1000;

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function formatCurrency(value: number) {
  return `RWF ${Number(value || 0).toLocaleString()}`;
}

function getNotificationSeenKey(userId: string) {
  return `shopcorner_seen_seller_notifications_${userId}`;
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

export default function SellerPage() {
  const confirm = useConfirm();
  const { loading, user: protectedUser, accessBlocked, message } = useProtectedAuth({ requiredRole: 'seller' });
  const [user, setUser] = useState<User | null>(null);
  const [activeSection, setActiveSection] = useState<SellerSection | 'settings'>('stats');
  const [stats, setStats] = useState<SellerStats>({ revenue: 0, orders: 0, products: 0, trend_products: 0 });
  const [revenueChart, setRevenueChart] = useState<RevenuePoint[]>([]);
  const [notifications, setNotifications] = useState<SellerNotification[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<SellerOrder[]>([]);
  const [orderFilter, setOrderFilter] = useState<OrderFilter>('all');
  const [orderSearch, setOrderSearch] = useState('');
  const [orderDateFrom, setOrderDateFrom] = useState('');
  const [orderDateTo, setOrderDateTo] = useState('');
  const [showOrderFilterModal, setShowOrderFilterModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [orderListModal, setOrderListModal] = useState<SellerOrder | null>(null);
  const [customerInfoModal, setCustomerInfoModal] = useState<SellerOrder | null>(null);
  const [uploading, setUploading] = useState(false);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [savingProfile, setSavingProfile] = useState(false);
  const [showProfilePanel, setShowProfilePanel] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [profileForm, setProfileForm] = useState({ full_name: '', phone: '', address: '', business_name: '' });
  const [profileOriginal, setProfileOriginal] = useState({ full_name: '', phone: '', address: '', business_name: '' });
  const [form, setForm] = useState(defaultProductForm);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!protectedUser || accessBlocked) {
      setUser(null);
      return;
    }

    const mappedProfile = {
      full_name: protectedUser.full_name || '',
      phone: protectedUser.phone || '',
      address: protectedUser.address || '',
      business_name: protectedUser.business_name || '',
    };

    setUser(protectedUser);
    setProfileForm(mappedProfile);
    setProfileOriginal(mappedProfile);

    void (async () => {
      try {
        const [statsResult, productsResult, ordersResult] = await Promise.all([
          safeFetch<{ success: boolean; stats?: { revenue: number; orders: number; products: number; pending_orders: number }; revenue_chart?: RevenuePoint[]; notifications?: SellerNotification[] }>('/api/seller/dashboard'),
          safeFetch<{ success: boolean; products?: Product[] }>('/api/products?seller_scope=mine&limit=50'),
          safeFetch<{ success: boolean; orders?: SellerOrder[] }>('/api/seller/orders'),
        ]);

        if (statsResult.success && statsResult.stats) {
          setStats({
            revenue: statsResult.stats.revenue,
            orders: statsResult.stats.orders,
            products: statsResult.stats.products,
            trend_products: statsResult.stats.pending_orders,
          });
          setRevenueChart(statsResult.revenue_chart || []);
          setNotifications(statsResult.notifications || []);
        }

        if (productsResult.success && productsResult.products) {
          setProducts(productsResult.products);
        }

        setOrders(ordersResult.success ? (ordersResult.orders || []) : []);
      } catch {
        setNotifications([]);
        setRevenueChart([]);
        setOrders([]);
      }
    })();
  }, [accessBlocked, protectedUser]);

  const loadDashboardStats = async () => {
    try {
      const result = await safeFetch<{ success: boolean; stats?: { revenue: number; orders: number; products: number; pending_orders: number }; revenue_chart?: RevenuePoint[]; notifications?: SellerNotification[] }>('/api/seller/dashboard');
      if (result.success && result.stats) {
        setStats({
          revenue: result.stats.revenue,
          orders: result.stats.orders,
          products: result.stats.products,
          trend_products: result.stats.pending_orders,
        });
        setRevenueChart(result.revenue_chart || []);
        setNotifications(result.notifications || []);
      }
    } catch {
      // keep defaults
    }
  };

  const loadProducts = async () => {
    try {
      const result = await safeFetch<{ success: boolean; products?: Product[] }>('/api/products?seller_scope=mine&limit=50');
      if (result.success && result.products) {
        setProducts(result.products);
      }
    } catch {
      // keep previous
    }
  };

  const loadOrders = async () => {
    try {
      const result = await safeFetch<{ success: boolean; orders?: SellerOrder[] }>('/api/seller/orders');
      if (result.success) {
        setOrders(result.orders || []);
      }
    } catch {
      setOrders([]);
    }
  };

  const resetProductForm = () => {
    setForm(defaultProductForm);
    setEditingProduct(null);
    setImageFiles([]);
    if (imageInputRef.current) {
      imageInputRef.current.value = '';
    }
  };

  const getProductImages = (product: Product | null) => {
    if (!product) return [];
    const gallery = Array.isArray(product.images)
      ? product.images
      : typeof product.images === 'string' && product.images
        ? [product.images]
        : [];
    const allImages = [product.image, ...gallery].filter((value): value is string => Boolean(value));
    return Array.from(new Set(allImages));
  };

  const normalizeOrderStatus = (status: string) => {
    const normalized = String(status || 'pending').toLowerCase();
    return normalized === 'cancelled' ? 'canceled' : normalized;
  };

  const orderSortPriority = (status: string) => {
    switch (normalizeOrderStatus(status)) {
      case 'pending':
        return 0;
      case 'paid':
        return 1;
      case 'processing':
        return 2;
      case 'canceled':
        return 3;
      case 'delivered':
        return 4;
      default:
        return 5;
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
      // ignore
    }
    router.replace('/login');
    router.refresh();
  };

  const switchSection = async (section: SellerSection) => {
    setActiveSection(section);
    setShowProfilePanel(false);
    if (section === 'products') await loadProducts();
    if (section === 'orders') {
      setOrderFilter('all');
      setOrderSearch('');
      setOrderDateFrom('');
      setOrderDateTo('');
      await loadOrders();
    }
    if (section === 'stats') await loadDashboardStats();
  };

  const switchToSettings = () => {
    setShowProfilePanel(false);
    setActiveSection('settings');
  };

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setUploading(true);
    try {
      const isEditing = Boolean(editingProduct);
      if (!isEditing && imageFiles.length === 0) {
        window.alert('Please choose at least one product image.');
        return;
      }

      let uploadedPaths: string[] = [];
      if (imageFiles.length > 0) {
        const uploadData = new FormData();
        imageFiles.forEach((file) => uploadData.append('files', file));

        const uploadResult = await safeFetch<{ success: boolean; message?: string; paths?: string[] }>('/api/upload', {
          method: 'POST',
          body: uploadData,
        });

        uploadedPaths = Array.isArray(uploadResult.paths) ? uploadResult.paths : [];
        if (!uploadResult.success || uploadedPaths.length === 0) {
          window.alert(uploadResult.message || 'Image upload failed.');
          return;
        }
      }

      const existingImages = getProductImages(editingProduct);
      const finalImages = [...existingImages, ...uploadedPaths];

      const payload = {
        ...(editingProduct ? { id: editingProduct.id } : {}),
        name: form.name,
        description: form.description,
        price: Number(form.price),
        stock: Number(form.stock),
        category: form.category,
        colors: form.colors,
        sizes: form.sizes,
        badge: form.badge,
        sold: Number(form.sold),
        is_trend: form.is_trend,
        image: finalImages[0] || '',
        images: finalImages,
        original_price: form.original_price ? Number(form.original_price) : null,
      };
      const result = await safeFetch<{ success: boolean; message?: string }>('/api/products', {
        method: editingProduct ? 'PATCH' : 'POST',
        body: JSON.stringify(payload),
      });
      if (result.success) {
        window.alert(editingProduct ? 'Product updated successfully.' : 'Product saved successfully.');
        resetProductForm();
        await Promise.all([loadProducts(), loadDashboardStats()]);
        setActiveSection('products');
      } else {
        window.alert(result.message || `Failed to ${editingProduct ? 'update' : 'save'} product.`);
      }
    } catch (error: unknown) {
      window.alert(getErrorMessage(error, 'Network error.'));
    } finally {
      setUploading(false);
    }
  };

  const handleImageSelection = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setImageFiles((prev) => [...prev, ...files]);
    if (imageInputRef.current) {
      imageInputRef.current.value = '';
    }
  };

  const handleRemoveImageFile = (index: number) => {
    setImageFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleRemoveExistingImage = (index: number) => {
    if (!editingProduct) return;
    const currentImages = getProductImages(editingProduct);
    const updatedImages = currentImages.filter((_, i) => i !== index);
    
    setEditingProduct({
      ...editingProduct,
      image: updatedImages[0] || '',
      images: updatedImages
    });
  };

  const handleEditProduct = (product: Product) => {
    setEditingProduct(product);
    setForm({
      name: product.name || '',
      description: product.description || '',
      price: String(product.price ?? ''),
      stock: String(product.stock ?? 0),
      category: product.category || '',
      colors: product.colors || '',
      sizes: product.sizes || '',
      badge: product.badge || '',
      sold: String(product.sold ?? 0),
      is_trend: Boolean(product.is_trend),
      image: product.image || '',
      original_price: product.original_price ? String(product.original_price) : '',
    });
    setImageFiles([]);
    if (imageInputRef.current) {
      imageInputRef.current.value = '';
    }
    setActiveSection('upload');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteProduct = async (id: number) => {
    if (!window.confirm('Delete this product?')) return;
    try {
      const result = await safeFetch<{ success: boolean; message?: string }>(`/api/products?id=${id}`, {
        method: 'DELETE',
      });
      if (!result.success) {
        window.alert(result.message || 'Delete failed.');
        return;
      }
      await Promise.all([loadProducts(), loadDashboardStats()]);
    } catch (error: unknown) {
      window.alert(getErrorMessage(error, 'Delete failed.'));
    }
  };

  const updateOrderStatus = async (orderId: number, status: string) => {
    try {
      const result = await safeFetch<{ success: boolean; message?: string }>('/api/seller/orders', {
        method: 'PATCH',
        body: JSON.stringify({ order_id: orderId, status }),
      });
      if (!result.success) {
        window.alert(result.message || 'Failed to update order status.');
        return;
      }
      await Promise.all([loadOrders(), loadDashboardStats()]);
    } catch (error: unknown) {
      window.alert(getErrorMessage(error, 'Failed to update order status.'));
    }
  };

  const hasProfileChanges =
    profileForm.full_name !== profileOriginal.full_name ||
    profileForm.phone !== profileOriginal.phone ||
    profileForm.address !== profileOriginal.address ||
    profileForm.business_name !== profileOriginal.business_name;

  const handleDiscardProfile = () => {
    if (!hasProfileChanges) return;
    if (!window.confirm('Discard unsaved changes?')) return;
    setProfileForm(profileOriginal);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
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
          business_name: result.user.business_name || '',
        };
        setProfileForm(next);
        setProfileOriginal(next);
        localStorage.setItem('shopcorner_user', JSON.stringify(result.user));
        window.dispatchEvent(new CustomEvent('userLogin'));
        window.alert('Profile updated successfully.');
        setShowProfilePanel(false);
      } else {
        window.alert(result.message || 'Failed to update profile.');
      }
    } catch (error: unknown) {
      window.alert(getErrorMessage(error, 'Could not save changes.'));
    } finally {
      setSavingProfile(false);
    }
  };

  const sortedOrders = [...orders].sort((a, b) => {
    const priorityDiff = orderSortPriority(a.status) - orderSortPriority(b.status);
    if (priorityDiff !== 0) return priorityDiff;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const visibleOrders =
    sortedOrders.filter((order) => {
      const matchesStatus =
        orderFilter === 'all' ? true : normalizeOrderStatus(order.status) === orderFilter;

      const searchValue = orderSearch.trim().toLowerCase();
      const searchableText = [
        `order ${order.id}`,
        order.full_name,
        order.phone,
        order.location,
        order.customer_email,
        order.customer?.full_name,
        order.customer?.phone,
        order.customer?.email,
        order.customer?.address,
        ...(order.items || []).map((item) => item.product_name),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      const matchesSearch = searchValue ? searchableText.includes(searchValue) : true;

      const orderDate = new Date(order.created_at);
      const matchesDateFrom = orderDateFrom
        ? orderDate >= new Date(`${orderDateFrom}T00:00:00`)
        : true;
      const matchesDateTo = orderDateTo
        ? orderDate <= new Date(`${orderDateTo}T23:59:59`)
        : true;

      return matchesStatus && matchesSearch && matchesDateFrom && matchesDateTo;
    });

  const orderFilters: Array<{ value: OrderFilter; label: string }> = [
    { value: 'all', label: 'All' },
    { value: 'pending', label: 'Pending' },
    { value: 'paid', label: 'Paid' },
    { value: 'processing', label: 'Processing' },
    { value: 'canceled', label: 'Canceled' },
    { value: 'delivered', label: 'Delivered' },
  ];

  const orderCounts = orderFilters.reduce<Record<OrderFilter, number>>((acc, filter) => {
    acc[filter.value] =
      filter.value === 'all'
        ? orders.length
        : orders.filter((order) => normalizeOrderStatus(order.status) === filter.value).length;
    return acc;
  }, {
    all: 0,
    pending: 0,
    paid: 0,
    processing: 0,
    canceled: 0,
    delivered: 0,
  });
  const now = Date.now();
  const seenNotifications = user?.id ? readSeenNotifications(String(user.id)) : {};
  const visibleNotifications = notifications.filter((notification) => {
    const seenAt = seenNotifications[notification.id];
    if (!seenAt) return true;

    const seenTime = new Date(seenAt).getTime();
    if (Number.isNaN(seenTime)) {
      return true;
    }

    return now - seenTime < NOTIFICATION_RETENTION_MS;
  });
  const maxRevenue = Math.max(1, ...revenueChart.map((item) => item.revenue || 0));

  useEffect(() => {
    if (typeof window === 'undefined' || !user?.id || activeSection !== 'stats' || visibleNotifications.length === 0) {
      return;
    }

    const storedSeen = readSeenNotifications(String(user.id));
    const nextSeen = { ...storedSeen };
    const seenAt = new Date().toISOString();
    let changed = false;

    for (const notification of visibleNotifications) {
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
  }, [activeSection, now, user?.id, visibleNotifications]);

  if (loading) {
    return (
      <AuthStatusCard
        title="Loading seller control"
        message="Checking your account before we open the dashboard."
        loading
      />
    );
  }

  if (accessBlocked) {
    return (
      <AuthStatusCard
        title="Access blocked"
        message={message}
      />
    );
  }

  if (!user) {
    return null;
  }

  return (
    <main className="admin-page-shell">
      <section className={`admin-sec ${activeSection === 'stats' ? '' : 'admin-hidden'}`}>
        <div className="stats-grid">
          <div className="stat-box">
            <h2>RWF {Number(stats.revenue || 0).toLocaleString()}</h2>
            <p>Seller Revenue</p>
          </div>
          <div className="stat-box">
            <h2>{stats.orders || 0}</h2>
            <p>Your Orders</p>
          </div>
          <div className="stat-box">
            <h2>{stats.products || 0}</h2>
            <p>Your Products</p>
          </div>
          <div className="stat-box">
            <h2>{stats.trend_products || 0}</h2>
            <p>Pending Orders</p>
          </div>
        </div>

        <div className="seller-dashboard-grid">
          <article className="admin-dashboard-panel seller-dashboard-chart-panel">
            <div className="admin-dashboard-panel-head">
              <div>
                <h2>Notifications</h2>
                <p>New follower, order, and payment updates from the last 24 hours.</p>
              </div>
              <strong className="admin-panel-figure">{visibleNotifications.length}</strong>
            </div>

            {visibleNotifications.length === 0 ? (
              <div className="profile-followed-empty seller-notification-empty">No new notifications right now.</div>
            ) : (
              <div className="profile-notification-list">
                {visibleNotifications.map((notification) => (
                  <div key={notification.id} className={`profile-notification-card seller-notification-card ${notification.tone}`}>
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
          </article>

          <article className="admin-dashboard-panel seller-dashboard-chart-panel">
            <div className="admin-dashboard-panel-head">
              <div>
                <h2>Revenue trend</h2>
                <p>Last 7 days of paid sales from your products.</p>
              </div>
              <strong className="admin-panel-figure">{formatCurrency(stats.revenue)}</strong>
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
        </div>
      </section>

      <section className={`admin-sec ${activeSection === 'products' ? '' : 'admin-hidden'}`}>
        <h3 className="admin-sec-title">Manage Your Inventory</h3>
        <div id="admin-product-list">
          {products.length === 0 ? (
            <div className="admin-card">No products found.</div>
          ) : (
            products.map((p) => (
              <div key={p.id} className="admin-card admin-product-card">
                {resolveProductImagePath(p.image) ? (
                  <Image
                    src={resolveProductImagePath(p.image) || ''}
                    alt={p.name}
                    width={160}
                    height={160}
                    unoptimized
                  />
                ) : (
                  <div className="admin-product-image-placeholder" />
                )}
                <div className="admin-product-main">
                  <p>
                    {p.name} {p.is_trend ? <i className="fa-solid fa-fire admin-trend-icon" /> : null}
                  </p>
                  <small>Stock: {p.stock || 0} | RWF {Number(p.price || 0).toLocaleString()}</small>
                </div>
                <div className="admin-card-actions">
                  <button
                    type="button"
                    title="Edit"
                    className="admin-card-action-edit"
                    onClick={() => handleEditProduct(p)}
                  >
                    <i className="fa-solid fa-pen-to-square"></i>
                  </button>
                  <button title="Delete" onClick={() => handleDeleteProduct(Number(p.id))}>
                    <i className="fa-solid fa-trash"></i>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className={`admin-sec ${activeSection === 'upload' ? '' : 'admin-hidden'}`}>
        <form className="admin-card" onSubmit={handleAddProduct}>
          <h3 className="admin-sec-title">{editingProduct ? `Edit Product #${editingProduct.id}` : 'Add New Product'}</h3>

          <label className="adm-label">Product Name</label>
          <input className="adm-input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />

          <label className="adm-label">Description</label>
          <textarea className="adm-input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />

          <div className="admin-two-col">
            <div>
              <label className="adm-label">Price (RWF)</label>
              <input type="number" className="adm-input" required value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
            </div>
            <div>
              <label className="adm-label">Stock Qty</label>
              <input type="number" className="adm-input" required value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} />
            </div>
          </div>

          <label className="adm-label">Category</label>
          <input className="adm-input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />

          <label className="adm-label">Product Images</label>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            multiple
            className="adm-input"
            onChange={handleImageSelection}
          />
          <p className="admin-upload-help">
            {editingProduct
              ? 'Choose new image files only if you want to replace the current product images.'
              : 'Choose one or many images from the device. The first image becomes the main image.'}
          </p>
          {editingProduct && getProductImages(editingProduct).length > 0 ? (
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '15px', marginBottom: '15px' }}>
              {getProductImages(editingProduct).map((imagePath, index) => (
                <div key={`${imagePath}-${index}`} style={{ position: 'relative', width: '80px', height: '80px', border: '1px solid #ddd', borderRadius: '6px', overflow: 'hidden' }}>
                  <img src={resolveProductImagePath(imagePath)} alt="Current product" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <button 
                    type="button" 
                    onClick={() => handleRemoveExistingImage(index)}
                    title="Remove image"
                    style={{ position: 'absolute', top: 0, right: 0, background: 'rgba(255, 0, 0, 0.8)', color: 'white', border: 'none', borderBottomLeftRadius: '4px', cursor: 'pointer', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 'bold' }}
                  >
                    ×
                  </button>
                  {index === 0 && <span style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.6)', color: 'white', fontSize: '10px', textAlign: 'center', padding: '2px 0' }}>Main</span>}
                </div>
              ))}
            </div>
          ) : null}
          {imageFiles.length > 0 ? (
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '15px', marginBottom: '15px' }}>
              {imageFiles.map((file, index) => (
                <div key={`${file.name}-${index}`} style={{ position: 'relative', width: '80px', height: '80px', border: '1px solid #ddd', borderRadius: '6px', overflow: 'hidden' }}>
                  <img src={URL.createObjectURL(file)} alt={file.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <button 
                    type="button" 
                    onClick={() => handleRemoveImageFile(index)}
                    title="Remove image"
                    style={{ position: 'absolute', top: 0, right: 0, background: 'rgba(255, 0, 0, 0.8)', color: 'white', border: 'none', borderBottomLeftRadius: '4px', cursor: 'pointer', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 'bold' }}
                  >
                    ×
                  </button>
                  {index === 0 && <span style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.6)', color: 'white', fontSize: '10px', textAlign: 'center', padding: '2px 0' }}>Main</span>}
                </div>
              ))}
            </div>
          ) : null}

          <div className="admin-two-col">
            <div>
              <label className="adm-label">Colors</label>
              <input className="adm-input" value={form.colors} onChange={(e) => setForm({ ...form, colors: e.target.value })} />
            </div>
            <div>
              <label className="adm-label">Sizes</label>
              <input className="adm-input" value={form.sizes} onChange={(e) => setForm({ ...form, sizes: e.target.value })} />
            </div>
          </div>

          <div className="admin-two-col">
            <div>
              <label className="adm-label">Badge Label</label>
              <input className="adm-input" value={form.badge} onChange={(e) => setForm({ ...form, badge: e.target.value })} />
            </div>
            <div>
              <label className="adm-label">Original Price</label>
              <input
                type="number"
                className="adm-input"
                value={form.original_price}
                onChange={(e) => setForm({ ...form, original_price: e.target.value })}
              />
            </div>
          </div>

          <div className="admin-product-form-actions">
            {editingProduct ? (
              <button type="button" className="btn-discard-outline profile-btn-visible" onClick={resetProductForm}>
                Cancel Edit
              </button>
            ) : null}
            <button className="adm-btn" type="submit" disabled={uploading}>
              {uploading ? (
                <LoadingDots label="Loading" size="sm" className="dot-loader--inverse dot-loader--button" />
              ) : editingProduct ? 'Update Product' : 'Save Product'}
            </button>
          </div>
        </form>
      </section>

      <section className={`admin-sec ${activeSection === 'orders' ? '' : 'admin-hidden'}`}>
        <h3 className="admin-sec-title">Your Orders</h3>
        {orders.length > 0 ? (
          <div className="admin-order-filter-bar">
            <div className="admin-order-filter-top">
              <div className="admin-order-filters" aria-label="Filter orders by status">
                {orderFilters.map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  className={`admin-order-filter-chip ${orderFilter === filter.value ? 'active' : ''}`}
                  onClick={() => setOrderFilter(filter.value)}
                >
                  <span>{filter.label}</span>
                  <strong>{orderCounts[filter.value]}</strong>
                </button>
              ))}
            </div>

              <button
                type="button"
                className="admin-order-filter-open"
                onClick={() => setShowOrderFilterModal(true)}
              >
                <i className="fa-solid fa-sliders"></i>
                Filter
              </button>
            </div>
          </div>
        ) : null}
        {orders.length === 0 ? (
          <div className="admin-card">No orders found yet.</div>
        ) : visibleOrders.length === 0 ? (
          <div className="admin-card">No {orderFilter} orders found.</div>
        ) : (
          visibleOrders.map((o) => (
            <div key={o.id} className="admin-card admin-order-card">
              <div className="admin-order-top">
                <h4>Order #{o.id}</h4>
                <span>{normalizeOrderStatus(o.status).toUpperCase()}</span>
              </div>
              <p>{new Date(o.created_at).toLocaleString()}</p>
              <p>Your Products Total: RWF {Number(o.seller_total || 0).toLocaleString()}</p>
              <p>Customer Paid: RWF {Number(o.total_amount || 0).toLocaleString()}</p>
              <div className="status-line">
                <div className="step completed"><div className="step-icon"><i className="fa-solid fa-receipt"></i></div><span>Placed</span></div>
                <div className={`step ${['paid', 'processing', 'delivered'].includes(normalizeOrderStatus(o.status)) ? 'completed' : ''}`}><div className="step-icon"><i className="fa-solid fa-credit-card"></i></div><span>Paid</span></div>
                <div className={`step ${['processing', 'delivered'].includes(normalizeOrderStatus(o.status)) ? 'completed' : ''}`}><div className="step-icon"><i className="fa-solid fa-box-open"></i></div><span>Processing</span></div>
                <div className={`step ${normalizeOrderStatus(o.status) === 'delivered' ? 'completed' : ''}`}><div className="step-icon"><i className="fa-solid fa-truck-fast"></i></div><span>Delivered</span></div>
              </div>

              <div className="admin-order-actions-row">
                <button type="button" className="admin-order-action-btn" onClick={() => setOrderListModal(o)}>
                  Order List
                </button>
                <button type="button" className="admin-order-action-btn admin-order-action-btn-secondary" onClick={() => setCustomerInfoModal(o)}>
                  Customer Info
                </button>
              </div>

              <div className="admin-order-status-select">
                <label htmlFor={`order-status-${o.id}`}>Update Status</label>
                <select
                  id={`order-status-${o.id}`}
                  value={normalizeOrderStatus(o.status)}
                  onChange={(e) => updateOrderStatus(o.id, e.target.value)}
                >
                  <option value="pending">Pending</option>
                  <option value="paid">Paid</option>
                  <option value="processing">Processing</option>
                  <option value="delivered">Delivered</option>
                  <option value="canceled">Canceled</option>
                </select>
              </div>
            </div>
          ))
        )}
      </section>

      {showOrderFilterModal ? (
        <div className="admin-detail-overlay" onClick={() => setShowOrderFilterModal(false)}>
          <div className="admin-detail-modal admin-order-filter-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-order-filter-modal-head">
              <div>
                <h4>Filter Orders</h4>
                <p>Search by name, date, phone, product, or order details.</p>
              </div>
              <button
                type="button"
                className="logout-btn"
                onClick={() => setShowOrderFilterModal(false)}
                aria-label="Close filter modal"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <div className="admin-order-filter-grid">
              <label className="admin-order-filter-field">
                <span>Search</span>
                <input
                  type="text"
                  value={orderSearch}
                  onChange={(e) => setOrderSearch(e.target.value)}
                  placeholder="Order ID, name, phone, product..."
                />
              </label>

              <label className="admin-order-filter-field">
                <span>From</span>
                <input
                  type="date"
                  value={orderDateFrom}
                  onChange={(e) => setOrderDateFrom(e.target.value)}
                />
              </label>

              <label className="admin-order-filter-field">
                <span>To</span>
                <input
                  type="date"
                  value={orderDateTo}
                  onChange={(e) => setOrderDateTo(e.target.value)}
                />
              </label>
            </div>

            <div className="admin-order-filter-modal-actions">
              <button
                type="button"
                className="admin-order-filter-reset"
                onClick={() => {
                  setOrderFilter('all');
                  setOrderSearch('');
                  setOrderDateFrom('');
                  setOrderDateTo('');
                }}
              >
                Reset
              </button>

              <button
                type="button"
                className="adm-btn admin-order-filter-apply"
                onClick={() => setShowOrderFilterModal(false)}
              >
                Apply Filters
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <section className={`admin-sec ${activeSection === 'settings' ? '' : 'admin-hidden'}`}>
        <div className="settings-top-card admin-card">
              <div className="settings-profile">
                <div className="settings-avatar">
              <span>{(user.business_name?.charAt(0) || user.full_name?.charAt(0) || user.email?.charAt(0) || 'A').toUpperCase()}</span>
              <button type="button" className="avatar-edit-btn" onClick={() => setShowProfilePanel(true)}>
                <i className="fa-solid fa-pen"></i>
              </button>
            </div>
            <div>
              <p className="settings-welcome-text">Welcome back</p>
              <h3>{user.business_name || user.full_name || 'Seller'}</h3>
              <small>{user.email}</small>
            </div>
          </div>
          <button type="button" className="logout-btn" onClick={handleLogout} aria-label="Logout">
            <i className="fa-solid fa-arrow-right-from-bracket"></i>
          </button>
        </div>

        {!showProfilePanel ? (
          <>
            <div id="settings-overview" className="settings-overview">
              <div className="settings-grid">
                <button type="button" className="settings-tile" onClick={() => setShowProfilePanel(true)}>
                  <span className="settings-tile-icon"><i className="fa-solid fa-store"></i></span>
                  <div className="tile-text">
                    <strong>Seller Profile</strong>
                    <small>Update business name, phone and address</small>
                  </div>
                  <i className="fa-solid fa-chevron-right settings-chevron"></i>
                </button>
                <button type="button" className="settings-tile" onClick={() => window.alert('Password change is not wired up here yet.')}>
                  <span className="settings-tile-icon"><i className="fa-solid fa-lock"></i></span>
                  <div className="tile-text">
                    <strong>Change Password</strong>
                    <small>Keep your account secure</small>
                  </div>
                  <i className="fa-solid fa-chevron-right settings-chevron"></i>
                </button>
                <button type="button" className="settings-tile" onClick={() => window.alert('This section is coming soon.')}>
                  <span className="settings-tile-icon"><i className="fa-solid fa-circle-question"></i></span>
                  <div className="tile-text">
                    <strong>FAQs</strong>
                    <small>Quick answers and help</small>
                  </div>
                  <i className="fa-solid fa-chevron-right settings-chevron"></i>
                </button>
                <div className="settings-tile switch-tile">
                  <div className="switch-tile-row">
                    <span className="settings-tile-icon"><i className="fa-solid fa-bell"></i></span>
                    <div className="tile-text">
                      <strong>Push Notifications</strong>
                      <small>Receive alerts for new orders</small>
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
                  <p>If you have another question, our support team is ready to help.</p>
                </div>
                <a href="https://wa.me/250123456789" target="_blank" rel="noreferrer">WhatsApp Us</a>
              </div>
            </div>
          </>
        ) : (
          <div id="settings-profile-panel" className="settings-profile-panel">
            <header>
              <div>
                <h4>Seller Profile</h4>
                <p>Edit your business details</p>
              </div>
              <button type="button" className="logout-btn" onClick={() => setShowProfilePanel(false)} aria-label="Close">
                <i className="fa-solid fa-xmark"></i>
              </button>
            </header>

            <form onSubmit={handleSaveProfile}>
              <label className="adm-label">Business Name</label>
              <input
                type="text"
                className="adm-input"
                value={profileForm.business_name}
                onChange={(e) => setProfileForm({ ...profileForm, business_name: e.target.value })}
                placeholder="Enter business name"
              />

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
                  {savingProfile ? (
                    <LoadingDots label="Loading" size="sm" className="dot-loader--inverse dot-loader--button" />
                  ) : 'Save'}
                </button>
              </div>
            </form>
          </div>
        )}
      </section>

      {orderListModal && (
        <div className="admin-detail-overlay" onClick={() => setOrderListModal(null)}>
          <div className="admin-detail-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-detail-head">
              <h3>Order List #{orderListModal.id}</h3>
              <button type="button" className="admin-detail-close" onClick={() => setOrderListModal(null)}>
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
            <div className="admin-detail-body">
              {(orderListModal.items || []).length === 0 ? (
                <p className="admin-detail-empty">No order items found.</p>
              ) : (
                (orderListModal.items || []).map((item) => (
                  <div key={item.id} className="admin-detail-item-card">
                    <strong>{item.product_name}</strong>
                    <span>Quantity: {item.quantity}</span>
                    <span>Color: {item.color || 'Not selected'}</span>
                    <span>Size: {item.size || 'Not selected'}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {customerInfoModal && (
        <div className="admin-detail-overlay" onClick={() => setCustomerInfoModal(null)}>
          <div className="admin-detail-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-detail-head">
              <h3>Customer Info</h3>
              <button type="button" className="admin-detail-close" onClick={() => setCustomerInfoModal(null)}>
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
            <div className="admin-detail-body">
              <div className="admin-detail-info-grid">
                <div className="admin-detail-info-row">
                  <span>Customer ID</span>
                  <strong>{customerInfoModal.customer?.id || 'N/A'}</strong>
                </div>
                <div className="admin-detail-info-row">
                  <span>Full Name</span>
                  <strong>{customerInfoModal.full_name || customerInfoModal.customer?.full_name || 'N/A'}</strong>
                </div>
                <div className="admin-detail-info-row">
                  <span>Email</span>
                  <strong>{customerInfoModal.customer_email || customerInfoModal.customer?.email || 'N/A'}</strong>
                </div>
                <div className="admin-detail-info-row">
                  <span>Phone</span>
                  <strong>{customerInfoModal.phone || customerInfoModal.customer?.phone || 'N/A'}</strong>
                </div>
                <div className="admin-detail-info-row">
                  <span>Address</span>
                  <strong>{customerInfoModal.location || customerInfoModal.customer?.address || 'N/A'}</strong>
                </div>
                <div className="admin-detail-info-row">
                  <span>Business HQ</span>
                  <strong>{BUSINESS_HQ.label}</strong>
                </div>
                <div className="admin-detail-info-row">
                  <span>Distance</span>
                  <strong>{Number(customerInfoModal.delivery_distance_km || 0).toFixed(2)} km</strong>
                </div>
                <div className="admin-detail-info-row">
                  <span>Delivery Fee</span>
                  <strong>RWF {Number(customerInfoModal.delivery_fee || 0).toLocaleString()}</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <nav className="admin-nav">
        <button className={`nav-item ${activeSection === 'stats' ? 'active' : ''}`} onClick={() => switchSection('stats')}>
          <i className="fa-solid fa-chart-line"></i><span>Overview</span>
        </button>
        <button className={`nav-item ${activeSection === 'products' ? 'active' : ''}`} onClick={() => switchSection('products')}>
          <i className="fa-solid fa-box-open"></i><span>Items</span>
        </button>
        <div className="fab-placeholder" aria-hidden="true"></div>
        <button className={`nav-item ${activeSection === 'orders' ? 'active' : ''}`} onClick={() => switchSection('orders')}>
          <i className="fa-solid fa-cart-shopping"></i><span>Orders</span>
        </button>
        <button className={`nav-item ${activeSection === 'settings' ? 'active' : ''}`} onClick={switchToSettings}>
          <i className="fa-solid fa-gear"></i><span>Settings</span>
        </button>
        <button className={`fab-btn ${activeSection === 'upload' ? 'active' : ''}`} onClick={() => switchSection('upload')} aria-label="Add">
          <i className="fa-solid fa-plus"></i>
        </button>
      </nav>
    </main>
  );
}
