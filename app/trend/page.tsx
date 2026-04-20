"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { safeFetch, getStoredUser, normalizeProductImages, resolveProductImagePath } from "../../services/api";
import { Product, CartItem, User, Review } from "../../types";
import { supabase } from "../../lib/supabase";
import { useConfirm } from "../../components/ConfirmProvider";
import LoadingDots from "../../components/LoadingDots";

const PENDING_PRODUCT_KEY = 'shopcorner_pending_product';

export default function TrendPage() {
  const confirm = useConfirm();
  const router = useRouter();
  const [isMounted, setIsMounted] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);

  // Auth
  const [user, setUser] = useState<User | null>(null);

  // Data
  const [trendProducts, setTrendProducts] = useState<Product[]>([]);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [cartCount, setCartCount] = useState(0);
  const [cartTotal, setCartTotal] = useState(0);

  const [loadingProducts, setLoadingProducts] = useState(true);
  // Product Detail Modal State
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [relatedProducts, setRelatedProducts] = useState<Product[]>([]);
  const [productReviews, setProductReviews] = useState<Review[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [selectedColor, setSelectedColor] = useState('');
  const [selectedSize, setSelectedSize] = useState('');
  const [selectedQty, setSelectedQty] = useState('1');
  const [detailImageIndex, setDetailImageIndex] = useState(0);
  const [productImageIndices, setProductImageIndices] = useState<Record<number, number>>({});
  const productTouchStartX = useRef<number | null>(null);
  const detailTouchStartX = useRef<number | null>(null);

  // Review Form State
  const [newReviewText, setNewReviewText] = useState('');
  const [newReviewRating, setNewReviewRating] = useState(5);

  // Main Init
  useEffect(() => {
    setIsMounted(true);
    setUser(getStoredUser());

    loadInitialData();
  }, []);

  useEffect(() => {
    if (!isMounted) return;

    const shouldOpenCartAfterLogin = localStorage.getItem('shopcorner_open_cart_after_login') === '1';
    if (!shouldOpenCartAfterLogin || !user) return;

    setIsCartOpen(true);
    localStorage.removeItem('shopcorner_open_cart_after_login');
  }, [isMounted, user, cartItems.length]);

  useEffect(() => {
    const handleOpenCart = () => {
      setIsCartOpen(true);
    };

    window.addEventListener('openCart', handleOpenCart);
    return () => window.removeEventListener('openCart', handleOpenCart);
  }, []);

  useEffect(() => {
    if (!selectedProduct) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [selectedProduct]);

  useEffect(() => {
    if (loadingProducts) return;

    const openPendingProduct = async (product?: Product | null) => {
      const pendingProduct = product || (() => {
        if (typeof window === 'undefined') return null;

        const raw = sessionStorage.getItem(PENDING_PRODUCT_KEY);
        if (!raw) return null;

        try {
          return JSON.parse(raw) as Product;
        } catch {
          return null;
        }
      })();

      if (!pendingProduct?.id) return;

      if (typeof window !== 'undefined') {
        sessionStorage.removeItem(PENDING_PRODUCT_KEY);
      }

      await openProductDetail(pendingProduct);
    };

    void openPendingProduct();

    const handlePendingProduct = (event: Event) => {
      const customEvent = event as CustomEvent<Product>;
      void openPendingProduct(customEvent.detail);
    };

    window.addEventListener('shopcorner:pending-product', handlePendingProduct);

    return () => {
      window.removeEventListener('shopcorner:pending-product', handlePendingProduct);
    };
  }, [loadingProducts]);

  const loadInitialData = async () => {
    setLoadingProducts(true);
    try {
      // Intentionally using catch to prevent the whole app from crashing if APIs don't exist yet
      const [trendRes, cartRes] = await Promise.allSettled([
        safeFetch<{ success: boolean; products: Product[] }>('/api/products?trend=1'),
        safeFetch<{ success: boolean; cart_count: number; cart_items: CartItem[]; cart_total: number }>('/api/cart')
      ]);

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
        window.dispatchEvent(new CustomEvent('cartUpdated'));
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

  const setProductImageIndex = (productId: number, nextIndex: number) => {
    setProductImageIndices((prev) => ({ ...prev, [productId]: nextIndex }));
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
  const goToCart = () => {
    setIsCartOpen(true);
  };

  const openProductDetail = async (product: Product) => {
    setSelectedProduct(product);
    setDetailImageIndex(0);
    const colors = parseOptionList(product.colors);
    const sizes = parseOptionList(product.sizes);
    setSelectedColor(colors[0] || '');
    setSelectedSize(sizes[0] || '');
    setSelectedQty('1');
    setLoadingDetails(true);
    setRelatedProducts([]);
    setProductReviews([]);
    try {
      // Fetch related products
      const relatedRes = await safeFetch<{ success: boolean; products: Product[] }>(`/api/products?limit=4&category=${product.category || ''}`);
      if (relatedRes.success) {
        setRelatedProducts(relatedRes.products.filter((p: Product) => p.id !== product.id).slice(0, 4));
      }

      // Fetch reviews
      const reviewsRes = await safeFetch<{ success: boolean; reviews: Review[] }>(`/api/reviews?product_id=${product.id}`);
      if (reviewsRes.success) {
        setProductReviews(reviewsRes.reviews || []);
      }
    } catch (e) {
      console.warn('Error loading product details', e);
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

  const placeOrder = async () => {
    if (cartItems.length === 0) return;

    setPlacingOrder(true);
    try {
      const res = await safeFetch<{ success: boolean; order_id?: string; message?: string }>('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          items: cartItems,
        }),
      });

      if (res.success) {
        window.alert('Order placed successfully!');
        setCartItems([]);
        setCartCount(0);
        setCartTotal(0);
        setIsCartOpen(false);
        window.dispatchEvent(new CustomEvent('cartUpdated'));
      } else {
        window.alert(res.message || 'Failed to place order');
      }
    } catch (err: any) {
      window.alert(err?.message || 'Failed to place order');
    } finally {
      setPlacingOrder(false);
    }
  };

  const removeFromCart = async (cartId: number) => {
    try {
      const res = await safeFetch<{ success: boolean; message?: string }>('/api/cart', {
        method: 'DELETE',
        body: JSON.stringify({ cart_id: cartId }),
      });

      if (res.success) {
        await loadCartData();
      } else {
        window.alert(res.message || 'Failed to remove item');
      }
    } catch (e: any) {
      window.alert(e?.message || 'Failed to remove item');
    }
  };

  const renderProductCard = (product: Product, index: number) => {
    const productImages = normalizeProductImages(product);
    const activeImageIndex = productImages.length > 0 ? Math.min(productImageIndices[product.id] || 0, productImages.length - 1) : -1;

    const handleProductImageWheel = (e: React.WheelEvent<HTMLDivElement>) => {
      if (productImages.length <= 1) return;
      if (Math.abs(e.deltaX) < Math.abs(e.deltaY)) return;
      e.preventDefault();
      const nextIndex = e.deltaX > 0
        ? (activeImageIndex === productImages.length - 1 ? 0 : activeImageIndex + 1)
        : (activeImageIndex === 0 ? productImages.length - 1 : activeImageIndex - 1);
      setProductImageIndex(product.id, nextIndex);
    };

    const handleProductImageTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
      productTouchStartX.current = e.touches[0]?.clientX ?? null;
    };

    const handleProductImageTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
      if (productImages.length <= 1 || productTouchStartX.current === null) return;
      const deltaX = e.changedTouches[0]?.clientX - productTouchStartX.current;
      productTouchStartX.current = null;
      if (Math.abs(deltaX) < 40) return;
      const nextIndex = deltaX < 0
        ? (activeImageIndex === productImages.length - 1 ? 0 : activeImageIndex + 1)
        : (activeImageIndex === 0 ? productImages.length - 1 : activeImageIndex - 1);
      setProductImageIndex(product.id, nextIndex);
    };

    return (
      <div className={`product-card trend-first-card`} key={product.id} onClick={() => openProductDetail(product)} style={{ cursor: 'pointer', '--animation-delay': `${0.1 + index * 0.1}s` } as React.CSSProperties}>
        <div className="product-image">
          <div
            className="image-carousel"
            onWheel={handleProductImageWheel}
            onTouchStart={handleProductImageTouchStart}
            onTouchEnd={handleProductImageTouchEnd}
          >
            {productImages.map((image: string, imageIndex: number) => (
              <img
                key={`${product.id}-${imageIndex}`}
                src={image}
                alt={`${product.name} ${imageIndex + 1}`}
                className={`carousel-image ${activeImageIndex === imageIndex ? 'active' : ''}`}
              />
            ))}
          </div>
          {productImages.length > 1 && (
            <>
              <button
                type="button"
                className="carousel-arrow carousel-prev"
                aria-label="Previous product image"
                onClick={(e) => {
                  e.stopPropagation();
                  setProductImageIndex(product.id, activeImageIndex === 0 ? productImages.length - 1 : activeImageIndex - 1);
                }}
              >
                <i className="fa-solid fa-chevron-left"></i>
              </button>
              <button
                type="button"
                className="carousel-arrow carousel-next"
                aria-label="Next product image"
                onClick={(e) => {
                  e.stopPropagation();
                  setProductImageIndex(product.id, activeImageIndex === productImages.length - 1 ? 0 : activeImageIndex + 1);
                }}
              >
                <i className="fa-solid fa-chevron-right"></i>
              </button>
              <div className="carousel-dots">
                {productImages.map((_: string, imageIndex: number) => (
                  <button
                    key={`${product.id}-dot-${imageIndex}`}
                    type="button"
                    className={`carousel-dot ${activeImageIndex === imageIndex ? 'active' : ''}`}
                    aria-label={`View image ${imageIndex + 1}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setProductImageIndex(product.id, imageIndex);
                    }}
                  />
                ))}
              </div>
            </>
          )}
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
              });
            }}
          >
            <i className="fa-solid fa-cart-plus"></i>
          </button>
        </div>
        <div className="product-info">
          <div className="title">{product.name}</div>
          <div className="price">RWF{Number(product.price).toFixed(2)}</div>
          {product.original_price && <div className="original-price">RWF{Number(product.original_price).toFixed(2)}</div>}
          <div className="badge">{product.badge}</div>
        </div>
      </div>
    );
  };

  const detailImages = normalizeProductImages(selectedProduct);
  const activeDetailImageIndex = detailImages.length > 0 ? Math.min(detailImageIndex, detailImages.length - 1) : -1;

  return (
    <>
      <main className="product-grid" id="product-grid">
        <div className="page-header">
          <h1>Trending Products</h1>
          <p>Discover the most popular items in ShopCorner</p>
        </div>

        {loadingProducts ? (
          <div className="loading">
            <LoadingDots label="Loading" size="lg" />
          </div>
        ) : trendProducts.length > 0 ? (
          trendProducts.map((product: Product, index: number) => renderProductCard(product, index))
        ) : (
          <div className="no-products">
            <p>No trending products available at the moment.</p>
          </div>
        )}
      </main>

      {/* Cart Modal */}
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
                    {resolveProductImagePath(item.image) ? (
                      <img src={resolveProductImagePath(item.image)} alt={item.name} className="cart-item-image" />
                    ) : (
                      <div className="cart-item-image" />
                    )}
                    <div className="cart-item-details">
                      <h4>{item.name}</h4>
                      <p className="cart-item-price">RWF{Number(item.price).toFixed(2)}</p>
                      <p className="cart-item-quantity">Qty: {item.quantity}</p>
                      {item.color && <small>Color: {item.color}</small>}
                      {item.size && <small>Size: {item.size}</small>}
                    </div>
                    <button className="remove-from-cart" title="Remove" onClick={() => removeFromCart(item.cart_id)}>
                      <i className="fa-solid fa-trash"></i>
                    </button>
                  </div>
                )) : (
                  <div className="empty-cart">
                    <i className="fa-solid fa-shopping-cart"></i>
                    <p>Your cart is empty</p>
                  </div>
                )}
              </div>
            </div>
            {cartItems.length > 0 && (
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
                  {placingOrder ? <LoadingDots label="Placing Order" size="sm" /> : 'Place Order'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Product Detail Modal */}
      {selectedProduct && (
        <div id="product-detail-modal" className={`product-detail-modal ${selectedProduct ? 'show' : ''}`} style={{ display: 'flex' }}>
          <div className="product-detail-overlay" onClick={closeProductDetail}></div>
          <div className="product-detail-content">
            <div className="mobile-detail-nav">
              <button className="detail-back-btn" onClick={closeProductDetail}>
                <i className="fa-solid fa-arrow-left"></i> Back
              </button>
              <div className="header-icons" style={{ paddingRight: '5px' }}>
                <div className="cart-icon" onClick={openCart}>
                  <i className="fa-solid fa-bag-shopping"></i>
                  {cartCount > 0 && <span className="cart-count" style={{ top: '-4px', right: '-8px' }}>{cartCount}</span>}
                </div>
              </div>
            </div>

            <div className="detail-scrollable-body">
              <div className="product-detail-container">
                <div className="detail-image-section">
                  <div
                    className="detail-image-carousel"
                    onWheel={(e) => {
                      if (detailImages.length <= 1 || Math.abs(e.deltaX) < Math.abs(e.deltaY)) return;
                      e.preventDefault();
                      setDetailImageIndex((prev) =>
                        e.deltaX > 0
                          ? (prev === detailImages.length - 1 ? 0 : prev + 1)
                          : (prev === 0 ? detailImages.length - 1 : prev - 1)
                      );
                    }}
                    onTouchStart={(e) => {
                      detailTouchStartX.current = e.touches[0]?.clientX ?? null;
                    }}
                    onTouchEnd={(e) => {
                      if (detailTouchStartX.current === null) return;
                      const deltaX = e.changedTouches[0]?.clientX - detailTouchStartX.current;
                      detailTouchStartX.current = null;
                      if (Math.abs(deltaX) < 40) return;
                      setDetailImageIndex((prev) =>
                        deltaX < 0
                          ? (prev === detailImages.length - 1 ? 0 : prev + 1)
                          : (prev === 0 ? detailImages.length - 1 : prev - 1)
                      );
                    }}
                  >
                    {detailImages.map((image: string, imageIndex: number) => (
                      <img
                        key={`${selectedProduct.id}-${imageIndex}`}
                        src={image}
                        alt={`${selectedProduct.name} ${imageIndex + 1}`}
                        className={`detail-carousel-image ${activeDetailImageIndex === imageIndex ? 'active' : ''}`}
                      />
                    ))}
                    {detailImages.length > 1 && (
                      <>
                        <button
                          type="button"
                          className="carousel-arrow carousel-prev detail-carousel-arrow"
                          aria-label="Previous detail image"
                          onClick={() => setDetailImageIndex(activeDetailImageIndex === 0 ? detailImages.length - 1 : activeDetailImageIndex - 1)}
                        >
                          <i className="fa-solid fa-chevron-left"></i>
                        </button>
                        <button
                          type="button"
                          className="carousel-arrow carousel-next detail-carousel-arrow"
                          aria-label="Next detail image"
                          onClick={() => setDetailImageIndex(activeDetailImageIndex === detailImages.length - 1 ? 0 : activeDetailImageIndex + 1)}
                        >
                          <i className="fa-solid fa-chevron-right"></i>
                        </button>
                        <div className="detail-carousel-dots">
                          {detailImages.map((_: string, imageIndex: number) => (
                            <button
                              key={`${selectedProduct.id}-detail-dot-${imageIndex}`}
                              type="button"
                              className={`detail-carousel-dot ${activeDetailImageIndex === imageIndex ? 'active' : ''}`}
                              aria-label={`View image ${imageIndex + 1}`}
                              onClick={() => setDetailImageIndex(imageIndex)}
                            />
                          ))}
                        </div>
                      </>
                    )}
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
                      onChange={(e) => {
                        const nextValue = e.target.value;
                        if (nextValue === '') {
                          setSelectedQty('');
                          return;
                        }

                        const maxQty = Math.max(1, Number(selectedProduct.stock || 99));
                        const numericValue = Number(nextValue);
                        if (Number.isNaN(numericValue)) return;

                        setSelectedQty(String(Math.min(maxQty, Math.max(1, numericValue))));
                      }}
                      onBlur={() => {
                        const maxQty = Math.max(1, Number(selectedProduct.stock || 99));
                        const numericValue = Number(selectedQty);

                        if (!selectedQty || Number.isNaN(numericValue)) {
                          setSelectedQty('1');
                          return;
                        }

                        setSelectedQty(String(Math.min(maxQty, Math.max(1, numericValue))));
                      }}
                    />
                  </div>

                  <div className="detail-action-row">
                    <button
                      className="detail-add-to-cart"
                      onClick={() =>
                        confirmAddToCart(Number(selectedProduct.id), {
                          color: selectedColor || undefined,
                          size: selectedSize || undefined,
                          quantity: Math.max(1, Number(selectedQty || 1)),
                        })
                      }
                    >
                      <i className="fa-solid fa-cart-plus"></i> Add to Cart
                    </button>
                    <button
                      type="button"
                      className="detail-go-to-cart"
                      onClick={goToCart}
                    >
                      <i className="fa-solid fa-bag-shopping"></i> Go to Cart
                    </button>
                  </div>

                  <hr style={{ margin: '15px 0', borderTop: '1px solid #eee' }} />

                  <h3>Customer Reviews ({productReviews.length})</h3>
                  {loadingDetails ? (
                    <div className="detail-loading">
                      <LoadingDots label="Loading" />
                    </div>
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
                        {resolveProductImagePath(rp.image) ? (
                          <img src={resolveProductImagePath(rp.image)} alt={rp.name} />
                        ) : (
                          <div className="related-product-card-image" />
                        )}
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