'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';
import AdminSidebar from '../../components/AdminSidebar';

export default function AdminLayout({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="admin-layout-shell">
      <button
        type="button"
        className="admin-layout-mobile-toggle"
        onClick={() => setSidebarOpen(true)}
        aria-label="Open admin menu"
      >
        <i className="fa-solid fa-bars" />
      </button>

      {sidebarOpen ? (
        <button
          type="button"
          className="admin-layout-overlay"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close admin menu"
        />
      ) : null}

      <div className={`admin-layout-sidebar-wrap ${sidebarOpen ? 'open' : ''}`}>
        <button
          type="button"
          className="admin-layout-close"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close admin menu"
        >
          <i className="fa-solid fa-xmark" />
        </button>
        <AdminSidebar />
      </div>

      <div className="admin-layout-content">{children}</div>
    </div>
  );
}
