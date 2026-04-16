'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUserFromServer, handleLogoutLocal, safeFetch } from '../../services/api';
import { Product, User } from '../../types';
import { useConfirm } from '../../components/ConfirmProvider';

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
  created_at: string;
  items?: AdminOrderItem[];
};

export default function AdminPage() {
  const confirm = useConfirm();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<AdminSection>('stats');
  const [stats, setStats] = useState<AdminStats>({ revenue: 0, orders: 0, products: 0, trend_products: 0 });
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [uploading, setUploading] = useState(false);
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
  const router = useRouter();

  useEffect(() => {
    const loadUser = async () => {
      setLoading(true);
      const serverUser = await getCurrentUserFromServer();
      if (!serverUser || serverUser.role !== 'admin') {
        router.push('/login');
        return;
      }
      setUser(serverUser);
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
        setOrders(result.orders || []);
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
    try {
      await safeFetch('/api/auth', {
        method: 'POST',
        body: JSON.stringify({ mode: 'logout' }),
      });
    } catch {
      // ignore
    }
    router.push('/login');
  };

  const switchSection = async (section: AdminSection) => {
    setActiveSection(section);
    if (section === 'products') await loadProducts();
    if (section === 'orders') await loadOrders();
    if (section === 'stats') await loadDashboardStats();
  };

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setUploading(true);
    try {
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
        image: form.image,
        images: form.image ? [form.image] : [],
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
        await Promise.all([loadProducts(), loadDashboardStats()]);
        setActiveSection('products');
      } else {
        window.alert(result.message || 'Failed to save product');
      }
    } catch (err: any) {
      window.alert(err?.message || 'Network error');
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteProduct = async (id: number) => {
    if (!window.confirm('Delete this product?')) return;
    try {
      const result = await safeFetch<{ success: boolean; message?: string }>(`/api/products?id=${id}`, {
        method: 'DELETE',
      });
      if (!result.success) {
        window.alert(result.message || 'Delete failed');
        return;
      }
      await Promise.all([loadProducts(), loadDashboardStats()]);
    } catch (err: any) {
      window.alert(err?.message || 'Delete failed');
    }
  };

  const updateOrderStatus = async (orderId: number, status: string) => {
    try {
      const result = await safeFetch<{ success: boolean; message?: string }>('/api/admin/orders', {
        method: 'PATCH',
        body: JSON.stringify({ order_id: orderId, status }),
      });
      if (!result.success) {
        window.alert(result.message || 'Failed to update order status');
        return;
      }
      await Promise.all([loadOrders(), loadDashboardStats()]);
    } catch (err: any) {
      window.alert(err?.message || 'Failed to update order status');
    }
  };

  if (loading) {
    return <div className="profile-loading">Loading...</div>;
  }

  if (!user) {
    return <div className="profile-loading">Loading...</div>;
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
                <img src={p.image || '/upload/sample3.jpg'} alt={p.name} />
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

          <label className="adm-label">Main Image URL</label>
          <input className="adm-input" value={form.image} onChange={(e) => setForm({ ...form, image: e.target.value })} />

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
            {uploading ? 'Saving...' : 'Save Product'}
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
                <span>RWF {Number(o.total_amount || 0).toLocaleString()}</span>
              </div>
              <p>Customer: {o.full_name || 'Guest'}</p>
              <p>Phone: {o.phone || 'N/A'}</p>
              <p>Location: {o.location || 'N/A'}</p>
              <p>{new Date(o.created_at).toLocaleString()}</p>
              <div className="status-line">
                <div className="step completed"><div className="step-icon"><i className="fa-solid fa-receipt"></i></div><span>Placed</span></div>
                <div className={`step ${['paid', 'processing', 'delivered'].includes(String(o.status || '').toLowerCase()) ? 'completed' : ''}`}><div className="step-icon"><i className="fa-solid fa-credit-card"></i></div><span>Paid</span></div>
                <div className={`step ${['processing', 'delivered'].includes(String(o.status || '').toLowerCase()) ? 'completed' : ''}`}><div className="step-icon"><i className="fa-solid fa-box-open"></i></div><span>Processing</span></div>
                <div className={`step ${String(o.status || '').toLowerCase() === 'delivered' ? 'completed' : ''}`}><div className="step-icon"><i className="fa-solid fa-truck-fast"></i></div><span>Delivered</span></div>
              </div>

              <div className="admin-order-items">
                {(o.items || []).map((item) => (
                  <div key={item.id} className="admin-order-item-row">
                    <strong>{item.product_name}</strong>
                    <span>
                      x{item.quantity}
                      {item.color ? `, ${item.color}` : ''}
                      {item.size ? `, ${item.size}` : ''}
                    </span>
                  </div>
                ))}
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

      <nav className="admin-nav">
        <button className={`nav-item ${activeSection === 'stats' ? 'active' : ''}`} onClick={() => switchSection('stats')}>
          <i className="fa-solid fa-chart-line"></i><span>Stats</span>
        </button>
        <button className={`nav-item ${activeSection === 'products' ? 'active' : ''}`} onClick={() => switchSection('products')}>
          <i className="fa-solid fa-box"></i><span>Items</span>
        </button>
        <button className={`nav-item ${activeSection === 'upload' ? 'active' : ''}`} onClick={() => switchSection('upload')}>
          <i className="fa-solid fa-plus-circle"></i><span>Add</span>
        </button>
        <button className={`nav-item ${activeSection === 'orders' ? 'active' : ''}`} onClick={() => switchSection('orders')}>
          <i className="fa-solid fa-truck"></i><span>Orders</span>
        </button>
        <button className="nav-item" onClick={handleLogout}>
          <i className="fa-solid fa-right-from-bracket"></i><span>Logout</span>
        </button>
      </nav>
    </main>
  );
}
