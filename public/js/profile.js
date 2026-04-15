const tabs = document.querySelectorAll('.nav-tab');
const profileForm = document.getElementById('profileForm');
const discardBtn = document.getElementById('discardBtn');
let originalProfileValues = {};

tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const target = tab.dataset.target;
    if (!target) return;
    tabs.forEach(item => item.classList.remove('active'));
    tab.classList.add('active');
    document.querySelectorAll('.profile-tab-content').forEach(content => content.classList.remove('active'));
    document.getElementById(target)?.classList.add('active');
  });
});

window.addEventListener('DOMContentLoaded', async () => {
  await fetchUserProfile();
  await fetchUserOrders();
  setupProfileForm();
});

function setupProfileForm() {
  if (!profileForm) return;
  originalProfileValues = {
    full_name: profileForm.full_name?.value || '',
    phone: profileForm.phone?.value || '',
    address: profileForm.address?.value || ''
  };

  profileForm.addEventListener('input', () => {
    const current = {
      full_name: profileForm.full_name?.value || '',
      phone: profileForm.phone?.value || '',
      address: profileForm.address?.value || ''
    };
    const changed = Object.keys(originalProfileValues).some(key => originalProfileValues[key] !== current[key]);
    discardBtn.style.display = changed ? 'inline-flex' : 'none';
  });

  profileForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = {
      full_name: profileForm.full_name.value.trim(),
      phone: profileForm.phone.value.trim(),
      address: profileForm.address.value.trim()
    };
    try {
      const data = await safeFetch('/api/profile.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (data.success) {
        showNotification(data.message || 'Profile updated', 'success');
        const user = getStoredUser() || {};
        user.full_name = payload.full_name;
        user.phone = payload.phone;
        user.address = payload.address;
        localStorage.setItem(LOCAL_USER_INFO, JSON.stringify(user));
        renderHeader();
        originalProfileValues = { ...payload };
        discardBtn.style.display = 'none';
      } else {
        showNotification(data.message || 'Update failed', 'error');
      }
    } catch (error) {
      console.error(error);
      showNotification('Unable to update profile', 'error');
    }
  });
}

function discardChanges() {
  if (!profileForm) return;
  profileForm.full_name.value = originalProfileValues.full_name;
  profileForm.phone.value = originalProfileValues.phone;
  profileForm.address.value = originalProfileValues.address;
  discardBtn.style.display = 'none';
}

async function fetchUserProfile() {
  try {
    const data = await safeFetch('/api/profile.js');
    if (data.success) {
      const user = data.user;
      document.getElementById('profile-name').textContent = user.full_name || 'ShopCorner User';
      document.getElementById('profile-email').textContent = user.email;
      document.getElementById('profile-avatar').textContent = (user.full_name || user.email || 'U')[0].toUpperCase();
      if (profileForm) {
        profileForm.full_name.value = user.full_name || '';
        profileForm.phone.value = user.phone || '';
        profileForm.address.value = user.address || '';
      }
      renderHeader();
      originalProfileValues = {
        full_name: user.full_name || '',
        phone: user.phone || '',
        address: user.address || ''
      };
    }
  } catch (error) {
    console.error('Profile load failed', error);
    showNotification('Unable to load profile', 'error');
  }
}

async function fetchUserOrders() {
  try {
    const data = await safeFetch('/api/order.js');
    const ordersList = document.getElementById('orders-list');
    if (!ordersList) return;
    if (data?.success && data.orders?.length) {
      ordersList.innerHTML = data.orders.map(order => `
        <div class="order-card">
          <h4>Order #${order.id} - ${order.status}</h4>
          <p>Total: RWF ${Number(order.total_amount).toFixed(2)}</p>
          <p>Placed on: ${new Date(order.created_at).toLocaleDateString()}</p>
        </div>
      `).join('');
      document.getElementById('orders-count').textContent = data.orders.length;
      document.getElementById('spent-amount').textContent = `RWF ${Number(data.orders.reduce((sum, item) => sum + Number(item.total_amount), 0)).toFixed(2)}`;
    } else {
      ordersList.innerHTML = '<div style="text-align:center;color:#888;">No orders placed yet.</div>';
    }
  } catch (error) {
    console.error('Orders load failed', error);
    document.getElementById('orders-list').innerHTML = '<div style="text-align:center;color:#888;">Unable to load orders.</div>';
  }
}
