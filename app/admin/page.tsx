'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUserFromServer, handleLogoutLocal, safeFetch, resolveProductImagePath } from '../../services/api';
import { Product, User } from '../../types';
import { useConfirm } from '../../components/ConfirmProvider';
import LoadingDots from '../../components/LoadingDots';

type AdminSection = 'stats' | 'products' | 'upload' | 'orders';
type AdminStats = {
  revenue: number;
  orders: number;
  products: number;
  trend_products: number;
};

type AdminOrderItem = {
  id: number;
  product_name: string;
  quantity: number;
  color?: string | null;
  size?: string | null;
};

type AdminOrder = {
  id: number;
  status: string;
  total_amount: number;
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
  items?: AdminOrderItem[];
};

export default function AdminPage() {
  const confirm = useConfirm();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<AdminSection | 'settings'>('stats');
  const [stats, setStats] = useState<AdminStats>({ revenue: 0, orders: 0, products: 0, trend_products: 0 });
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [orderListModal, setOrderListModal] = useState<AdminOrder | null>(null);
  const [customerInfoModal, setCustomerInfoModal] = useState<AdminOrder | null>(null);
  const [uploading, setUploading] = useState(false);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [savingProfile, setSavingProfile] = useState(false);
  const [showProfilePanel, setShowProfilePanel] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [profileForm, setProfileForm] = useState({ full_name: '', phone: '', address: '' });
  const [profileOriginal, setProfileOriginal] = useState({ full_name: '', phone: '', address: '' });
  const [form, setForm] = useState({
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
  });
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const router = useRouter();

  useEffect(() => {
    const loadUser = async () => {
      setLoading(true);
      const serverUser = await getCurrentUserFromServer();
      if (!serverUser || serverUser.role !== 'admin') {
        router.push('/login');
        return;
      }
      const mappedProfile = {
        full_name: serverUser.full_name || '',
        phone: serverUser.phone || '',
        address: serverUser.address || '',
      };
      setUser(serverUser);
      setProfileForm(mappedProfile);
      setProfileOriginal(mappedProfile);
      await Promise.all([loadDashboardStats(), loadProducts(), loadOrders()]);
      setLoading(false);
    };
    loadUser();
  }, [router]);

  const loadDashboardStats = async () => {
    try {
      const result = await safeFetch<{ success: boolean; stats?: AdminStats; orders?: any[] }>('/api/admin/dashboard');
      if (result.success && result.stats) {
        setStats(result.stats);
      }
    } catch {
      // keep defaults
    }
  };

  const loadProducts = async () => {
    try {
      const result = await safeFetch<{ success: boolean; products?: Product[] }>('/api/products?limit=50');
      if (result.success && result.products) {
        setProducts(result.products);
      }
    } catch {
      // keep previous
    }
  };

  const loadOrders = async () => {
    try {
      const result = await safeFetch<{ success: boolean; orders?: AdminOrder[] }>('/api/admin/orders');
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

  const switchSection = async (section: AdminSection) => {
    setActiveSection(section);
    setShowProfilePanel(false);
    if (section === 'products') await loadProducts();
    if (section === 'orders') await loadOrders();
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
      if (imageFiles.length === 0) {
        window.alert('Please choose at least one product image.');
        return;
      }

      const uploadData = new FormData();
      imageFiles.forEach((file) => uploadData.append('files', file));

      const uploadResult = await safeFetch<{ success: boolean; message?: string; paths?: string[] }>('/api/upload', {
        method: 'POST',
        body: uploadData,
      });

      const uploadedPaths = Array.isArray(uploadResult.paths) ? uploadResult.paths : [];
      if (!uploadResult.success || uploadedPaths.length === 0) {
        window.alert(uploadResult.message || 'Image upload failed.');
        return;
      }

      const payload = {
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
        image: uploadedPaths[0],
        images: uploadedPaths,
      };
      const result = await safeFetch<{ success: boolean; message?: string }>('/api/products', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (result.success) {
        window.alert('Product saved successfully.');
        setForm({
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
        });
        setImageFiles([]);
        if (imageInputRef.current) {
          imageInputRef.current.value = '';
        }
        await Promise.all([loadProducts(), loadDashboardStats()]);
        setActiveSection('products');
      } else {
        window.alert(result.message || 'Failed to save product.');
      }
    } catch (err: any) {
      window.alert(err?.message || 'Network error.');
    } finally {
      setUploading(false);
    }
  };

  const handleImageSelection = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setImageFiles(files);
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
    } catch (err: any) {
      window.alert(err?.message || 'Delete failed.');
    }
  };

  const updateOrderStatus = async (orderId: number, status: string) => {
    try {
      const result = await safeFetch<{ success: boolean; message?: string }>('/api/admin/orders', {
        method: 'PATCH',
        body: JSON.stringify({ order_id: orderId, status }),
      });
      if (!result.success) {
        window.alert(result.message || 'Failed to update order status.');
        return;
      }
      await Promise.all([loadOrders(), loadDashboardStats()]);
    } catch (err: any) {
      window.alert(err?.message || 'Failed to update order status.');
    }
  };

  const estimateDeliveryDistanceKm = (location?: string | null) => {
    const value = String(location || '').toLowerCase();
    if (!value) return 0;
    if (value.includes('nyarugenge')) return 6;
    if (value.includes('kicukiro')) return 10;
    if (value.includes('gasabo')) return 12;
    if (value.includes('remera')) return 8;
    if (value.includes('kimironko')) return 10;
    if (value.includes('nyamirambo')) return 7;
    if (value.includes('gisozi')) return 9;
    if (value.includes('kacyiru')) return 6;
    if (value.includes('kigali')) return 6;
    return 14;
  };

  const getDeliveryFee = (location?: string | null) => {
    const distanceKm = estimateDeliveryDistanceKm(location);
    return Math.ceil(distanceKm / 2) * 200;
  };

  const getOrderGrandTotal = (order: AdminOrder) => Number(order.total_amount || 0) + getDeliveryFee(order.location);

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
        setShowProfilePanel(false);
      } else {
        window.alert(result.message || 'Failed to update profile.');
      }
    } catch (err: any) {
      window.alert(err?.message || 'Could not save changes.');
    } finally {
      setSavingProfile(false);
    }
  };

  if (loading) {
    return (
      <div className="profile-loading">
        <LoadingDots label="Loading" size="lg" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="profile-loading">
        <LoadingDots label="Loading" size="lg" />
      </div>
    );
  }

  return (
    <main className="admin-page-shell">
      <section className={`admin-sec ${activeSection === 'stats' ? '' : 'admin-hidden'}`}>
        <div className="stats-grid">
          <div className="stat-box">
            <h2>RWF {Number(stats.revenue || 0).toLocaleString()}</h2>
            <p>Total Revenue</p>
          </div>
          <div className="stat-box">
            <h2>{stats.orders || 0}</h2>
            <p>Active Orders</p>
          </div>
          <div className="stat-box">
            <h2>{stats.products || 0}</h2>
            <p>Total Products</p>
          </div>
          <div className="stat-box">
            <h2>{stats.trend_products || 0}</h2>
            <p>Trend Products</p>
          </div>
        </div>
      </section>

      <section className={`admin-sec ${activeSection === 'products' ? '' : 'admin-hidden'}`}>
        <h3 className="admin-sec-title">Manage Inventory</h3>
        <div id="admin-product-list">
          {products.length === 0 ? (
            <div className="admin-card">No products found.</div>
          ) : (
            products.map((p) => (
              <div key={p.id} className="admin-card admin-product-card">
                {resolveProductImagePath(p.image) ? (
                  <img src={resolveProductImagePath(p.image)} alt={p.name} />
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
          <h3 className="admin-sec-title">Add New Product</h3>

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
            required
            className="adm-input"
            onChange={handleImageSelection}
          />
          <p className="admin-upload-help">
            Choose one or many images from the device. The first image becomes the main image.
          </p>
          {imageFiles.length > 0 ? (
            <div className="admin-upload-list">
              {imageFiles.map((file, index) => (
                <div key={`${file.name}-${index}`} className="admin-upload-item">
                  <span>{file.name}</span>
                  {index === 0 ? <strong>Main image</strong> : <small>Extra image</small>}
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
              <label className="adm-label">Sold Count</label>
              <input type="number" className="adm-input" value={form.sold} onChange={(e) => setForm({ ...form, sold: e.target.value })} />
            </div>
          </div>

          <label className="admin-checkbox-row">
            <input type="checkbox" checked={form.is_trend} onChange={(e) => setForm({ ...form, is_trend: e.target.checked })} />
            Trend Product?
          </label>

          <button className="adm-btn" type="submit" disabled={uploading}>
            {uploading ? (
              <LoadingDots label="Loading" size="sm" className="dot-loader--inverse dot-loader--button" />
            ) : 'Save Product'}
          </button>
        </form>
      </section>

      <section className={`admin-sec ${activeSection === 'orders' ? '' : 'admin-hidden'}`}>
        <h3 className="admin-sec-title">Recent Orders</h3>
        {orders.length === 0 ? (
          <div className="admin-card">No orders found yet.</div>
        ) : (
          orders.map((o) => (
            <div key={o.id} className="admin-card admin-order-card">
              <div className="admin-order-top">
                <h4>Order #{o.id}</h4>
                <span>{String(o.status || 'pending').toUpperCase()}</span>
              </div>
              <p>{new Date(o.created_at).toLocaleString()}</p>
              <p>Products Total: RWF {Number(o.total_amount || 0).toLocaleString()}</p>
              <p>Delivery Fee: RWF {getDeliveryFee(o.location).toLocaleString()}</p>
              <p className="admin-order-grand-total">Grand Total: RWF {getOrderGrandTotal(o).toLocaleString()}</p>
              <div className="status-line">
                <div className="step completed"><div className="step-icon"><i className="fa-solid fa-receipt"></i></div><span>Placed</span></div>
                <div className={`step ${['paid', 'processing', 'delivered'].includes(String(o.status || '').toLowerCase()) ? 'completed' : ''}`}><div className="step-icon"><i className="fa-solid fa-credit-card"></i></div><span>Paid</span></div>
                <div className={`step ${['processing', 'delivered'].includes(String(o.status || '').toLowerCase()) ? 'completed' : ''}`}><div className="step-icon"><i className="fa-solid fa-box-open"></i></div><span>Processing</span></div>
                <div className={`step ${String(o.status || '').toLowerCase() === 'delivered' ? 'completed' : ''}`}><div className="step-icon"><i className="fa-solid fa-truck-fast"></i></div><span>Delivered</span></div>
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
                  value={String(o.status || 'pending').toLowerCase()}
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

      <section className={`admin-sec ${activeSection === 'settings' ? '' : 'admin-hidden'}`}>
        <div className="settings-top-card admin-card">
          <div className="settings-profile">
            <div className="settings-avatar">
              <span>{(user.full_name?.charAt(0) || user.email?.charAt(0) || 'A').toUpperCase()}</span>
              <button type="button" className="avatar-edit-btn" onClick={() => setShowProfilePanel(true)}>
                <i className="fa-solid fa-pen"></i>
              </button>
            </div>
            <div>
              <p className="settings-welcome-text">Welcome back</p>
              <h3>{user.full_name || 'Admin'}</h3>
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
                  <span className="settings-tile-icon"><i className="fa-solid fa-user"></i></span>
                  <div className="tile-text">
                    <strong>User Profile</strong>
                    <small>Update name, phone and address</small>
                  </div>
                  <i className="fa-solid fa-chevron-right settings-chevron"></i>
                </button>
                <button type="button" className="settings-tile" onClick={() => window.alert('Password change is not wired up here yet.')}>
                  <span className="settings-tile-icon"><i className="fa-solid fa-lock"></i></span>
                  <div className="tile-text">
                    <strong>Change Password</strong>
                    <small>Keep your admin account secure</small>
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
                <h4>User Profile</h4>
                <p>Edit your personal details</p>
              </div>
              <button type="button" className="logout-btn" onClick={() => setShowProfilePanel(false)} aria-label="Close">
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
                  <span>Estimated Distance</span>
                  <strong>{estimateDeliveryDistanceKm(customerInfoModal.location)} km</strong>
                </div>
                <div className="admin-detail-info-row">
                  <span>Delivery Fee</span>
                  <strong>RWF {getDeliveryFee(customerInfoModal.location).toLocaleString()}</strong>
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
