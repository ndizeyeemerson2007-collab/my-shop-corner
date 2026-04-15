window.addEventListener('DOMContentLoaded', async () => {
  await loadFavorites();
});

async function loadFavorites() {
  const grid = document.getElementById('favorites-grid');
  if (!grid) return;
  try {
    const data = await safeFetch('/api/favorites.js');
    if (data.success && data.favorites.length) {
      grid.innerHTML = data.favorites.map(item => {
        const product = item.product || {};
        return `
          <div class="favorite-card">
            <img src="${escapeHtml(product.image || 'https://picsum.photos/seed/fav/300/300')}" alt="${escapeHtml(product.name)}">
            <div class="favorite-body">
              <h3>${escapeHtml(product.name)}</h3>
              <p>${escapeHtml(product.description || 'No description available.')}</p>
              <div class="favorite-actions">
                <span>RWF ${Number(product.price || 0).toFixed(2)}</span>
                <button type="button" onclick="removeFavorite(${product.id})">Remove</button>
              </div>
            </div>
          </div>`;
      }).join('');
    } else {
      grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:#888;">You have no favorites yet.</div>';
    }
  } catch (error) {
    console.error('Favorites failed', error);
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:#888;">Unable to load favorites.</div>';
  }
}

async function removeFavorite(productId) {
  try {
    const data = await safeFetch('/api/favorites.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_id: productId })
    });
    if (data.success) {
      showNotification('Favorite removed', 'success');
      loadFavorites();
    } else {
      showNotification(data.message || 'Unable to remove favorite', 'error');
    }
  } catch (error) {
    console.error(error);
    showNotification('Connection error', 'error');
  }
}
