window.addEventListener('DOMContentLoaded', async () => {
  const auth = await safeFetch('/api/auth.js');
  if (!auth.success || !auth.isLoggedIn || auth.user.role !== 'admin') {
    alert('Admin login required');
    window.location.href = 'login.html';
    return;
  }
  document.getElementById('side-avatar').textContent = auth.user.full_name?.[0]?.toUpperCase() || 'A';
  document.getElementById('side-user-name').textContent = auth.user.full_name || 'Admin';
  await loadAdminStats();
  await loadAdminProducts();
});

async function loadAdminStats() {
  try {
    const data = await safeFetch('/api/admin.js?stats=1');
    const statsRoot = document.getElementById('admin-stats');
    if (!data.success) {
      statsRoot.innerHTML = '<div style="color:#888;">Unable to load stats</div>';
      return;
    }
    statsRoot.innerHTML = `
      <div class="stat-card"><h2>${data.products_count}</h2><p>Products</p></div>
      <div class="stat-card"><h2>${data.orders_count}</h2><p>Orders</p></div>
      <div class="stat-card"><h2>${data.users_count}</h2><p>Users</p></div>
    `;
  } catch (error) {
    console.error(error);
  }
}

async function loadAdminProducts() {
  try {
    const data = await safeFetch('/api/admin.js?products=1');
    const tbody = document.querySelector('#admin-products-table tbody');
    if (!tbody) return;
    if (!data.success || !data.products.length) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#888;">No products found</td></tr>';
      return;
    }
    tbody.innerHTML = data.products.map(product => `
      <tr>
        <td>${escapeHtml(product.name)}</nobr></td>
        <td>RWF ${Number(product.price).toFixed(2)}</td>
        <td>${product.stock}</td>
        <td>${product.is_trend ? 'Yes' : 'No'}</td>
      </tr>`).join('');
  } catch (error) {
    console.error(error);
  }
}

const productForm = document.getElementById('productForm');
if (productForm) {
  productForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = {
      name: document.getElementById('prod-name').value.trim(),
      price: document.getElementById('prod-price').value,
      original_price: document.getElementById('prod-original-price').value,
      category: document.getElementById('prod-category').value.trim(),
      badge: document.getElementById('prod-badge').value.trim(),
      stock: document.getElementById('prod-stock').value,
      colors: document.getElementById('prod-colors').value.trim(),
      sizes: document.getElementById('prod-sizes').value.trim(),
      image: document.getElementById('prod-image').value.trim(),
      description: document.getElementById('prod-description').value.trim(),
      is_trend: false
    };
    try {
      const data = await safeFetch('/api/admin.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (data.success) {
        showNotification('Product uploaded', 'success');
        productForm.reset();
        loadAdminProducts();
      } else {
        showNotification(data.message || 'Upload failed', 'error');
      }
    } catch (error) {
      console.error(error);
      showNotification('Unable to upload product', 'error');
    }
  });
}
