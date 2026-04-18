'use client';

import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { safeFetch, getStoredUser, handleLogoutLocal, getCurrentUserFromServer, resolveProductImagePath } from '../services/api';
import { CartItem, Product, User } from '../types';
import { useConfirm } from './ConfirmProvider';

const PENDING_PRODUCT_KEY = 'shopcorner_pending_product';

function normalizeSearchValue(value: string) {
  return value.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function isSubsequenceMatch(query: string, target: string) {
  let queryIndex = 0;

  for (let i = 0; i < target.length && queryIndex < query.length; i += 1) {
    if (target[i] === query[queryIndex]) {
      queryIndex += 1;
    }
  }

  return queryIndex === query.length;
}

function scoreProduct(product: Product, rawQuery: string) {
  const query = normalizeSearchValue(rawQuery);
  if (!query) return 0;

  const name = normalizeSearchValue(product.name || '');
  const category = normalizeSearchValue(product.category || '');
  const badge = normalizeSearchValue(product.badge || '');
  const description = normalizeSearchValue(product.description || '');
  const words = name.split(' ').filter(Boolean);

  let score = 0;

  if (name === query) score += 1200;
  if (name.startsWith(query)) score += 900;
  if (words.some((word) => word.startsWith(query))) score += 650;
  if (name.includes(query)) score += 500;
  if (category.startsWith(query)) score += 260;
  if (category.includes(query)) score += 180;
  if (badge.includes(query)) score += 120;
  if (description.includes(query)) score += 70;
  if (isSubsequenceMatch(query, name.replace(/\s+/g, ''))) score += 150;

  if (product.is_trend) score += 25;
  score += Math.min(Number(product.sold || 0), 200);

  return score;
}

function productNameMatches(product: Product, rawQuery: string) {
  const query = normalizeSearchValue(rawQuery);
  if (!query) return true;

  const name = normalizeSearchValue(product.name || '');
  return name.includes(query);
}

export default function Header() {
  const confirm = useConfirm();
  const pathname = usePathname();
  const router = useRouter();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [cartCount, setCartCount] = useState(0);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [cartTotal, setCartTotal] = useState(0);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchProducts, setSearchProducts] = useState<Product[]>([]);
  const [trendProducts, setTrendProducts] = useState<Product[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const deferredSearchQuery = useDeferredValue(searchQuery);

  // Timer for deals
  const [hours, setHours] = useState(2);
  const [minutes, setMinutes] = useState(13);
  const [seconds, setSeconds] = useState(54);

  useEffect(() => {
    // Scroll effect
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);

    // Timer effect
    const timer = setInterval(() => {
      setSeconds(prev => {
        if (prev === 0) {
          setMinutes(min => {
            if (min === 0) {
              setHours(h => h === 0 ? 23 : h - 1);
              return 59;
            }
            return min - 1;
          });
          return 59;
        }
        return prev - 1;
      });
    }, 1000);

    // Load user and cart
    const loadUserAndCart = async () => {
      // Fetch fresh user data from server (validates session and checks if user still exists)
      const serverUser = await getCurrentUserFromServer();
      if (serverUser === null) {
        setUser(null); // User was deleted or session is invalid
      } else {
        setUser(serverUser);
      }

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

    loadUserAndCart();

    // Listen for storage changes to update user state
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'shopcorner_user') {
        const newUser = getStoredUser();
        setUser(newUser);
      }
    };
    window.addEventListener('storage', handleStorageChange);

    // Listen for login event
    const handleUserLogin = () => {
      const newUser = getStoredUser();
      setUser(newUser);
    };
    window.addEventListener('userLogin', handleUserLogin);

    // Listen for logout event
    const handleUserLogout = () => {
      setUser(null);
    };
    window.addEventListener('userLogout', handleUserLogout);

    const handleCartUpdated = async () => {
      try {
        const cartRes = await safeFetch<{ success: boolean; cart_count: number; cart_items: CartItem[]; cart_total: number }>('/api/cart');
        if (cartRes.success) {
          setCartCount(cartRes.cart_count || 0);
          setCartItems(cartRes.cart_items || []);
          setCartTotal(cartRes.cart_total || 0);
        }
      } catch (e) {
        console.warn('Error refreshing cart', e);
      }
    };
    window.addEventListener('cartUpdated', handleCartUpdated);

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('userLogin', handleUserLogin);
      window.removeEventListener('userLogout', handleUserLogout);
      window.removeEventListener('cartUpdated', handleCartUpdated);
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!isSearchOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsSearchOpen(false);
      }
    };

    window.addEventListener('keydown', handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isSearchOpen]);

  useEffect(() => {
    if (!isSearchOpen) return;
    if (searchProducts.length > 0) return;

    const loadSearchProducts = async () => {
      setLoadingSearch(true);
      try {
        const [allProducts, trending] = await Promise.all([
          safeFetch<{ success: boolean; products: Product[] }>('/api/products?limit=100'),
          safeFetch<{ success: boolean; products: Product[] }>('/api/products?trend=1&limit=12'),
        ]);

        if (allProducts.success) {
          setSearchProducts(allProducts.products || []);
        }

        if (trending.success) {
          setTrendProducts(trending.products || []);
        }
      } catch (error) {
        console.warn('Failed to load search suggestions', error);
      } finally {
        setLoadingSearch(false);
      }
    };

    loadSearchProducts();
  }, [isSearchOpen, searchProducts.length]);

  const suggestedProducts = useMemo(() => {
    const query = deferredSearchQuery.trim();

    if (!query) {
      const fallbackProducts = trendProducts.length > 0
        ? trendProducts
        : [...searchProducts]
            .sort((a, b) => Number(b.sold || 0) - Number(a.sold || 0))
            .slice(0, 8);

      return fallbackProducts.slice(0, 8);
    }

    return [...searchProducts]
      .map((product) => ({
        product,
        score: scoreProduct(product, query),
      }))
      .filter((entry) => entry.score > 0 && productNameMatches(entry.product, query))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map((entry) => entry.product);
  }, [deferredSearchQuery, searchProducts, trendProducts]);

  const recommendedProducts = useMemo(() => {
    const source = trendProducts.length > 0 ? trendProducts : searchProducts;
    return [...source]
      .sort((a, b) => Number(b.sold || 0) - Number(a.sold || 0))
      .slice(0, 6);
  }, [searchProducts, trendProducts]);

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  const closeSidebar = () => {
    setIsSidebarOpen(false);
  };

  useEffect(() => {
    closeSidebar();
  }, [pathname]);

  const openSearch = () => {
    setIsSearchOpen(true);
  };

  const closeSearch = () => {
    setIsSearchOpen(false);
    setSearchQuery('');
  };

  const handleSearchSelect = (product: Product) => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(PENDING_PRODUCT_KEY, JSON.stringify(product));
      window.dispatchEvent(new CustomEvent('shopcorner:pending-product', { detail: product }));
    }

    closeSearch();

    if (pathname === '/') {
      return;
    }

    router.push('/');
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
    setUser(null);
    window.dispatchEvent(new CustomEvent('userLogout'));
    try {
      await safeFetch<{ success: boolean }>('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'logout' })
      });
    } catch (e) {
      console.warn("Server logout failed", e);
    }

    router.replace('/login');
    router.refresh();
  };

  return (
    <>
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
            <button type="button" className="search-toggle search-button" id="search-toggle" onClick={openSearch} aria-label="Open search">
              <i className="fa-solid fa-magnifying-glass"></i>
            </button>
            <Link href="/favorites" className="header-action">
              <i className="fa-regular fa-heart"></i>
            </Link>
            <div
              className="cart-icon"
              onClick={() => window.dispatchEvent(new CustomEvent('openCart'))}
            >
              <i className="fa-solid fa-bag-shopping"></i>
              {cartCount > 0 && <span id="cart-count" className="cart-count">{cartCount}</span>}
            </div>
          </div>
        </div>

        {isSidebarOpen && (
          <div id="sidebar-overlay" className="sidebar-overlay active" onClick={closeSidebar}></div>
        )}

        <nav id="side-menu" className={`side-menu ${isSidebarOpen ? 'active' : ''}`}>
          <div className="side-menu-header">
            <div id="sidebar-user-section" className="user-profile-section">
              <div className="side-avatar" id="side-avatar">{user?.full_name?.charAt(0).toUpperCase() || user?.email?.charAt(0).toUpperCase() || 'U'}</div>
              <span className="user-name" id="side-user-name">{user?.full_name || 'My Account'}</span>
            </div>
            <button className="close-side" onClick={closeSidebar}>
              <i className="fa-solid fa-xmark"></i>
            </button>
          </div>
          <div className="side-menu-body">
            <ul className="side-nav-list">
              <li><Link href="/" onClick={closeSidebar}>Home</Link></li>
              <li><a href="#" onClick={closeSidebar}>Trend</a></li>
              <li><Link href="/contact" onClick={closeSidebar}>Contact</Link></li>
              <li><Link href="/help" onClick={closeSidebar}>Help</Link></li>
              <li className="separator"></li>
              {user ? (
                <>
                  <li><Link href="/profile" id="profile-link" onClick={closeSidebar}>Profile</Link></li>
                  <li><a href="#" onClick={(e) => { e.preventDefault(); closeSidebar(); handleLogout(); }} className="logout-text" id="logout-link">Logout</a></li>
                </>
              ) : (
                <li><Link href="/login" id="login-link" onClick={closeSidebar}>Login</Link></li>
              )}
            </ul>
          </div>
        </nav>
      </header>

      {isSearchOpen && (
        <div className="search-overlay" onClick={closeSearch}>
          <div className="search-panel" onClick={(event) => event.stopPropagation()}>
            <div className="search-panel-header">
              <div className="search-panel-input-wrap">
                <i className="fa-solid fa-magnifying-glass"></i>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search for any product, style, badge, or category"
                  autoFocus
                />
              </div>
              <button type="button" className="search-close" onClick={closeSearch} aria-label="Close search">
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <div className="search-panel-body">
              <div className="search-panel-copy">
                <p className="search-panel-eyebrow">{searchQuery.trim() ? 'Best matches' : 'Discover faster'}</p>
                <h3>{searchQuery.trim() ? `Results for "${searchQuery}"` : 'Trending now in ShopCorner'}</h3>
                <span>
                  {searchQuery.trim()
                    ? 'Type anything and the most likely product names rise to the top.'
                    : 'Start typing to search across all products, or tap a trending product below.'}
                </span>
              </div>

              <div className="search-suggestion-list">
                {loadingSearch ? (
                  <div className="search-empty-state">Loading search suggestions...</div>
                ) : suggestedProducts.length > 0 ? (
                  suggestedProducts.map((product) => (
                    <button
                      key={product.id}
                      type="button"
                      className="search-suggestion-item"
                      onClick={() => handleSearchSelect(product)}
                    >
                      <div className="search-suggestion-image">
                        {resolveProductImagePath(product.image) ? (
                          <img src={resolveProductImagePath(product.image)} alt={product.name} />
                        ) : (
                          <div className="search-suggestion-placeholder" />
                        )}
                      </div>
                      <div className="search-suggestion-text">
                        <strong>{product.name}</strong>
                        <span>
                          {[product.category, product.badge].filter(Boolean).join(' / ') || 'Product suggestion'}
                        </span>
                      </div>
                      <small>RWF {Number(product.price || 0).toLocaleString()}</small>
                    </button>
                  ))
                ) : (
                  <div className="search-empty-state">No such product was found. Try another product name.</div>
                )}
              </div>

              {!searchQuery.trim() && recommendedProducts.length > 0 ? (
                <div className="search-trending-grid">
                  {recommendedProducts.map((product) => (
                    <button
                      key={`trend-${product.id}`}
                      type="button"
                      className="search-trend-chip"
                      onClick={() => handleSearchSelect(product)}
                    >
                      <i className="fa-solid fa-arrow-trend-up"></i>
                      <span>{product.name}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {pathname === '/' && (
        <>
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
        </>
      )}
    </>
  );
}
