"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { safeFetch, getStoredUser, normalizeProductImages, resolveProductImagePath } from "../services/api";
import { Product, CartItem, User, Review } from "../types";
import { supabase } from "../lib/supabase";
import { useConfirm } from "../components/ConfirmProvider";
import LoadingDots from "../components/LoadingDots";
import { useCheckoutLocation } from "../hooks/useCheckoutLocation";
import { BUSINESS_HQ, calculateDeliveryQuote } from "../lib/delivery";

const PENDING_PRODUCT_KEY = 'shopcorner_pending_product';
const TRACK_ORDER_CTA_KEY = 'shopcorner_show_track_order_cta';

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong.';
}

export default function Home() {
  const confirm = useConfirm();
  const router = useRouter();
  const [isMounted, setIsMounted] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [showTrackOrderCta, setShowTrackOrderCta] = useState(false);

  // Auth
  const [user, setUser] = useState<User | null>(null);

  // Data
  const [products, setProducts] = useState<Product[]>([]);
  const [trendProducts, setTrendProducts] = useState<Product[]>([]);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [cartCount, setCartCount] = useState(0);
  const [cartTotal, setCartTotal] = useState(0);
  const [followedSellerIds, setFollowedSellerIds] = useState<string[]>([]);

  const [loadingProducts, setLoadingProducts] = useState(true);
  // Product Detail Modal State
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [relatedProducts, setRelatedProducts] = useState<Product[]>([]);
  const [productReviews, setProductReviews] = useState<Review[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [manualDeliveryLocation, setManualDeliveryLocation] = useState('');
  const [showManualDeliveryInput, setShowManualDeliveryInput] = useState(false);
  const [locationPanelOpen, setLocationPanelOpen] = useState(false);
  const [selectedColor, setSelectedColor] = useState('');
  const [selectedSize, setSelectedSize] = useState('');
  const [selectedQty, setSelectedQty] = useState('1');
  const [upVotes, setUpVotes] = useState(0);
  const [downVotes, setDownVotes] = useState(0);
  const [userVote, setUserVote] = useState(0);
  const [detailImageIndex, setDetailImageIndex] = useState(0);
  const [productImageIndices, setProductImageIndices] = useState<Record<number, number>>({});
  const productTouchStartX = useRef<number | null>(null);
  const detailTouchStartX = useRef<number | null>(null);

  // Review Form State
  const [newReviewText, setNewReviewText] = useState('');
  const [newReviewRating, setNewReviewRating] = useState(5);
  const { currentLocation, hasLocation, locationError, requestCurrentLocation, requestingLocation } = useCheckoutLocation();
  const deliveryQuote = currentLocation ? calculateDeliveryQuote(currentLocation.latitude, currentLocation.longitude) : null;
  const numericCartTotal = Number(cartTotal || 0);
  const orderGrandTotal = numericCartTotal + Number(deliveryQuote?.deliveryFee || 0);
  const manualDeliveryLocationValue = manualDeliveryLocation.trim();
  const sellerReviewCount = productReviews.length;
  const sellerAverageRating = sellerReviewCount > 0
    ? productReviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / sellerReviewCount
    : 0;
  const locationSummary = hasLocation
    ? currentLocation?.label || 'Live location added'
    : manualDeliveryLocationValue || 'Add location';

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

  useEffect(() => {
    if (!user) {
      setFollowedSellerIds([]);
      return;
    }

    const loadFollowedSellers = async () => {
      try {
        const result = await safeFetch<{ success: boolean; followed_seller_ids?: string[] }>('/api/follows');
        if (result.success) {
          setFollowedSellerIds(result.followed_seller_ids || []);
        }
      } catch {
        setFollowedSellerIds([]);
      }
    };

    void loadFollowedSellers();
  }, [user]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('geolocation' in navigator) || !('permissions' in navigator)) return;
    if (currentLocation || requestingLocation) return;

    let cancelled = false;

    const preloadLocation = async () => {
      try {
        const permissionStatus = await navigator.permissions.query({ name: 'geolocation' });
        if (cancelled || permissionStatus.state !== 'granted') return;
        await requestCurrentLocation();
      } catch {
        // Ignore permission API failures and keep manual location flow available.
      }
    };

    void preloadLocation();

    return () => {
      cancelled = true;
    };
  }, [currentLocation, requestCurrentLocation, requestingLocation]);

  useEffect(() => {
    if (!isMounted) return;

    const shouldOpenCartAfterLogin = localStorage.getItem('shopcorner_open_cart_after_login') === '1';
    if (!shouldOpenCartAfterLogin || !user) return;

    setIsCartOpen(true);
    localStorage.removeItem('shopcorner_open_cart_after_login');
  }, [isMounted, user, cartItems.length]);

  useEffect(() => {
    if (!isMounted || typeof window === 'undefined') return;

    const shouldShowTrackOrderCta = Boolean(user) && localStorage.getItem(TRACK_ORDER_CTA_KEY) === '1';
    setShowTrackOrderCta(shouldShowTrackOrderCta);
  }, [isMounted, user]);

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
    if (selectedProduct) {
      fetchVotes();
    } else {
      setUpVotes(0);
      setDownVotes(0);
      setUserVote(0);
    }
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
        setCartTotal(Number(cartRes.value.cart_total || 0));
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
        setCartTotal(Number(cartRes.cart_total || 0));
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
    } catch (e: unknown) {
      window.alert(getErrorMessage(e) || 'Error adding item to cart.');
    }
  };

  const openCart = () => setIsCartOpen(true);
  const closeCart = () => setIsCartOpen(false);
  const goToCart = () => {
    setIsCartOpen(true);
  };

  const handleTrackOrderClick = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(TRACK_ORDER_CTA_KEY);
    }
    setShowTrackOrderCta(false);
    router.push('/profile?tab=orders');
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

    // Increment view count
    try {
      await safeFetch(`/api/products/${product.id}/views`, {
        method: 'POST',
      });
    } catch (error) {
      console.warn('Failed to increment view count', error);
    }

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

  const fetchVotes = async () => {
    if (!selectedProduct) return;
    try {
      const result = await safeFetch<{ upVotes: number; downVotes: number; userVote: number }>(`/api/products/${selectedProduct.id}/vote`);
      if (result) {
        setUpVotes(result.upVotes);
        setDownVotes(result.downVotes);
        setUserVote(result.userVote);
      }
    } catch (error) {
      console.error('Failed to fetch votes:', error);
    }
  };

  const handleVote = async (vote: 1 | -1) => {
    if (!selectedProduct) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      alert('Please log in to vote');
      return;
    }

    try {
      const result = await safeFetch<{ upVotes: number; downVotes: number; userVote: number }>(`/api/products/${selectedProduct.id}/vote`, {
        method: 'POST',
        body: JSON.stringify({ vote }),
      });
      if (result) {
        setUpVotes(result.upVotes);
        setDownVotes(result.downVotes);
        setUserVote(result.userVote);
      } else {
        alert('Please log in to vote');
      }
    } catch (error) {
      console.error('Failed to vote:', error);
      alert('Failed to vote');
    }
  };

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
    } catch (err: unknown) {
      window.alert(getErrorMessage(err) || 'Could not remove item from cart');
    }
  };

  const handleRequestDeliveryLocation = async () => {
    const location = await requestCurrentLocation();

    if (location) {
      setShowManualDeliveryInput(false);
      setLocationPanelOpen(false);
      return location;
    }

    setShowManualDeliveryInput(true);
    setLocationPanelOpen(true);
    return null;
  };

  const placeOrder = async () => {
    if (cartItems.length === 0) return;

    if (!user) {
      const shouldLogin = await confirm({
        title: 'Login Required',
        message: 'You need to log in before placing an order. Go to login now?',
        confirmText: 'Login',
        cancelText: 'Not now',
        iconClass: 'fa-solid fa-user-lock',
      });

      if (shouldLogin) {
        localStorage.setItem('shopcorner_open_cart_after_login', '1');
        router.push('/login');
      }
      return;
    }

    const liveDeliveryLocation = currentLocation || await handleRequestDeliveryLocation();
    const typedDeliveryLocation = manualDeliveryLocationValue
      ? {
          label: manualDeliveryLocationValue,
          capturedAt: new Date().toISOString(),
        }
      : null;
    const deliveryLocation = liveDeliveryLocation || typedDeliveryLocation;

    if (!deliveryLocation) {
      window.alert('Share your live location, or type the actual place where you want the order delivered.');
      return;
    }

    const confirmedQuote = liveDeliveryLocation
      ? calculateDeliveryQuote(liveDeliveryLocation.latitude, liveDeliveryLocation.longitude)
      : null;
    const confirmed = await confirm({
      title: 'Place Order',
      message: liveDeliveryLocation
        ? `Are you sure you want to place this order?\n\nDelivery location:\n${deliveryLocation.label}\n\nDistance from ${BUSINESS_HQ.district}: ${confirmedQuote?.distanceKm.toFixed(2)} km\nDelivery fee: RWF ${confirmedQuote?.deliveryFee.toLocaleString()}`
        : `Are you sure you want to place this order?\n\nDelivery location:\n${deliveryLocation.label}\n\nLive GPS was unavailable, so your typed delivery location will be sent to the shop for manual delivery follow-up.`,
      confirmText: 'Place',
      cancelText: 'Cancel',
      iconClass: 'fa-solid fa-receipt',
    });
    if (!confirmed) return;

    setPlacingOrder(true);
    try {
      const result = await safeFetch<{ success: boolean; message?: string }>('/api/orders', {
        method: 'POST',
        body: JSON.stringify({ delivery_location: deliveryLocation }),
      });
      if (!result.success) {
        window.alert(result.message || 'Could not place order');
        return;
      }
      await loadCartData();
      setManualDeliveryLocation('');
      setShowManualDeliveryInput(false);
      setLocationPanelOpen(false);
      setIsCartOpen(false);
      if (typeof window !== 'undefined') {
        localStorage.setItem(TRACK_ORDER_CTA_KEY, '1');
      }
      setShowTrackOrderCta(true);
      await confirm({
        title: 'Order Placed',
        message: 'Your order was placed successfully. You can track or manage it from your profile.',
        confirmText: 'OK',
        iconClass: 'fa-solid fa-circle-check',
        hideCancel: true,
      });
    } catch (err: unknown) {
      window.alert(getErrorMessage(err) || 'Failed to place order');
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

  const handleToggleFollowSeller = async (sellerId?: string | null) => {
    const normalizedSellerId = String(sellerId || '').trim();
    if (!normalizedSellerId) return;

    if (!user) {
      const shouldLogin = await confirm({
        title: 'Login Required',
        message: 'Login to follow this seller?',
        confirmText: 'Login',
        cancelText: 'No',
        iconClass: 'fa-solid fa-user-lock',
      });

      if (shouldLogin) {
        router.push('/login');
      }
      return;
    }

    const isFollowing = followedSellerIds.includes(normalizedSellerId);

    try {
      const result = await safeFetch<{ success: boolean; message?: string }>('/api/follows', {
        method: isFollowing ? 'DELETE' : 'POST',
        body: JSON.stringify({ seller_id: normalizedSellerId }),
      });

      if (!result.success) {
        window.alert(result.message || 'Could not update seller follow.');
        return;
      }

      setFollowedSellerIds((current) =>
        isFollowing
          ? current.filter((id) => id !== normalizedSellerId)
          : [...current, normalizedSellerId],
      );
    } catch (error: unknown) {
      window.alert(getErrorMessage(error));
    }
  };

  const renderProductCard = (product: Product) => {
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
      <div className="product-card" key={product.id} onClick={() => openProductDetail(product)} style={{ cursor: 'pointer' }}>
        <div className="product-image">
          <div
            className="image-carousel"
            onWheel={handleProductImageWheel}
            onTouchStart={handleProductImageTouchStart}
            onTouchEnd={handleProductImageTouchEnd}
          >
            {productImages.map((image, imageIndex) => (
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
                {productImages.map((_, imageIndex) => (
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
                quantity: 1,
              });
            }}
          >
            <i className="fa-solid fa-plus"></i>
          </button>
        </div>
        <div className="product-info">
          <p className="title">{product.name}</p>
          {product.seller_business_name ? <p className="seller-label">By {product.seller_business_name}</p> : null}
          {product.badge && <p className="badge">{product.badge}</p>}
          <div className="product-footer">
            <p className="price">
              RWF<span className="big-price">{Number(product.price).toFixed(2)}</span>
              {product.original_price && <span className="original-price">RWF{Number(product.original_price).toFixed(2)}</span>}
              <span className="sold">{product.sold || 0}+ sold</span>
            </p>
            <div className="product-views">
              <i className="fa-solid fa-eye"></i>
              <span>{product.views || 0}</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Avoid hydration mismatch by waiting for mount
  if (!isMounted) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="loading">
          <LoadingDots label="Loading" size="lg" />
        </div>
      </div>
    );
  }

  const detailImages = normalizeProductImages(selectedProduct);
  const activeDetailImageIndex = detailImages.length > 0 ? Math.min(detailImageIndex, detailImages.length - 1) : -1;

  return (
    <>
      <div id="trend-slideshow" className="trend-slideshow active" onClick={() => router.push('/trend')} style={{ cursor: 'pointer' }}>
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
                {resolveProductImagePath(p.image) ? (
                  <img src={resolveProductImagePath(p.image)} alt={p.name} className="slide-image" />
                ) : (
                  <div className="slide-image" />
                )}
                <div className="slide-overlay">
                  <div className="slide-product-info">
                    {p.badge && <span className="slide-product-badge">{p.badge}</span>}
                    <h3 className="slide-product-name">{p.name}</h3>
                  </div>
                  <span className="slide-product-price">RWF{Number(p.price).toFixed(2)}</span>
                </div>
              </div>
            )) : (
              <div className="slide" style={{ minWidth: '100%' }}>
                <div className="loading" style={{ color: 'white', marginTop: '100px' }}>
                  <LoadingDots label="Loading" className="dot-loader--inverse" />
                </div>
              </div>
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
          <div className="loading">
            <LoadingDots label="Loading" size="lg" />
          </div>
        ) : products.length > 0 ? (
          products.map(renderProductCard)
        ) : (
          <div className="no-products">No products found.</div>
        )}
      </main>

      {showTrackOrderCta ? (
        <button
          type="button"
          className="track-order-cta"
          onClick={handleTrackOrderClick}
        >
          <i className="fa-solid fa-truck-fast" aria-hidden="true"></i>
          <span>Track your order</span>
        </button>
      ) : null}

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
              <div className="checkout-location-card">
                <div className="checkout-location-summary">
                  <div className="checkout-location-summary-copy">
                    <p className="checkout-location-label">Location</p>
                    <p className="checkout-location-summary-text">{locationSummary}</p>
                  </div>
                  <button
                    type="button"
                    className="checkout-location-toggle"
                    onClick={() => setLocationPanelOpen((current) => !current)}
                    aria-expanded={locationPanelOpen}
                    aria-label={locationPanelOpen ? 'Collapse location section' : 'Expand location section'}
                  >
                    {locationPanelOpen ? '˄' : '˅'}
                  </button>
                </div>
                {locationPanelOpen ? (
                  <div className="checkout-location-row">
                    <div>
                      <p className="checkout-location-meta">
                        {hasLocation
                          ? currentLocation?.label
                          : 'Use live or type.'}
                      </p>
                      {!hasLocation && locationError ? (
                        <p className="checkout-location-error">{locationError}</p>
                      ) : null}
                      {showManualDeliveryInput ? (
                        <div className="checkout-manual-location-box">
                          <label htmlFor="manual-delivery-location" className="checkout-location-label">
                            Address
                          </label>
                          <textarea
                            id="manual-delivery-location"
                            className="checkout-manual-location-input"
                            value={manualDeliveryLocation}
                            onChange={(event) => setManualDeliveryLocation(event.target.value)}
                            placeholder="Area, road, landmark"
                            rows={3}
                            disabled={placingOrder}
                          />
                          <p className="checkout-location-hint">Type it if GPS fails.</p>
                        </div>
                      ) : null}
                      {deliveryQuote ? (
                        <p className="checkout-location-fee">
                          {deliveryQuote.distanceKm.toFixed(2)} km | RWF {deliveryQuote.deliveryFee.toLocaleString()}
                        </p>
                      ) : showManualDeliveryInput && manualDeliveryLocationValue ? (
                        <p className="checkout-location-fee">Fee set later.</p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      className="checkout-location-action"
                      onClick={() => void handleRequestDeliveryLocation()}
                      disabled={requestingLocation || placingOrder}
                    >
                      {requestingLocation ? 'Checking...' : hasLocation ? 'Refresh live' : 'Use live'}
                    </button>
                  </div>
                ) : null}
              </div>
              {deliveryQuote ? (
                <div className="cart-total-display checkout-total-breakdown">
                  <span>Delivery Fee</span>
                  <span>RWF {Number(deliveryQuote.deliveryFee).toLocaleString()}</span>
                </div>
              ) : null}
              <div className="cart-total-display checkout-total-breakdown checkout-total-final">
                <span>Total</span>
                <span id="cart-total-amount">RWF {Number(orderGrandTotal).toLocaleString()}</span>
              </div>
              <button
                id="place-order-btn"
                className="checkout-btn"
                disabled={cartItems.length === 0 || placingOrder}
                onClick={placeOrder}
              >
                {placingOrder ? (
                  <LoadingDots label="Loading" size="sm" className="dot-loader--inverse dot-loader--button" />
                ) : 'Place Order'}
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
                    {detailImages.map((image, imageIndex) => (
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
                          {detailImages.map((_, imageIndex) => (
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
                  <div className="detail-description-block">
                    <h3 className="detail-description-title">Description</h3>
                    <p className="detail-description">{selectedProduct.description || "No description available for this product."}</p>
                  </div>
                  <div className="detail-meta">
                    {selectedProduct.category && <span>Category: {selectedProduct.category}</span>}
                    {selectedProduct.seller_business_name && <span>Seller: {selectedProduct.seller_business_name}</span>}
                    <span>Sold: {selectedProduct.sold || 0}+</span>
                  </div>

                  <div className="detail-votes">
                    <button type="button" className={`vote-btn vote-up ${userVote === 1 ? 'active' : ''}`} onClick={() => handleVote(1)}>
                      <i className="fa-solid fa-thumbs-up"></i>
                      <span>{upVotes}</span>
                    </button>
                    <button type="button" className={`vote-btn vote-down ${userVote === -1 ? 'active' : ''}`} onClick={() => handleVote(-1)}>
                      <i className="fa-solid fa-thumbs-down"></i>
                      <span>{downVotes}</span>
                    </button>
                  </div>

                  {selectedProduct.seller_id ? (
                    <div className="detail-seller-card">
                      <div className="detail-seller-header">Seller Highlight</div>
                      <div className="detail-seller-main">
                        <div className="detail-seller-logo">
                          {selectedProduct.seller_profile_pic ? (
                            <img src={resolveProductImagePath(selectedProduct.seller_profile_pic)} alt="Seller" />
                          ) : (
                            (selectedProduct.seller_business_name || selectedProduct.seller_name || 'S').charAt(0).toUpperCase()
                          )}
                        </div>
                        <div className="detail-seller-copy">
                          <strong>{selectedProduct.seller_business_name || selectedProduct.seller_name || 'Seller'}</strong>
                          <div className="detail-seller-rating">
                            <i className="fa-solid fa-star" aria-hidden="true" />
                            {sellerReviewCount > 0 ? (
                              <>
                                <span>{sellerAverageRating.toFixed(1)}</span>
                                <small>({sellerReviewCount.toLocaleString()} Reviews)</small>
                              </>
                            ) : (
                              <small>No reviews yet</small>
                            )}
                          </div>
                          <div className="detail-seller-actions">
                            <button
                              type="button"
                              className={`detail-follow-pill ${followedSellerIds.includes(String(selectedProduct.seller_id)) ? 'active' : ''}`}
                              onClick={() => void handleToggleFollowSeller(selectedProduct.seller_id)}
                              aria-label={followedSellerIds.includes(String(selectedProduct.seller_id)) ? 'Unfollow seller' : 'Follow seller'}
                            >
                              <span className="detail-follow-label">
                                {followedSellerIds.includes(String(selectedProduct.seller_id)) ? 'Following' : 'Follow'}
                              </span>
                              <span className="detail-follow-icon" aria-hidden="true">
                                <i className={`fa-solid ${followedSellerIds.includes(String(selectedProduct.seller_id)) ? 'fa-check' : 'fa-user-group'}`} />
                              </span>
                            </button>
                            <div className="detail-seller-badge">
                              <i className="fa-solid fa-circle-check" aria-hidden="true" />
                              <span>Verified Seller</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}

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

            <aside className="detail-cart-panel">
              <div className="detail-cart-panel-inner">
                <div className="cart-panel-title">
                  <div>
                    <h2>Your Cart</h2>
                    <p>{cartItems.length} item{cartItems.length === 1 ? '' : 's'}</p>
                  </div>
                </div>
                <div className="cart-items-panel">
                  {cartItems.length > 0 ? cartItems.map((item) => (
                    <div className="cart-panel-item" key={item.cart_id}>
                      {resolveProductImagePath(item.image) ? (
                        <img src={resolveProductImagePath(item.image)} alt={item.name} />
                      ) : (
                        <div className="cart-panel-item-image" />
                      )}
                      <div className="cart-panel-item-meta">
                        <strong>{item.name}</strong>
                        <span>Qty: {item.quantity}</span>
                        <span>RWF {Number(item.price).toFixed(2)}</span>
                      </div>
                      <button type="button" className="remove-from-cart" title="Remove" onClick={() => removeFromCart(item.cart_id)}>
                        <i className="fa-solid fa-trash"></i>
                      </button>
                    </div>
                  )) : (
                    <div className="empty-cart-panel">Your cart is empty</div>
                  )}
                </div>

                <div className="cart-summary-panel">
                  <div className="cart-summary-row">
                    <span>Subtotal</span>
                    <strong>RWF {Number(cartTotal).toLocaleString()}</strong>
                  </div>
                  <div className="cart-summary-row">
                    <span>Delivery</span>
                    <strong>{deliveryQuote ? `RWF ${Number(deliveryQuote.deliveryFee).toLocaleString()}` : 'Pending'}</strong>
                  </div>
                  <div className="cart-summary-row total">
                    <span>Total</span>
                    <strong>RWF {Number(orderGrandTotal).toLocaleString()}</strong>
                  </div>
                </div>

                <button
                  id="place-order-btn"
                  className="checkout-btn"
                  disabled={cartItems.length === 0 || placingOrder}
                  onClick={placeOrder}
                >
                  {placingOrder ? (
                    <LoadingDots label="Loading" size="sm" className="dot-loader--inverse dot-loader--button" />
                  ) : 'Place Order'}
                </button>
              </div>
            </aside>
          </div>
        </div>
      )}

      <footer className="site-footer">
        <div className="footer-grid">
          <div className="footer-column">
            <h3>ShopCorner</h3>
            <p>Your one-stop marketplace for trending products in Rwanda. Discover, shop, and enjoy fast delivery with trusted sellers.</p>
          </div>
          <div className="footer-column">
            <h3>Quick Links</h3>
            <ul>
              <li><a href="/">Home</a></li>
              <li><a href="/trend">Trend</a></li>
              <li><a href="/contact">Contact</a></li>
              <li><a href="/help">Help</a></li>
            </ul>
          </div>
          <div className="footer-column">
            <h3>Contact</h3>
            <p>Email: <a href="mailto:support@shopcorner.rw">support@shopcorner.rw</a></p>
            <p>Phone: <a href="tel:+250788123456">+250 788 123 456</a></p>
            <p>Address: Kigali, Rwanda</p>
            <p>Hours: Mon - Fri, 9:00 AM - 6:00 PM</p>
          </div>
        </div>
        <div className="footer-bottom">
          <p>© {new Date().getFullYear()} ShopCorner. All rights reserved.</p>
        </div>
      </footer>
    </>
  );
}
