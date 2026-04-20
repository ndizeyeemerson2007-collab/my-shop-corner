'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function HelpPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'ordering' | 'tracking' | 'contact'>('ordering');

  const orderingSteps = [
    {
      step: 1,
      title: "Browse & Select Product",
      description: "Explore our amazing collection of products. Click on any item that catches your eye.",
      icon: "fa-magnifying-glass",
      visual: "Browse our product grid and click on any product card"
    },
    {
      step: 2,
      title: "Choose Size & Color",
      description: "Select your preferred size and color options. See how it looks with our interactive preview.",
      icon: "fa-palette",
      visual: "Use the size and color selectors in the product detail modal"
    },
    {
      step: 3,
      title: "Add to Cart",
      description: "Click the 'Add to Cart' button. Your item is now saved and ready for checkout.",
      icon: "fa-cart-plus",
      visual: "Click the cart icon button on the product card or detail page"
    },
    {
      step: 4,
      title: "Review Your Cart",
      description: "Check your cart items, adjust quantities, and review your total before placing the order.",
      icon: "fa-shopping-cart",
      visual: "Click the cart icon in the header to view your cart"
    },
    {
      step: 5,
      title: "Place Your Order",
      description: "Complete your purchase securely. We'll send you confirmation and tracking details.",
      icon: "fa-credit-card",
      visual: "Click 'Place Order' and complete the checkout process"
    }
  ];

  const trackingSteps = [
    {
      step: 1,
      title: "Log In to Your Account",
      description: "Access your personal dashboard where all your orders are tracked.",
      icon: "fa-user",
      visual: "Click 'Login' in the sidebar menu and enter your credentials"
    },
    {
      step: 2,
      title: "Go to Your Dashboard",
      description: "Navigate to your profile section to see all your order history and current status.",
      icon: "fa-tachometer-alt",
      visual: "Click 'Profile' from the sidebar menu after logging in"
    },
    {
      step: 3,
      title: "Track Your Orders",
      description: "View real-time status updates, shipping information, and delivery estimates.",
      icon: "fa-truck",
      visual: "Check your order status and tracking information in the dashboard"
    },
    {
      step: 4,
      title: "Get Support if Needed",
      description: "Contact our team for any questions about your order or delivery.",
      icon: "fa-headset",
      visual: "Use the contact information provided or click 'Contact Us'"
    }
  ];

  return (
    <main className="help-page">
      {/* Hero Section */}
      <section className="help-hero">
        <div className="help-hero-content">
          <h1>Help Center</h1>
          <p className="help-subtitle">
            Everything you need to know about shopping with ShopCorner Rwanda.
            Let's make your experience smooth and enjoyable!
          </p>
          <div className="help-stats">
            <div className="stat-item">
              <span className="stat-number">3 min</span>
              <span className="stat-label">Avg. Order Time</span>
            </div>
            <div className="stat-item">
              <span className="stat-number">24/7</span>
              <span className="stat-label">Order Tracking</span>
            </div>
            <div className="stat-item">
              <span className="stat-number">Free</span>
              <span className="stat-label">Customer Support</span>
            </div>
          </div>
        </div>
      </section>

      {/* Navigation Tabs */}
      <section className="help-navigation">
        <div className="help-container">
          <div className="help-tabs">
            <button
              className={`help-tab ${activeTab === 'ordering' ? 'active' : ''}`}
              onClick={() => setActiveTab('ordering')}
            >
              <i className="fa-solid fa-shopping-bag"></i>
              How to Order
            </button>
            <button
              className={`help-tab ${activeTab === 'tracking' ? 'active' : ''}`}
              onClick={() => setActiveTab('tracking')}
            >
              <i className="fa-solid fa-truck"></i>
              Track Orders
            </button>
            <button
              className={`help-tab ${activeTab === 'contact' ? 'active' : ''}`}
              onClick={() => setActiveTab('contact')}
            >
              <i className="fa-solid fa-comments"></i>
              Get Help
            </button>
          </div>
        </div>
      </section>

      {/* Content Sections */}
      <section className="help-content">
        <div className="help-container">

          {/* Ordering Guide */}
          {activeTab === 'ordering' && (
            <div className="help-section">
              <div className="section-header">
                <h2>Complete Ordering Guide</h2>
                <p>Follow these simple steps to place your order. It's easier than you think!</p>
              </div>

              <div className="steps-container">
                {orderingSteps.map((step, index) => (
                  <div key={step.step} className="step-card">
                    <div className="step-number">{step.step}</div>
                    <div className="step-content">
                      <div className="step-icon">
                        <i className={`fa-solid ${step.icon}`}></i>
                      </div>
                      <div className="step-details">
                        <h3>{step.title}</h3>
                        <p>{step.description}</p>
                        <div className="step-visual">
                          <i className="fa-solid fa-eye"></i>
                          {step.visual}
                        </div>
                      </div>
                    </div>
                    {index < orderingSteps.length - 1 && <div className="step-arrow">↓</div>}
                  </div>
                ))}
              </div>

              <div className="help-actions">
                <Link href="/" className="help-btn primary">
                  <i className="fa-solid fa-shopping-bag"></i>
                  Start Shopping Now
                </Link>
                <button
                  className="help-btn secondary"
                  onClick={() => setActiveTab('tracking')}
                >
                  <i className="fa-solid fa-truck"></i>
                  Learn About Tracking
                </button>
              </div>
            </div>
          )}

          {/* Tracking Guide */}
          {activeTab === 'tracking' && (
            <div className="help-section">
              <div className="section-header">
                <h2>Order Tracking Made Simple</h2>
                <p>Never lose track of your packages. Here's how to monitor your orders.</p>
              </div>

              <div className="steps-container">
                {trackingSteps.map((step, index) => (
                  <div key={step.step} className="step-card">
                    <div className="step-number">{step.step}</div>
                    <div className="step-content">
                      <div className="step-icon">
                        <i className={`fa-solid ${step.icon}`}></i>
                      </div>
                      <div className="step-details">
                        <h3>{step.title}</h3>
                        <p>{step.description}</p>
                        <div className="step-visual">
                          <i className="fa-solid fa-eye"></i>
                          {step.visual}
                        </div>
                      </div>
                    </div>
                    {index < trackingSteps.length - 1 && <div className="step-arrow">↓</div>}
                  </div>
                ))}
              </div>

              <div className="tracking-benefits">
                <h3>Why Track Your Orders?</h3>
                <div className="benefits-grid">
                  <div className="benefit-item">
                    <i className="fa-solid fa-clock"></i>
                    <h4>Real-time Updates</h4>
                    <p>Get instant notifications about your order status</p>
                  </div>
                  <div className="benefit-item">
                    <i className="fa-solid fa-map-marker-alt"></i>
                    <h4>Delivery Estimates</h4>
                    <p>Know exactly when to expect your package</p>
                  </div>
                  <div className="benefit-item">
                    <i className="fa-solid fa-shield-alt"></i>
                    <h4>Secure & Private</h4>
                    <p>Your order information is always protected</p>
                  </div>
                  <div className="benefit-item">
                    <i className="fa-solid fa-headset"></i>
                    <h4>24/7 Support</h4>
                    <p>Our team is always here to help</p>
                  </div>
                </div>
              </div>

              <div className="help-actions">
                <Link href="/login" className="help-btn primary">
                  <i className="fa-solid fa-user"></i>
                  Login to Track Orders
                </Link>
                <button
                  className="help-btn secondary"
                  onClick={() => setActiveTab('contact')}
                >
                  <i className="fa-solid fa-comments"></i>
                  Need More Help?
                </button>
              </div>
            </div>
          )}

          {/* Contact Section */}
          {activeTab === 'contact' && (
            <div className="help-section">
              <div className="section-header">
                <h2>We're Here to Help</h2>
                <p>Can't find what you need? Our friendly team is ready to assist you.</p>
              </div>

              <div className="contact-options">
                <div className="contact-option">
                  <div className="contact-option-icon">
                    <i className="fa-solid fa-envelope"></i>
                  </div>
                  <h3>Email Support</h3>
                  <p>Get detailed help via email. We usually respond within 2 hours.</p>
                  <a href="mailto:hello@shopcorner.rw" className="contact-option-link">
                    hello@shopcorner.rw
                  </a>
                </div>

                <div className="contact-option">
                  <div className="contact-option-icon">
                    <i className="fa-solid fa-phone"></i>
                  </div>
                  <h3>Phone Support</h3>
                  <p>Speak directly with our team during business hours.</p>
                  <a href="tel:+250788123456" className="contact-option-link">
                    +250 788 123 456
                  </a>
                </div>

                <div className="contact-option">
                  <div className="contact-option-icon">
                    <i className="fa-solid fa-comments"></i>
                  </div>
                  <h3>Live Chat</h3>
                  <p>Instant help through our website chat feature.</p>
                  <button className="contact-option-link live-chat-btn">
                    Start Live Chat
                  </button>
                </div>

                <div className="contact-option">
                  <div className="contact-option-icon">
                    <i className="fa-solid fa-map-marker-alt"></i>
                  </div>
                  <h3>Visit Our Store</h3>
                  <p>Come see us in person at our Kigali location.</p>
                  <address className="contact-option-link">
                    KG 123 St, Kimisagara<br />
                    Kigali, Rwanda
                  </address>
                </div>
              </div>

              <div className="help-actions">
                <Link href="/contact" className="help-btn primary">
                  <i className="fa-solid fa-comments"></i>
                  Visit Full Contact Page
                </Link>
                <Link href="/" className="help-btn secondary">
                  <i className="fa-solid fa-home"></i>
                  Back to Shopping
                </Link>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Quick Links */}
      <section className="quick-links">
        <div className="help-container">
          <h2>Quick Links</h2>
          <div className="quick-links-grid">
            <Link href="/" className="quick-link">
              <i className="fa-solid fa-shopping-bag"></i>
              <span>Shop Now</span>
            </Link>
            <Link href="/trend" className="quick-link">
              <i className="fa-solid fa-fire"></i>
              <span>Super Deals</span>
            </Link>
            <Link href="/profile" className="quick-link">
              <i className="fa-solid fa-user"></i>
              <span>My Account</span>
            </Link>
            <Link href="/contact" className="quick-link">
              <i className="fa-solid fa-envelope"></i>
              <span>Contact Us</span>
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}