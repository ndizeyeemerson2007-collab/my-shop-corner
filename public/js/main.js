const API_BASE = '/api/';
const LOCAL_AUTH_TOKEN = 'shopcorner_token';
const LOCAL_USER_INFO = 'shopcorner_user';
let productsData = [];
let trendProducts = [];
let currentSlide = 0;
let slideInterval = null;
const SLIDE_DURATION = 4000;

function initApp() {
  renderHeader();
  setupEventListeners();
  startTimer();
  loadProducts();
  loadCartCount();
  loadTrendProducts();
  handleScrollEffects();
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

function renderHeader() {
  const profileLink = document.getElementById('profile-link');
  const logoutLink = document.getElementById('logout-link');
  const loginLink = document.getElementById('login-link');
  const sideAvatar = document.getElementById('side-avatar');
  const sideUserName = document.getElementById('side-user-name');
  const userInfo = getStoredUser();

  if (userInfo && profileLink && logoutLink && loginLink) {
    profileLink.style.display = 'block';
    logoutLink.style.display = 'block';
    loginLink.style.display = 'none';
    sideAvatar.textContent = userInfo.full_name ? userInfo.full_name.charAt(0).toUpperCase() : userInfo.email.charAt(0).toUpperCase();
    sideUserName.textContent = userInfo.full_name || 'My Account';
  } else if (profileLink && logoutLink && loginLink) {
    profileLink.style.display = 'none';
    logoutLink.style.display = 'none';
    loginLink.style.display = 'block';
    sideAvatar.textContent = 'U';
    sideUserName.textContent = 'My Account';
  }
}

function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_USER_INFO) || 'null');
  } catch {
    return null;
  }
}

function getAuthToken() {
  return localStorage.getItem(LOCAL_AUTH_TOKEN) || '';
}

function getSessionId() {
  let id = localStorage.getItem('shopcorner_session_id');
  if (!id) {
    id = `sid_${Math.random().toString(36).slice(2)}_${Date.now()}`;
    localStorage.setItem('shopcorner_session_id', id);
  }
  return id;
}

function getAuthHeaders() {
  const token = getAuthToken();
  const headers = {
    'X-Requested-With': 'XMLHttpRequest',
    'X-Session-Id': getSessionId()
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

async function safeFetch(url, options = {}) {
  const defaultHeaders = getAuthHeaders();

  const response = await fetch(url, {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP ${response.status} ${response.statusText}: ${errorText}`);
  }
  return response.json();
}

function setupEventListeners() {
  const searchToggle = document.getElementById('search-toggle');
  const searchContainer = document.getElementById('search-container');
  const searchInput = document.getElementById('search-input');
  const searchResults = document.getElementById('search-results');
  const hamburger = document.getElementById('hamburger');

  if (searchToggle && searchContainer) {
    searchToggle.addEventListener('click', (event) => {
      event.stopPropagation();
      searchContainer.classList.toggle('active');
    });
  }

  document.addEventListener('click', (event) => {
    if (searchContainer && !searchContainer.contains(event.target)) {
      searchContainer.classList.remove('active');
    }
  });

  if (searchInput) {
    let timeout;
    searchInput.addEventListener('input', (event) => {
      clearTimeout(timeout);
      const query = event.target.value.trim();
      timeout = setTimeout(() => {
        loadProducts(query);
        if (query.length > 0) {
          safeFetch(`${API_BASE}products.js?search=${encodeURIComponent(query)}&limit=5`)
            .then(data => {
              if (data.success) {
                searchResults.innerHTML = data.products.length > 0 ? data.products.map(product => `<div class="search-item" data-id="${product.id}">${product.name}</div>`).join('') : '<div class="search-item">No results</div>';
              }
            });
        } else {
          searchResults.innerHTML = '';
        }
      }, 250);
    });

    searchResults.addEventListener('click', (event) => {
      const item = event.target.closest('.search-item');
      if (item && item.dataset.id) {
        showProductDetail(Number(item.dataset.id));
      }
    });
  }

  if (hamburger) {
    hamburger.addEventListener('click', (event) => {
      event.stopPropagation();
      toggleSidebar();
    });
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeCart();
      hideProductDetail();
      closeSidebar();
    }
  });
}

function toggleSidebar() {
  const sidebar = document.getElementById('side-menu');
  const overlay = document.getElementById('sidebar-overlay');
  if (!sidebar || !overlay) return;
  sidebar.classList.toggle('active');
  overlay.classList.toggle('active');
  document.body.style.overflow = sidebar.classList.contains('active') ? 'hidden' : 'auto';
}

function closeSidebar() {
  const sidebar = document.getElementById('side-menu');
  const overlay = document.getElementById('sidebar-overlay');
  if (!sidebar || !overlay) return;
  sidebar.classList.remove('active');
  overlay.classList.remove('active');
  document.body.style.overflow = 'auto';
}

async function loadProducts(search = '', limit = 20, offset = 0) {
  const productGrid = document.getElementById('product-grid');
  if (!productGrid) return;
  productGrid.innerHTML = '<div class="loading">Loading products...</div>';
  try {
    const url = `${API_BASE}products.js?limit=${limit}&offset=${offset}${search ? `&search=${encodeURIComponent(search)}` : ''}`;
    const data = await safeFetch(url);
    if (data.success) {
      productsData = data.products;
      renderProducts(data.products);
    } else {
      productGrid.innerHTML = `<div class="error">${data.message || 'Failed to load products.'}</div>`;
    }
  } catch (error) {
    console.error(error);
    productGrid.innerHTML = '<div class="error">Unable to load products.</div>';
  }
}

function renderProducts(products) {
  const productGrid = document.getElementById('product-grid');
  if (!productGrid) return;
  if (!products || products.length === 0) {
    productGrid.innerHTML = '<div class="no-products">No products found.</div>';
    return;
  }
  const html = products.map(product => {
    const image = product.image || 'https://picsum.photos/seed/default/300/400';
    const price = Number(product.price || 0).toFixed(2);
    const original = product.original_price ? Number(product.original_price).toFixed(2) : null;
    const badge = product.badge || '';
    const sold = product.sold ? `${product.sold}+ sold` : '0+ sold';
    const images = parseProductImages(product.image, product.images);
    return `
      <div class="product-card" data-id="${product.id}">
        <div class="product-image" data-product-id="${product.id}">
          <div class="image-carousel" id="carousel-${product.id}">
            ${images.map((img, index) => `<img src="${img}" alt="${escapeHtml(product.name)}" class="carousel-image ${index === 0 ? 'active' : ''}" data-index="${index}">`).join('')}
          </div>
          ${images.length > 1 ? `
          <button class="carousel-arrow carousel-prev" onclick="changeImage(${product.id}, -1)"><i class="fa-solid fa-chevron-left"></i></button>
          <button class="carousel-arrow carousel-next" onclick="changeImage(${product.id}, 1)"><i class="fa-solid fa-chevron-right"></i></button>
          <div class="carousel-dots">${images.map((_, index) => `<span class="carousel-dot ${index === 0 ? 'active' : ''}" onclick="goToImage(${product.id}, ${index})"></span>`).join('')}</div>
          ` : ''}
          ${badge ? `<span class="product-badge">${escapeHtml(badge)}</span>` : ''}
          <button class="add-to-cart-btn" title="Quick add to cart" onclick="showProductDetail(${product.id})"><i class="fa-solid fa-plus"></i></button>
        </div>
        <div class="product-info">
          <p class="title">${escapeHtml(product.name)}</p>
          ${badge ? `<p class="badge">${escapeHtml(badge)}</p>` : ''}
          <p class="price">RWF<span class="big-price">${price}</span>${original ? `<span class="original-price">RWF${original}</span>` : ''}<span class="sold">${sold}</span></p>
        </div>
      </div>`;
  }).join('');
  productGrid.innerHTML = html;
}

function parseProductImages(mainImage, imagesData) {
  let images = [];
  if (imagesData) {
    try {
      images = typeof imagesData === 'string' ? JSON.parse(imagesData) : imagesData;
      images = Array.isArray(images) ? images : [String(images)];
    } catch {
      images = [];
    }
  }
  if (mainImage && !images.includes(mainImage)) {
    images.unshift(mainImage);
  }
  return images.length ? images : [mainImage || 'https://picsum.photos/seed/default/300/400'];
}

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value || '';
  return div.innerHTML;
}

function changeImage(productId, direction) {
  const carousel = document.getElementById(`carousel-${productId}`);
  if (!carousel) return;
  const images = carousel.querySelectorAll('.carousel-image');
  let activeIndex = 0;
  images.forEach((img, idx) => { if (img.classList.contains('active')) activeIndex = idx; img.classList.remove('active'); });
  let nextIndex = activeIndex + direction;
  if (nextIndex >= images.length) nextIndex = 0;
  if (nextIndex < 0) nextIndex = images.length - 1;
  images[nextIndex].classList.add('active');
  updateCarouselDots(productId, nextIndex);
}

function goToImage(productId, index) {
  const carousel = document.getElementById(`carousel-${productId}`);
  if (!carousel) return;
  const images = carousel.querySelectorAll('.carousel-image');
  images.forEach((img, idx) => img.classList.toggle('active', idx === index));
  updateCarouselDots(productId, index);
}

function updateCarouselDots(productId, activeIndex) {
  const carousel = document.getElementById(`carousel-${productId}`);
  if (!carousel) return;
  const dots = carousel.parentElement.querySelectorAll('.carousel-dot');
  dots.forEach((dot, idx) => dot.classList.toggle('active', idx === activeIndex));
}

async function loadCartCount() {
  try {
    const data = await safeFetch(`${API_BASE}cart.js`);
    if (data.success) {
      updateCartCount(data.cart_count);
    }
  } catch (error) {
    console.warn('Cart count not available', error);
  }
}

function updateCartCount(count) {
  const cartCount = document.getElementById('cart-count');
  if (!cartCount) return;
  cartCount.textContent = count;
  cartCount.style.display = count > 0 ? 'flex' : 'none';
}

async function openCart() {
  const modal = document.getElementById('cart-modal');
  if (!modal) return;
  modal.style.display = 'flex';
  await loadCartItems();
}

function closeCart() {
  const modal = document.getElementById('cart-modal');
  if (!modal) return;
  modal.style.display = 'none';
}

async function loadCartItems() {
  const cartItems = document.getElementById('cart-items');
  if (!cartItems) return;
  try {
    const data = await safeFetch(`${API_BASE}cart.js`);
    if (data.success) {
      renderCartItems(data.cart_items, data.cart_total);
      updateCartCount(data.cart_count);
    }
  } catch (error) {
    console.error('Failed to load cart', error);
    cartItems.innerHTML = '<div class="error">Unable to load cart.</div>';
  }
}

function renderCartItems(items, total) {
  const container = document.getElementById('cart-items');
  const totalAmount = document.getElementById('cart-total-amount');
  if (!container || !totalAmount) return;
  if (!items || items.length === 0) {
    container.innerHTML = '<div class="empty-cart">Your cart is empty</div>';
    totalAmount.textContent = 'RWF 0';
    return;
  }
  container.innerHTML = items.map(item => `
    <div class="cart-item">
      <img src="${escapeHtml(item.image || 'https://picsum.photos/seed/cart/100/100')}" alt="${escapeHtml(item.name)}" class="cart-item-image">
      <div class="cart-item-details">
        <h4>${escapeHtml(item.name)}</h4>
        <p class="cart-item-price">RWF${Number(item.price).toFixed(2)}</p>
        <p class="cart-item-quantity">Qty: ${item.quantity}</p>
      </div>
      <button class="remove-from-cart" onclick="removeFromCart(${item.cart_id})" title="Remove"><i class="fa-solid fa-trash"></i></button>
    </div>`).join('');
  totalAmount.textContent = `RWF ${total}`;
}

async function removeFromCart(cartId) {
  try {
    const data = await safeFetch(`${API_BASE}cart.js`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'remove', cart_id: cartId })
    });
    if (data.success) {
      await loadCartItems();
      updateCartCount(data.cart_count);
      showNotification('Item removed from cart', 'success');
    } else {
      showNotification(data.message || 'Failed to remove item', 'error');
    }
  } catch (error) {
    console.error('Remove cart error', error);
    showNotification('Error removing item', 'error');
  }
}

async function handlePlaceOrder() {
  const btn = document.getElementById('place-order-btn');
  if (!btn) return;
  btn.disabled = true;
  btn.textContent = 'Processing...';
  try {
    const check = await safeFetch(`${API_BASE}auth.js`);
    if (!check.success || !check.isLoggedIn) {
      showNotification('You must login before placing an order.', 'error');
      window.location.href = 'login.html';
      return;
    }
    const data = await safeFetch(`${API_BASE}order.js`, { method: 'POST' });
    if (data.success) {
      closeCart();
      showNotification('Order placed successfully!', 'success');
      updateCartCount(0);
    } else {
      showNotification(data.message || 'Order failed', 'error');
    }
  } catch (error) {
    console.error(error);
    showNotification('Unable to place order', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Place Order';
  }
}

function showNotification(message, type = 'success') {
  const existing = document.querySelector('.notification');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `notification notification-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}

async function showProductDetail(productId) {
  const existingModal = document.getElementById('product-detail-modal');
  const modal = existingModal || document.createElement('div');
  modal.id = 'product-detail-modal';
  modal.className = 'product-detail-modal';
  modal.innerHTML = `<div class="product-detail-overlay"></div><div class="product-detail-content"><button class="detail-close-btn" onclick="hideProductDetail()"><i class="fa-solid fa-times"></i></button><div class="detail-loading">Loading...</div><div class="product-detail-container" id="product-detail-container"></div></div>`;
  if (!existingModal) document.body.appendChild(modal);
  modal.style.display = 'flex';

  modal.querySelector('.product-detail-overlay').addEventListener('click', hideProductDetail);

  try {
    const data = await safeFetch(`${API_BASE}products.js?id=${productId}`);
    if (data.success) {
      renderProductDetail(data.product);
    } else {
      modal.querySelector('.detail-loading').textContent = data.message || 'Unable to load product';
    }
  } catch (error) {
    console.error(error);
    modal.querySelector('.detail-loading').textContent = 'Connection error';
  }
}

function hideProductDetail() {
  const modal = document.getElementById('product-detail-modal');
  if (modal) {
    modal.style.display = 'none';
  }
}

function renderProductDetail(product) {
  const container = document.getElementById('product-detail-container');
  const loading = document.querySelector('.detail-loading');
  if (!container || !loading) return;
  loading.style.display = 'none';

  const images = parseProductImages(product.image, product.images);
  const price = Number(product.price || 0).toFixed(2);
  const original = product.original_price ? Number(product.original_price).toFixed(2) : null;

  container.innerHTML = `
    <div class="detail-image-section">
      <div class="detail-image-carousel" id="detail-carousel-${product.id}">
        ${images.map((img, index) => `<img src="${img}" alt="${escapeHtml(product.name)}" class="detail-carousel-image ${index === 0 ? 'active' : ''}">`).join('')}
      </div>
      ${images.length > 1 ? `<div class="detail-carousel-dots">${images.map((_, idx) => `<span class="detail-carousel-dot ${idx === 0 ? 'active' : ''}" onclick="goToDetailImage(${product.id}, ${idx})"></span>`).join('')}</div>` : ''}
    </div>
    <div class="detail-info-section">
      <h1 class="detail-title">${escapeHtml(product.name)}</h1>
      <div class="detail-price-section"><span class="detail-price">RWF${price}</span>${original ? `<span class="detail-original-price">RWF${original}</span>` : ''}</div>
      <div class="detail-description">${escapeHtml(product.description || 'No description available.')}</div>
      <div class="detail-meta"><span>${product.sold || 0}+ sold</span><span>${product.stock || 0} in stock</span></div>
      <div class="product-options">
        <div class="option-group"><span>Color:</span><div id="modal-colors" class="color-options"></div></div>
        <div class="option-group"><span>Size:</span><div id="modal-sizes" class="size-options"></div></div>
        <div class="option-group"><label>Quantity:</label><input id="modal-qty" type="number" min="1" value="1"></div>
      </div>
      <button class="detail-add-to-cart" onclick="addToCartFromModal(${product.id})"><i class="fa-solid fa-plus"></i> Add to Cart</button>
    </div>`;

  renderOptions('modal-colors', product.colors || '', 'color');
  renderOptions('modal-sizes', product.sizes || '', 'size');
}

function renderOptions(containerId, list, type) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  if (!list) return;
  const options = list.split(',').map(v => v.trim()).filter(Boolean);
  options.forEach((option, idx) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = `${type}-item${idx === 0 ? ' active' : ''}`;
    item.textContent = option;
    item.onclick = () => {
      document.querySelectorAll(`.${type}-item`).forEach(el => el.classList.remove('active'));
      item.classList.add('active');
    };
    container.appendChild(item);
  });
}

function changeDetailImage(productId, direction) {
  const carousel = document.getElementById(`detail-carousel-${productId}`);
  if (!carousel) return;
  const images = carousel.querySelectorAll('.detail-carousel-image');
  let active = 0;
  images.forEach((img, idx) => { if (img.classList.contains('active')) active = idx; img.classList.remove('active'); });
  let next = active + direction;
  if (next >= images.length) next = 0;
  if (next < 0) next = images.length - 1;
  images[next].classList.add('active');
  updateDetailDots(carousel, next);
}

function goToDetailImage(productId, index) {
  const carousel = document.getElementById(`detail-carousel-${productId}`);
  if (!carousel) return;
  const images = carousel.querySelectorAll('.detail-carousel-image');
  images.forEach((img, idx) => img.classList.toggle('active', idx === index));
  updateDetailDots(carousel, index);
}

function updateDetailDots(carousel, activeIndex) {
  const dots = carousel.parentElement.querySelectorAll('.detail-carousel-dot');
  dots.forEach((dot, idx) => dot.classList.toggle('active', idx === activeIndex));
}

async function addToCartFromModal(productId) {
  const selectedColor = document.querySelector('.color-item.active')?.textContent || '';
  const selectedSize = document.querySelector('.size-item.active')?.textContent || '';
  const quantity = Number(document.getElementById('modal-qty')?.value || 1);
  try {
    const data = await safeFetch(`${API_BASE}cart.js`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'add', product_id: productId, quantity, color: selectedColor, size: selectedSize })
    });
    if (data.success) {
      updateCartCount(data.cart_count || 0);
      showNotification('Added to cart', 'success');
      hideProductDetail();
    } else {
      showNotification(data.message || 'Unable to add to cart', 'error');
    }
  } catch (error) {
    console.error(error);
    showNotification('Error adding to cart', 'error');
  }
}

async function loadTrendProducts() {
  try {
    const data = await safeFetch(`${API_BASE}products.js?trend=1`);
    if (data.success) {
      trendProducts = data.products || [];
      renderSlides();
      startSlideshow();
    }
  } catch (error) {
    console.warn('Trend products error', error);
  }
}

function renderSlides() {
  const wrapper = document.getElementById('slideshow-wrapper');
  const dots = document.getElementById('slideshow-dots');
  if (!wrapper || !dots) return;
  wrapper.innerHTML = trendProducts.map(product => `
    <div class="slide">
      <img src="${escapeHtml(product.image || 'https://picsum.photos/seed/trend/1200/800')}" alt="${escapeHtml(product.name)}" class="slide-image">
      <div class="slide-overlay">
        <div class="slide-product-info">
          ${product.badge ? `<span class="slide-product-badge">${escapeHtml(product.badge)}</span>` : ''}
          <h3 class="slide-product-name">${escapeHtml(product.name)}</h3>
        </div>
        <span class="slide-product-price">RWF${Number(product.price).toFixed(2)}</span>
      </div>
    </div>`).join('');
  dots.innerHTML = trendProducts.map((_, idx) => `<button class="slide-dot ${idx === 0 ? 'active' : ''}" onclick="goToSlide(${idx})"></button>`).join('');
}

function startSlideshow() {
  if (slideInterval) clearInterval(slideInterval);
  slideInterval = setInterval(() => changeSlide(1), SLIDE_DURATION);
}

function changeSlide(direction) {
  if (!trendProducts.length) return;
  currentSlide = (currentSlide + direction + trendProducts.length) % trendProducts.length;
  const wrapper = document.getElementById('slideshow-wrapper');
  if (wrapper) wrapper.style.transform = `translateX(-${currentSlide * 100}%)`;
  const dots = document.querySelectorAll('.slide-dot');
  dots.forEach((dot, idx) => dot.classList.toggle('active', idx === currentSlide));
}

function goToSlide(index) {
  currentSlide = index;
  const wrapper = document.getElementById('slideshow-wrapper');
  if (wrapper) wrapper.style.transform = `translateX(-${currentSlide * 100}%)`;
  const dots = document.querySelectorAll('.slide-dot');
  dots.forEach((dot, idx) => dot.classList.toggle('active', idx === currentSlide));
  startSlideshow();
}

function startTimer() {
  let hours = 2, minutes = 13, seconds = 54;
  const timer = document.getElementById('timer');
  setInterval(() => {
    seconds -= 1;
    if (seconds < 0) { seconds = 59; minutes -= 1; }
    if (minutes < 0) { minutes = 59; hours -= 1; }
    if (hours < 0) { hours = 23; minutes = 59; seconds = 59; }
    if (timer) timer.textContent = `${hours.toString().padStart(2,'0')} : ${minutes.toString().padStart(2,'0')} : ${seconds.toString().padStart(2,'0')}`;
  }, 1000);
}

function handleScrollEffects() {
  window.addEventListener('scroll', () => {
    const header = document.getElementById('main-header');
    const deals = document.getElementById('deals-bar');
    const shipping = document.getElementById('shipping-notice');
    const showClass = window.scrollY > 10;
    if (header) header.classList.toggle('scrolled-bg', showClass);
    if (deals) deals.classList.toggle('scrolled-bg', showClass);
    if (shipping) shipping.classList.toggle('scrolled-bg', showClass);
    if (window.scrollY > 100) {
      document.getElementById('trend-slideshow')?.classList.remove('active');
    } else {
      document.getElementById('trend-slideshow')?.classList.add('active');
    }
  });
}

async function handleLogout() {
  localStorage.removeItem(LOCAL_AUTH_TOKEN);
  localStorage.removeItem(LOCAL_USER_INFO);
  renderHeader();
  showNotification('Logged out successfully', 'success');
  try {
    await safeFetch(`${API_BASE}auth.js`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'logout' }) });
  } catch {
    // ignore server logout errors
  }
  window.location.href = 'login.html';
}
