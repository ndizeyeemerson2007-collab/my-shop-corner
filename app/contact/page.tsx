'use client';

import React, { useState } from 'react';
import { safeFetch } from '../../services/api';
import LoadingDots from '../../components/LoadingDots';

export default function ContactPage() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitStatus('idle');

    try {
      // For now, we'll just simulate sending - you can integrate with your email service
      await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate API call

      // You can replace this with actual email service integration
      const response = await safeFetch<{ success: boolean }>('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (response.success) {
        setSubmitStatus('success');
        setFormData({ name: '', email: '', subject: '', message: '' });
      } else {
        setSubmitStatus('error');
      }
    } catch (error) {
      console.error('Contact form submission error:', error);
      setSubmitStatus('error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="contact-page">
      {/* Hero Section */}
      <section className="contact-hero">
        <div className="contact-hero-content">
          <h1>Let's Chat</h1>
          <p className="contact-subtitle">
            We'd love to hear from you. Whether you have a question about our products,
            need help with an order, or just want to say hello - we're here for you.
          </p>
          <div className="contact-stats">
            <div className="stat-item">
              <span className="stat-number">24/7</span>
              <span className="stat-label">Support</span>
            </div>
            <div className="stat-item">
              <span className="stat-number">&lt;2hrs</span>
              <span className="stat-label">Response</span>
            </div>
            <div className="stat-item">
              <span className="stat-number">100%</span>
              <span className="stat-label">Satisfaction</span>
            </div>
          </div>
        </div>
        <div className="contact-hero-image">
          <div className="hero-illustration">
            <i className="fa-solid fa-comments"></i>
          </div>
        </div>
      </section>

      {/* Contact Methods */}
      <section className="contact-methods">
        <div className="contact-container">
          <h2>Get in Touch</h2>
          <p className="section-description">
            Choose the way that works best for you. We're always just a message away!
          </p>

          <div className="contact-cards">
            <div className="contact-card">
              <div className="contact-icon">
                <i className="fa-solid fa-envelope"></i>
              </div>
              <h3>Email Us</h3>
              <p>Drop us a line anytime</p>
              <a href="mailto:hello@shopcorner.rw" className="contact-link">
                hello@shopcorner.rw
              </a>
              <span className="response-time">Usually responds within 2 hours</span>
            </div>

            <div className="contact-card">
              <div className="contact-icon">
                <i className="fa-solid fa-phone"></i>
              </div>
              <h3>Call Us</h3>
              <p>Speak directly with our team</p>
              <a href="tel:+250788123456" className="contact-link">
                +250 788 123 456
              </a>
              <span className="response-time">Mon-Fri: 8AM-6PM EAT</span>
            </div>

            <div className="contact-card">
              <div className="contact-icon">
                <i className="fa-solid fa-map-marker-alt"></i>
              </div>
              <h3>Visit Us</h3>
              <p>Come say hello in person</p>
              <address className="contact-link">
                KG 123 St, Kimisagara<br />
                Kigali, Rwanda
              </address>
              <span className="response-time">Open daily 9AM-8PM</span>
            </div>

            <div className="contact-card">
              <div className="contact-icon">
                <i className="fa-solid fa-comments"></i>
              </div>
              <h3>Live Chat</h3>
              <p>Instant help on our site</p>
              <button className="contact-link live-chat-btn">
                Start Chat
              </button>
              <span className="response-time">Available 24/7</span>
            </div>
          </div>
        </div>
      </section>

      {/* Contact Form */}
      <section className="contact-form-section">
        <div className="contact-container">
          <div className="form-wrapper">
            <div className="form-header">
              <h2>Send us a Message</h2>
              <p>
                Got something specific on your mind? We'd love to hear it.
                Fill out the form below and we'll get back to you as soon as we can.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="contact-form">
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="name">Your Name</label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    required
                    placeholder="What's your name?"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="email">Email Address</label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    required
                    placeholder="your.email@example.com"
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="subject">What's this about?</label>
                <select
                  id="subject"
                  name="subject"
                  value={formData.subject}
                  onChange={handleInputChange}
                  required
                >
                  <option value="">Choose a topic</option>
                  <option value="order">Order Inquiry</option>
                  <option value="product">Product Question</option>
                  <option value="returns">Returns & Exchanges</option>
                  <option value="feedback">Feedback</option>
                  <option value="partnership">Business Partnership</option>
                  <option value="other">Something Else</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="message">Your Message</label>
                <textarea
                  id="message"
                  name="message"
                  value={formData.message}
                  onChange={handleInputChange}
                  required
                  rows={5}
                  placeholder="Tell us what's on your mind. We're listening! 💬"
                />
              </div>

              <button
                type="submit"
                className="submit-btn"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <LoadingDots label="Sending" size="sm" />
                  </>
                ) : (
                  <>
                    Send Message
                    <i className="fa-solid fa-paper-plane"></i>
                  </>
                )}
              </button>

              {submitStatus === 'success' && (
                <div className="form-message success">
                  <i className="fa-solid fa-check-circle"></i>
                  Thanks for reaching out! We'll get back to you within 24 hours.
                </div>
              )}

              {submitStatus === 'error' && (
                <div className="form-message error">
                  <i className="fa-solid fa-exclamation-triangle"></i>
                  Oops! Something went wrong. Please try again or contact us directly.
                </div>
              )}
            </form>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="faq-section">
        <div className="contact-container">
          <h2>Frequently Asked Questions</h2>
          <div className="faq-grid">
            <div className="faq-item">
              <h3>What's your return policy?</h3>
              <p>We offer 5-day returns on most items. Just make sure they're in original condition with tags attached.</p>
            </div>
            <div className="faq-item">
              <h3>Do you ship outside Rwanda?</h3>
              <p>Currently, we only ship within Rwanda. We're working on expanding our delivery network!</p>
            </div>
            <div className="faq-item">
              <h3>How can I track my order?</h3>
              <p>Once your order ships, you'll receive a tracking number via email and SMS.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Business Hours */}
      <section className="hours-section">
        <div className="contact-container">
          <h2>Business Hours</h2>
          <div className="hours-grid">
            <div className="hours-item">
              <div className="day">Monday - Friday</div>
              <div className="time">8:00 AM - 6:00 PM</div>
            </div>
            <div className="hours-item">
              <div className="day">Saturday</div>
              <div className="time">9:00 AM - 4:00 PM</div>
            </div>
            <div className="hours-item">
              <div className="day">Sunday</div>
              <div className="time">10:00 AM - 2:00 PM</div>
            </div>
            <div className="hours-item holiday">
              <div className="day">Public Holidays</div>
              <div className="time">Closed</div>
            </div>
          </div>
          <p className="hours-note">
            <i className="fa-solid fa-info-circle"></i>
            Emergency support available 24/7 for urgent order issues.
          </p>
        </div>
      </section>
    </main>
  );
}