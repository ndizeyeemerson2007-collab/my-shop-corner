'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { safeFetch, getStoredUser, handleLogoutLocal, getCurrentUserFromServer } from '../services/api';
import { CartItem, User } from '../types';
import { useConfirm } from './ConfirmProvider';

export default function Header() {
  const confirm = useConfirm();
  const pathname = usePathname();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [cartCount, setCartCount] = useState(0);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [cartTotal, setCartTotal] = useState(0);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

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

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('userLogin', handleUserLogin);
      window.removeEventListener('userLogout', handleUserLogout);
      clearInterval(timer);
    };
  }, []);

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
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
            <div className="cart-icon">
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
