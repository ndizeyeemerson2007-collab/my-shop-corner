"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { safeFetch, getStoredUser, handleLogoutLocal } from "../services/api";
import { Product, CartItem, User, Review } from "../types";
import { supabase } from "../lib/supabase";

export default function Home() {
  const [isMounted, setIsMounted] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);

  // Auth
  const [user, setUser] = useState<User | null>(null);

  // Timer
  const [hours, setHours] = useState(2);
  const [minutes, setMinutes] = useState(13);
  const [seconds, setSeconds] = useState(54);

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

    // Scroll Logic
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);

    // Check initial scroll
    handleScroll();

    // Timer Logic
    const timer = setInterval(() => {
      setSeconds((prev) => {
        if (prev === 0) {
          setMinutes((m) => {
            if (m === 0) {
              setHours((h) => (h === 0 ? 23 : h - 1));
              return 59;
            }
            return m - 1;
          });
          return 59;
        }
        return prev - 1;
      });
    }, 1000);

    loadInitialData();

    return () => {
      clearInterval(timer);
      window.removeEventListener('scroll', handleScroll);
    };
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

  const handleLogout = async () => {
    handleLogoutLocal();
    setUser(null);
    try {
      await safeFetch<{ success: boolean }>('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'logout' })
      });
    } catch (e) {
      console.warn("Server logout failed", e);
    }
  };

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);
  const openCart = () => setIsCartOpen(true);
  const closeCart = () => setIsCartOpen(false);

  const openProductDetail = async (product: Product) => {
    setSelectedProduct(product);
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

      <header className={`main-header ${isScrolled ? 'scrolled-bg' : ''}`} id="main-header">
        <div className="header-container">
          <div className="menu-icon" id="hamburger" onClick={toggleSidebar}>
            <i className="fa-solid fa-bars"></i>
          </div>
          <div className="logo">
            <h1>SHOP<span>CORNER</span></h1>
            <p>RWANDA</p>
          </div>
          <div className="header-icons">
            <div className={`search-container ${isSearchOpen ? 'active' : ''}`} id="search-container">
              <i className="fa-solid fa-magnifying-glass search-toggle" id="search-toggle" onClick={() => setIsSearchOpen(!isSearchOpen)}></i>
              <div className="search-dropdown">
                <input type="text" id="search-input" placeholder="Search products..." />
                <div id="search-results"></div>
              </div>
            </div>
            <Link href="/favorites" className="header-action">
              <i className="fa-regular fa-heart"></i>
            </Link>
            <div className="cart-icon" onClick={openCart}>
              <i className="fa-solid fa-bag-shopping"></i>
              {cartCount > 0 && <span id="cart-count" className="cart-count">{cartCount}</span>}
            </div>
          </div>
        </div>

        {isSidebarOpen && (
          <div id="sidebar-overlay" className="sidebar-overlay active" onClick={toggleSidebar}></div>
        )}

        <nav id="side-menu" className={`side-menu ${isSidebarOpen ? 'active' : ''}`}>
          <div className="side-menu-header">
            <div id="sidebar-user-section" className="user-profile-section">
              <div className="side-avatar" id="side-avatar">{user?.full_name?.charAt(0).toUpperCase() || user?.email?.charAt(0).toUpperCase() || 'U'}</div>
              <span className="user-name" id="side-user-name">{user?.full_name || 'My Account'}</span>
            </div>
            <button className="close-side" onClick={toggleSidebar}>
              <i className="fa-solid fa-xmark"></i>
            </button>
          </div>
          <div className="side-menu-body">
            <ul className="side-nav-list">
              <li><Link href="/">Home</Link></li>
              <li><a href="#">Trend</a></li>
              <li><Link href="/contact">Contact</Link></li>
              <li><Link href="/help">Help</Link></li>
              <li className="separator"></li>
              {user ? (
                <>
                  <li><Link href="/profile" id="profile-link">Profile</Link></li>
                  <li><a href="#" onClick={(e) => { e.preventDefault(); handleLogout(); }} className="logout-text" id="logout-link">Logout</a></li>
                </>
              ) : (
                <li><Link href="/login" id="login-link">Login</Link></li>
              )}
            </ul>
          </div>
        </nav>
      </header>

      <section className={`deals-bar ${isScrolled ? 'scrolled-bg' : ''}`} id="deals-bar">
        <div className="deals-content">
          <span className="deals-title">Super Deals</span>
          <div className="timer" id="timer">
            {hours.toString().padStart(2, '0')} : {minutes.toString().padStart(2, '0')} : {seconds.toString().padStart(2, '0')}
          </div>
          <a href="#" className="view-all">View All &gt;</a>
        </div>
      </section>

      <div className={`shipping-notice ${isScrolled ? 'scrolled-bg' : ''}`} id="shipping-notice">
        <i className="fa-solid fa-truck"></i> Free Shipping <span>Buy RWF20000 more to get</span>
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
                <button className="add-to-cart-btn" title="Quick add to cart" onClick={(e) => { e.stopPropagation(); /* Add to cart logic */ }}><i className="fa-solid fa-plus"></i></button>
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
                    <button className="remove-from-cart" title="Remove"><i className="fa-solid fa-trash"></i></button>
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
              <button id="place-order-btn" className="checkout-btn" disabled={cartItems.length === 0}>
                Place Order
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
                  <button className="detail-add-to-cart">
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
                  <div style={{ display: 'flex', gap: '15px', overflowX: 'auto', paddingBottom: '10px' }}>
                    {relatedProducts.map(rp => (
                      <div key={rp.id} onClick={() => openProductDetail(rp)} style={{ minWidth: '150px', cursor: 'pointer', border: '1px solid #eee', borderRadius: '8px', padding: '10px' }}>
                        <img src={rp.image || 'https://picsum.photos/seed/default/150/150'} alt={rp.name} style={{ width: '100%', height: '120px', objectFit: 'cover', borderRadius: '4px' }} />
                        <p style={{ fontSize: '12px', fontWeight: 'bold', marginTop: '8px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{rp.name}</p>
                        <p style={{ color: '#d66d67', fontSize: '12px', fontWeight: 'bold' }}>RWF{Number(rp.price).toFixed(2)}</p>
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
