"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { safeFetch, getStoredUser } from "../services/api";
import { Product, CartItem, User, Review } from "../types";
import { supabase } from "../lib/supabase";
import { useConfirm } from "../components/ConfirmProvider";

export default function Home() {
  const confirm = useConfirm();
  const [isMounted, setIsMounted] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);

  // Auth
  const [user, setUser] = useState<User | null>(null);

  // Data
  const [products, setProducts] = useState<Product[]>([]);
  const [trendProducts, setTrendProducts] = useState<Product[]>([]);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [cartCount, setCartCount] = useState(0);
  const [cartTotal, setCartTotal] = useState(0);

  const [loadingProducts, setLoadingProducts] = useState(true);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Product Detail Modal State
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [relatedProducts, setRelatedProducts] = useState<Product[]>([]);
  const [productReviews, setProductReviews] = useState<Review[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [selectedColor, setSelectedColor] = useState('');
  const [selectedSize, setSelectedSize] = useState('');
  const [selectedQty, setSelectedQty] = useState(1);

  // Review Form State
  const [newReviewText, setNewReviewText] = useState('');
  const [newReviewRating, setNewReviewRating] = useState(5);

  // Slide state (moved up to avoid Rules of Hooks violation before early return)
  const [currentSlide, setCurrentSlide] = useState(0);

  // Connection check
  useEffect(() => {
    const checkConnection = async () => {
      const { data, error } = await supabase.from('products').select('count');

      if (error) {
        console.error("Connection Failed:", error.message);
      } else {
        console.log("Connection Successful! Data found:", data);
      }
    };

    checkConnection();
  }, []);

  // Main Init
  useEffect(() => {
    setIsMounted(true);
    setUser(getStoredUser());

    loadInitialData();
  }, []);

  // Auto-slide effect for trending
  useEffect(() => {
    if (trendProducts.length <= 1) return;
    const slideTimer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % trendProducts.length);
    }, 3500); // changes every 3.5 seconds
    return () => clearInterval(slideTimer);
  }, [trendProducts.length]);

  const loadInitialData = async () => {
    setLoadingProducts(true);
    try {
      // Intentionally using catch to prevent the whole app from crashing if APIs don't exist yet
      const [prodRes, trendRes, cartRes] = await Promise.allSettled([
        safeFetch<{ success: boolean; products: Product[] }>('/api/products?limit=20'),
        safeFetch<{ success: boolean; products: Product[] }>('/api/products?trend=1'),
        safeFetch<{ success: boolean; cart_count: number; cart_items: CartItem[]; cart_total: number }>('/api/cart')
      ]);

      if (prodRes.status === 'fulfilled' && prodRes.value.success) {
        setProducts(prodRes.value.products || []);
      }
      if (trendRes.status === 'fulfilled' && trendRes.value.success) {
        setTrendProducts(trendRes.value.products || []);
      }
      if (cartRes.status === 'fulfilled' && cartRes.value.success) {
        setCartCount(cartRes.value.cart_count || 0);
        setCartItems(cartRes.value.cart_items || []);
        setCartTotal(cartRes.value.cart_total || 0);
      }
    } catch (e) {
      console.warn('Error loading initial data', e);
    } finally {
      setLoadingProducts(false);
    }
  };

  const loadCartData = async () => {
    try {
      const cartRes = await safeFetch<{ success: boolean; cart_count: number; cart_items: CartItem[]; cart_total: number }>('/api/cart');
      if (cartRes.success) {
        setCartCount(cartRes.cart_count || 0);
        setCartItems(cartRes.cart_items || []);
        setCartTotal(cartRes.cart_total || 0);
      }
    } catch (e) {
      console.warn('Error loading cart', e);
    }
  };

  const parseOptionList = (raw?: string | string[]) => {
    if (!raw) return [] as string[];
    if (Array.isArray(raw)) return raw.map((x) => String(x).trim()).filter(Boolean);
    return String(raw).split(',').map((x) => x.trim()).filter(Boolean);
  };

  const confirmAddToCart = async (productId: number, options?: { color?: string; size?: string; quantity?: number }) => {
    const confirmed = await confirm({
      title: 'Add To Cart',
      message: 'Add this item to cart?',
      confirmText: 'Yes',
      cancelText: 'No',
      iconClass: 'fa-solid fa-cart-plus',
    });
    if (!confirmed) return;

    try {
      const res = await safeFetch<{ success: boolean; cart_count?: number; message?: string }>('/api/cart', {
        method: 'POST',
        body: JSON.stringify({
          action: 'add',
          product_id: productId,
          quantity: options?.quantity || 1,
          color: options?.color || null,
          size: options?.size || null,
        }),
      });

      if (res.success) {
        setCartCount(res.cart_count || 0);
        await loadCartData();
      } else {
        window.alert(res.message || 'Unable to add item to cart.');
      }
    } catch (e: any) {
      window.alert(e?.message || 'Error adding item to cart.');
    }
  };

  const openCart = () => setIsCartOpen(true);
  const closeCart = () => setIsCartOpen(false);

  const openProductDetail = async (product: Product) => {
    setSelectedProduct(product);
    const colors = parseOptionList(product.colors);
    const sizes = parseOptionList(product.sizes);
    setSelectedColor(colors[0] || '');
    setSelectedSize(sizes[0] || '');
    setSelectedQty(1);
    setLoadingDetails(true);
    setRelatedProducts([]);
    setProductReviews([]);
    try {
      // Fetch related products
      const relatedRes = await safeFetch<{ success: boolean; products: Product[] }>(`/api/products?limit=4&category=${product.category || ''}`);
      if (relatedRes.success) {
        setRelatedProducts(relatedRes.products.filter(p => p.id !== product.id).slice(0, 4));
      }

      // Fetch reviews
      const reviewsRes = await safeFetch<{ success: boolean; reviews: Review[] }>(`/api/reviews?product_id=${product.id}`);
      if (reviewsRes.success) {
        setProductReviews(reviewsRes.reviews);
      }
    } catch (e) {
      console.warn("Failed loading product details", e);
    } finally {
      setLoadingDetails(false);
    }
  };

  const closeProductDetail = () => setSelectedProduct(null);

  const removeFromCart = async (cartId: number) => {
    const confirmed = await confirm({
      title: 'Remove Item',
      message: 'Remove this item from cart?',
      confirmText: 'Yes',
      cancelText: 'No',
      iconClass: 'fa-solid fa-trash',
    });
    if (!confirmed) return;

    try {
      await safeFetch('/api/cart', {
        method: 'POST',
        body: JSON.stringify({ action: 'remove', cart_id: cartId }),
      });
      await loadCartData();
    } catch (err: any) {
      window.alert(err?.message || 'Could not remove item from cart');
    }
  };

  const placeOrder = async () => {
    if (cartItems.length === 0) return;
    const confirmed = await confirm({
      title: 'Place Order',
      message: 'Are you sure you want to place this order?',
      confirmText: 'Place',
      cancelText: 'Cancel',
      iconClass: 'fa-solid fa-receipt',
    });
    if (!confirmed) return;

    setPlacingOrder(true);
    try {
      const result = await safeFetch<{ success: boolean; message?: string }>('/api/orders', {
        method: 'POST',
      });
      if (!result.success) {
        window.alert(result.message || 'Could not place order');
        return;
      }
      await loadCartData();
      setIsCartOpen(false);
      window.alert('Order placed successfully.');
    } catch (err: any) {
      window.alert(err?.message || 'Failed to place order');
    } finally {
      setPlacingOrder(false);
    }
  };

  const submitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct || !newReviewText) return;
    try {
      const res = await safeFetch<{ success: boolean; review: Review }>('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: selectedProduct.id,
          user_name: user ? (user.full_name || user.email) : 'Guest User',
          rating: newReviewRating,
          comment: newReviewText
        })
      });
      if (res.success && res.review) {
        setProductReviews([res.review, ...productReviews]);
        setNewReviewText('');
        setNewReviewRating(5);
      }
    } catch (err) {
      console.error("Failed to submit review", err);
    }
  };

  // Avoid hydration mismatch by waiting for mount
  if (!isMounted) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="loading">Initializing ShopCorner...</div>
      </div>
    );
  }

  return (
    <>
      <div id="trend-slideshow" className="trend-slideshow active">
        <div className="slideshow-container" style={{ overflow: 'hidden' }}>
          <div
            className="slideshow-wrapper"
            id="slideshow-wrapper"
            style={{
              transform: `translateX(-${currentSlide * 100}%)`,
              display: 'flex',
              transition: 'transform 0.5s ease-in-out'
            }}
          >
            {trendProducts.length > 0 ? trendProducts.map((p, idx) => (
              <div className="slide" key={p.id} style={{ minWidth: '100%', flexShrink: 0 }}>
                <img src={p.image || 'https://picsum.photos/seed/trend/1200/800'} alt={p.name} className="slide-image" />
                <div className="slide-overlay">
                  <div className="slide-product-info">
                    {p.badge && <span className="slide-product-badge">{p.badge}</span>}
                    <h3 className="slide-product-name">{p.name}</h3>
                  </div>
                  <span className="slide-product-price">RWF{Number(p.price).toFixed(2)}</span>
                </div>
              </div>
            )) : (
              <div className="slide" style={{ minWidth: '100%' }}><div className="loading" style={{ color: 'white', marginTop: '100px' }}>Loading trends...</div></div>
            )}
          </div>
          <div className="slideshow-nav" id="slideshow-dots">
            {trendProducts.map((_, idx) => (
              <span
                key={idx}
                className={`dot ${currentSlide === idx ? 'active' : ''}`}
                onClick={() => setCurrentSlide(idx)}
                style={{
                  height: '10px',
                  width: '10px',
                  margin: '0 5px',
                  backgroundColor: currentSlide === idx ? '#ff4757' : '#bbb',
                  borderRadius: '50%',
                  display: 'inline-block',
                  cursor: 'pointer',
                  transition: 'background-color 0.3s ease'
                }}
              ></span>
            ))}
          </div>
        </div>
      </div>

      <main className="product-grid slideshow-visible" id="product-grid">
        {loadingProducts ? (
          <div className="loading">Loading products...</div>
        ) : products.length > 0 ? (
          products.map(product => (
            <div className="product-card" key={product.id} onClick={() => openProductDetail(product)} style={{ cursor: 'pointer' }}>
              <div className="product-image">
                <img src={product.image || 'https://picsum.photos/seed/default/300/400'} alt={product.name} className="carousel-image active" />
                {product.badge && <span className="product-badge">{product.badge}</span>}
                <button
                  className="add-to-cart-btn"
                  title="Quick add to cart"
                  onClick={(e) => {
                    e.stopPropagation();
                    const colors = parseOptionList(product.colors);
                    const sizes = parseOptionList(product.sizes);
                    confirmAddToCart(Number(product.id), {
                      color: colors[0],
                      size: sizes[0],
                      quantity: 1,
                    });
                  }}
                >
                  <i className="fa-solid fa-plus"></i>
                </button>
              </div>
              <div className="product-info">
                <p className="title">{product.name}</p>
                {product.badge && <p className="badge">{product.badge}</p>}
                <p className="price">
                  RWF<span className="big-price">{Number(product.price).toFixed(2)}</span>
                  {product.original_price && <span className="original-price">RWF{Number(product.original_price).toFixed(2)}</span>}
                  <span className="sold">{product.sold || 0}+ sold</span>
                </p>
              </div>
            </div>
          ))
        ) : (
          <div className="no-products">No products found.</div>
        )}
      </main>

      {isCartOpen && (
        <div id="cart-modal" className="cart-modal" style={{ display: 'flex' }}>
          <div className="cart-modal-content">
            <div className="cart-modal-header">
              <h2>Shopping Cart</h2>
              <button className="close-cart" onClick={closeCart}>
                <i className="fa-solid fa-times"></i>
              </button>
            </div>
            <div className="cart-modal-body">
              <div id="cart-items">
                {cartItems.length > 0 ? cartItems.map(item => (
                  <div className="cart-item" key={item.cart_id}>
                    <img src={item.image || 'https://picsum.photos/seed/cart/100/100'} alt={item.name} className="cart-item-image" />
                    <div className="cart-item-details">
                      <h4>{item.name}</h4>
                      <p className="cart-item-price">RWF{Number(item.price).toFixed(2)}</p>
                      <p className="cart-item-quantity">Qty: {item.quantity}</p>
                    </div>
                    <button className="remove-from-cart" title="Remove" onClick={() => removeFromCart(item.cart_id)}>
                      <i className="fa-solid fa-trash"></i>
                    </button>
                  </div>
                )) : (
                  <div className="empty-cart">Your cart is empty</div>
                )}
              </div>
            </div>
            <div className="cart-modal-footer">
              <div className="cart-total-display">
                Total: <span id="cart-total-amount">RWF {cartTotal}</span>
              </div>
              <button
                id="place-order-btn"
                className="checkout-btn"
                disabled={cartItems.length === 0 || placingOrder}
                onClick={placeOrder}
              >
                {placingOrder ? 'Placing...' : 'Place Order'}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedProduct && (
        <div id="product-detail-modal" className={`product-detail-modal ${selectedProduct ? 'show' : ''}`} style={{ display: 'flex' }}>
          <div className="product-detail-overlay" onClick={closeProductDetail}></div>
          <div className="product-detail-content">
            <div className="mobile-detail-nav">
              <button className="detail-back-btn" onClick={closeProductDetail}>
                <i className="fa-solid fa-arrow-left"></i> Home
              </button>
              <div className="header-icons" style={{ paddingRight: '5px' }}>
                <i className="fa-regular fa-heart"></i>
                <div className="cart-icon" onClick={openCart}>
                  <i className="fa-solid fa-bag-shopping"></i>
                  {cartCount > 0 && <span className="cart-count" style={{ top: '-4px', right: '-8px' }}>{cartCount}</span>}
                </div>
              </div>
            </div>

            <div className="detail-scrollable-body">
              <div className="product-detail-container">
                <div className="detail-image-section">
                  <div className="detail-image-carousel">
                    <img src={selectedProduct.image || 'https://picsum.photos/seed/default/300/400'} alt={selectedProduct.name} className="detail-carousel-image active" />
                  </div>
                </div>
                <div className="detail-info-section">
                  <h2 className="detail-title">{selectedProduct.name}</h2>
                  <div className="detail-price-section">
                    <span className="detail-price">RWF{Number(selectedProduct.price).toFixed(2)}</span>
                    {selectedProduct.original_price && <span className="detail-original-price">RWF{Number(selectedProduct.original_price).toFixed(2)}</span>}
                  </div>
                  <p className="detail-description">{selectedProduct.description || "No description available for this product."}</p>
                  <div className="detail-meta">
                    {selectedProduct.category && <span>Category: {selectedProduct.category}</span>}
                    <span>Sold: {selectedProduct.sold || 0}+</span>
                  </div>

                  {parseOptionList(selectedProduct.colors).length > 0 && (
                    <div className="option-group">
                      <span>Color</span>
                      <div className="color-options">
                        {parseOptionList(selectedProduct.colors).map((color) => (
                          <button
                            key={color}
                            type="button"
                            className={`color-item ${selectedColor === color ? 'active' : ''}`}
                            onClick={() => setSelectedColor(color)}
                          >
                            {color}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {parseOptionList(selectedProduct.sizes).length > 0 && (
                    <div className="option-group">
                      <span>Size</span>
                      <div className="size-options">
                        {parseOptionList(selectedProduct.sizes).map((size) => (
                          <button
                            key={size}
                            type="button"
                            className={`size-item ${selectedSize === size ? 'active' : ''}`}
                            onClick={() => setSelectedSize(size)}
                          >
                            {size}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="option-group">
                    <span>Quantity</span>
                    <input
                      className="qty-input"
                      type="number"
                      min={1}
                      max={Math.max(1, Number(selectedProduct.stock || 99))}
                      value={selectedQty}
                      onChange={(e) => setSelectedQty(Math.max(1, Number(e.target.value || 1)))}
                    />
                  </div>

                  <button
                    className="detail-add-to-cart"
                    onClick={() =>
                      confirmAddToCart(Number(selectedProduct.id), {
                        color: selectedColor || undefined,
                        size: selectedSize || undefined,
                        quantity: selectedQty || 1,
                      })
                    }
                  >
                    <i className="fa-solid fa-cart-plus"></i> Add to Cart
                  </button>

                  <hr style={{ margin: '15px 0', borderTop: '1px solid #eee' }} />

                  <h3>Customer Reviews ({productReviews.length})</h3>
                  {loadingDetails ? (
                    <div className="detail-loading">Loading reviews...</div>
                  ) : (
                    <div className="reviews-list" style={{ maxHeight: '200px', overflowY: 'auto', marginBottom: '15px' }}>
                      {productReviews.length > 0 ? productReviews.map((rev) => (
                        <div key={rev.id} style={{ marginBottom: '10px', padding: '10px', background: '#f9f9f9', borderRadius: '8px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <strong>{rev.user_name}</strong>
                            <span style={{ color: '#f39c12' }}>{'★'.repeat(rev.rating)}{'☆'.repeat(5 - rev.rating)}</span>
                          </div>
                          <p style={{ margin: '5px 0', fontSize: '14px', color: '#555' }}>{rev.comment}</p>
                        </div>
                      )) : (
                        <p style={{ color: '#888', fontSize: '14px' }}>No reviews yet. Be the first!</p>
                      )}
                    </div>
                  )}

                  <form onSubmit={submitReview} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <label style={{ fontSize: '14px', fontWeight: 'bold' }}>Rating: </label>
                      <select value={newReviewRating} onChange={e => setNewReviewRating(Number(e.target.value))} style={{ padding: '5px' }}>
                        <option value="5">5 Stars</option>
                        <option value="4">4 Stars</option>
                        <option value="3">3 Stars</option>
                        <option value="2">2 Stars</option>
                        <option value="1">1 Star</option>
                      </select>
                    </div>
                    <textarea
                      value={newReviewText}
                      onChange={e => setNewReviewText(e.target.value)}
                      placeholder="Write your review..."
                      style={{ padding: '10px', borderRadius: '8px', border: '1px solid #ddd', minHeight: '60px' }}
                      required
                    ></textarea>
                    <button type="submit" style={{ padding: '8px 15px', background: '#333', color: '#fff', borderRadius: '8px', border: 'none', cursor: 'pointer', alignSelf: 'flex-start' }}>Submit Review</button>
                  </form>
                </div>
              </div>
              {relatedProducts.length > 0 && (
                <div style={{ marginTop: '20px', borderTop: '1px solid #eee', paddingTop: '20px' }}>
                  <h3 style={{ marginBottom: '15px' }}>You Might Also Like</h3>
                  <div className="related-products-grid">
                    {relatedProducts.map(rp => (
                      <div key={rp.id} onClick={() => openProductDetail(rp)} className="related-product-card">
                        <img src={rp.image || 'https://picsum.photos/seed/default/150/150'} alt={rp.name} />
                        <p>{rp.name}</p>
                        <strong>RWF{Number(rp.price).toFixed(2)}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
