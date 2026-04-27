'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import LoadingDots from '../../../components/LoadingDots';
import { handleLogoutLocal, storeAuthState } from '../../../services/api';

export default function SellerLoginPage() {
  const [mode, setMode] = useState<'login' | 'signup'>('signup');
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    full_name: '',
    phone: '',
    address: '',
    business_name: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const router = useRouter();

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData((current) => ({ ...current, [e.target.name]: e.target.value }));
    setError('');
    setSuccessMessage('');
  };

  const validateForm = () => {
    if (!formData.email || !formData.password) {
      setError('Email and password are required');
      return false;
    }

    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters');
      return false;
    }

    if (mode === 'signup' && (!formData.full_name || !formData.phone || !formData.address || !formData.business_name)) {
      setError('Please fill all seller fields');
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    if (!validateForm()) return;

    setLoading(true);
    try {
      handleLogoutLocal();

      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          mode,
          account_type: 'seller',
        }),
      });

      const data = await response.json();

      if (!data.success) {
        handleLogoutLocal();
        window.dispatchEvent(new CustomEvent('userLogout'));
        setError(data.message || 'An error occurred');
        return;
      }

      if (mode === 'signup' && data.requiresEmailVerification) {
        setSuccessMessage(data.message || 'Check your email to verify your seller account. After that, the admin team will review and approve it before seller access is opened.');
        setMode('login');
        setFormData((current) => ({ ...current, password: '' }));
        return;
      }

      if (data.session && data.user) {
        storeAuthState(data.session, data.user);
        window.dispatchEvent(new CustomEvent('userLogin'));
        router.push(data.redirect || '/seller');
        return;
      }

      setSuccessMessage(data.message || 'Request completed successfully');
    } catch (err) {
      console.error('Seller auth error:', err);
      setError('Connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div>
          <h1 className="auth-title">{mode === 'login' ? 'Seller sign in' : 'Open your seller account'}</h1>
          <p className="auth-subtitle">
            {mode === 'login'
              ? 'Access your seller dashboard and manage only your own products and orders.'
              : 'Create a seller account with your business name so your products appear under your company.'}
          </p>
        </div>

        {error ? <div className="auth-error">{error}</div> : null}
        {successMessage ? <div className="auth-success">{successMessage}</div> : null}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="field-group">
            <label htmlFor="email">Email Address</label>
            <input id="email" name="email" type="email" className="form-input" disabled={loading} value={formData.email} onChange={handleInputChange} />
          </div>

          <div className="field-group">
            <label htmlFor="password">Password</label>
            <input id="password" name="password" type="password" className="form-input" disabled={loading} value={formData.password} onChange={handleInputChange} />
          </div>

          {mode === 'signup' ? (
            <>
              <div className="field-group">
                <label htmlFor="business_name">Business Name</label>
                <input id="business_name" name="business_name" type="text" className="form-input" disabled={loading} value={formData.business_name} onChange={handleInputChange} />
              </div>

              <div className="field-group">
                <label htmlFor="full_name">Seller Name</label>
                <input id="full_name" name="full_name" type="text" className="form-input" disabled={loading} value={formData.full_name} onChange={handleInputChange} />
              </div>

              <div className="field-group">
                <label htmlFor="phone">Phone Number</label>
                <input id="phone" name="phone" type="tel" className="form-input" disabled={loading} value={formData.phone} onChange={handleInputChange} />
              </div>

              <div className="field-group">
                <label htmlFor="address">Business Address</label>
                <textarea id="address" name="address" rows={3} className="form-input" disabled={loading} value={formData.address} onChange={handleInputChange} />
              </div>
            </>
          ) : null}

          <button type="submit" className="auth-submit" disabled={loading}>
            {loading ? <LoadingDots label="Loading" size="sm" className="dot-loader--inverse dot-loader--button" /> : mode === 'login' ? 'Enter Seller Dashboard' : 'Create Seller Account'}
          </button>
        </form>

        <div className="auth-toggle">
          <span>{mode === 'login' ? 'Need a seller account?' : 'Already registered as a seller?'}</span>
          <button type="button" onClick={() => setMode((current) => current === 'login' ? 'signup' : 'login')} className="auth-link" disabled={loading}>
            {mode === 'login' ? 'Create Seller Account' : 'Seller Sign In'}
          </button>
        </div>

        <div className="auth-toggle">
          <span>Shopping for yourself?</span>
          <Link href="/login" className="auth-link">Go to customer login</Link>
        </div>
      </section>
    </main>
  );
}
