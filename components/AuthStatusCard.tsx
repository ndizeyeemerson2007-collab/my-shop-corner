'use client';

import LoadingDots from './LoadingDots';

type AuthStatusCardProps = {
  title: string;
  message: string;
  loading?: boolean;
};

export default function AuthStatusCard({ title, message, loading = false }: AuthStatusCardProps) {
  return (
    <main className="auth-page">
      <section className="auth-card auth-status-card">
        <h1 className="auth-title">{title}</h1>
        <p className="auth-subtitle">{message}</p>
        {loading ? (
          <div className="auth-status-loader">
            <LoadingDots label="Loading" size="lg" />
          </div>
        ) : null}
      </section>
    </main>
  );
}
