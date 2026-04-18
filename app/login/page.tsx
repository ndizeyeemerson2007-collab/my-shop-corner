'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import LoadingDots from '../../components/LoadingDots';

export default function LoginPage() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    full_name: '',
    phone: '',
    address: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setError(''); // Clear error when user types
  };

  const validateForm = (): boolean => {
    if (!formData.email || !formData.password) {
      setError('Email and password are required');
      return false;
    }

    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters');
      return false;
    }

    if (mode === 'signup') {
      if (!formData.full_name || !formData.phone || !formData.address) {
        setError('Please fill all fields');
        return false;
      }
      if (formData.full_name.length > 100) {
        setError('Full name must be 100 characters or less');
        return false;
      }
      if (formData.phone.length > 20) {
        setError('Phone must be 20 characters or less');
        return false;
      }
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!validateForm()) {
      return;
    }

    setLoading(true);
    try {
      // Clear stale local auth before asking server for fresh auth state
      localStorage.removeItem('supabase_session');
      localStorage.removeItem('shopcorner_user');

      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, mode }),
      });

      const data = await response.json();

      if (data.success) {
        // Store Supabase session
        if (data.session) {
          localStorage.setItem('supabase_session', JSON.stringify(data.session));
        }
        // Store user data
        if (data.user) {
          localStorage.setItem('shopcorner_user', JSON.stringify(data.user));
        }
        // Dispatch custom event to update Header
        window.dispatchEvent(new CustomEvent('userLogin'));
        // Redirect
        const shouldOpenCartAfterLogin = localStorage.getItem('shopcorner_open_cart_after_login') === '1';
        if (shouldOpenCartAfterLogin) {
          router.push('/');
        } else {
          router.push(data.redirect || '/profile');
        }
      } else {
        localStorage.removeItem('supabase_session');
        localStorage.removeItem('shopcorner_user');
        window.dispatchEvent(new CustomEvent('userLogout'));
        setError(data.message || 'An error occurred');
      }
    } catch (err) {
      console.error('Auth error:', err);
      setError('Connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = () => {
    setMode(mode === 'login' ? 'signup' : 'login');
    setError('');
    setFormData({
      email: '',
      password: '',
      full_name: '',
      phone: '',
      address: '',
    });
  };

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div>
          <h1 className="auth-title">
            {mode === 'login' ? 'Welcome back' : 'Create account'}
          </h1>
          <p className="auth-subtitle">
            {mode === 'login'
              ? 'Sign in to access your shopping dashboard.'
              : 'Enter your details to join ShopCorner.'}
          </p>
        </div>

        {error && <div className="auth-error">{error}</div>}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="field-group">
            <label htmlFor="email">Email Address</label>
            <input
              type="email"
              id="email"
              name="email"
              placeholder="Enter your email"
              required
              disabled={loading}
              value={formData.email}
              onChange={handleInputChange}
              className="form-input"
            />
          </div>

          <div className="field-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              name="password"
              placeholder="Enter your password"
              required
              disabled={loading}
              value={formData.password}
              onChange={handleInputChange}
              className="form-input"
            />
            {mode === 'signup' && (
              <small className="password-hint">Minimum 6 characters</small>
            )}
          </div>

          {mode === 'signup' && (
            <>
              <div className="field-group">
                <label htmlFor="full_name">Full Name</label>
                <input
                  type="text"
                  id="full_name"
                  name="full_name"
                  placeholder="Enter your full name"
                  required
                  disabled={loading}
                  value={formData.full_name}
                  onChange={handleInputChange}
                  className="form-input"
                />
              </div>

              <div className="field-group">
                <label htmlFor="phone">Phone Number</label>
                <input
                  type="tel"
                  id="phone"
                  name="phone"
                  placeholder="Enter your phone number"
                  required
                  disabled={loading}
                  value={formData.phone}
                  onChange={handleInputChange}
                  className="form-input"
                />
              </div>

              <div className="field-group">
                <label htmlFor="address">Address</label>
                <textarea
                  id="address"
                  name="address"
                  rows={3}
                  placeholder="Enter your address"
                  required
                  disabled={loading}
                  value={formData.address}
                  onChange={handleInputChange}
                  className="form-input"
                />
              </div>
            </>
          )}

          <button
            type="submit"
            className="auth-submit"
            disabled={loading}
          >
            {loading ? (
              <LoadingDots label="Loading" size="sm" className="dot-loader--inverse dot-loader--button" />
            ) : mode === 'login' ? (
              'Sign In'
            ) : (
              'Create Account'
            )}
          </button>
        </form>

        <div className="auth-toggle">
          <span>{mode === 'login' ? "Don't have an account?" : 'Already have an account?'}</span>
          <button
            type="button"
            onClick={toggleMode}
            className="auth-link"
            disabled={loading}
          >
            {mode === 'login' ? 'Create Account' : 'Sign In'}
          </button>
        </div>
      </section>
    </main>
  );
}
