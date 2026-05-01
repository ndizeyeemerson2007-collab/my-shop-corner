'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useConfirm } from './ConfirmProvider';
import { handleLogoutLocal, safeFetch } from '../services/api';

const adminTabs = [
  {
    key: 'overview',
    label: 'Overview',
    icon: 'fa-solid fa-chart-pie',
    description: 'Stats, alerts, revenue',
  },
  {
    key: 'sellers',
    label: 'Sellers',
    icon: 'fa-solid fa-user-check',
    description: 'Shop approvals',
  },
  {
    key: 'products',
    label: 'Products',
    icon: 'fa-solid fa-box-open',
    description: 'Catalog control',
  },
  {
    key: 'users',
    label: 'Users',
    icon: 'fa-solid fa-users-gear',
    description: 'Account control',
  },
] as const;

export default function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const confirm = useConfirm();
  const activeTab = searchParams.get('tab') || 'overview';

  const handleLogout = async () => {
    const confirmed = await confirm({
      title: 'Logout',
      message: 'Do you want to logout?',
      confirmText: 'Yes',
      cancelText: 'No',
      iconClass: 'fa-solid fa-right-from-bracket',
    });

    if (!confirmed) return;

    handleLogoutLocal();
    window.dispatchEvent(new CustomEvent('userLogout'));

    try {
      await safeFetch('/api/auth', {
        method: 'POST',
        body: JSON.stringify({ mode: 'logout' }),
      });
    } catch {
      // Local logout already cleared the session state.
    }

    router.replace('/login');
    router.refresh();
  };

  return (
    <aside className="admin-layout-sidebar">
      <div className="admin-layout-brand">
        
        <h2>ShopCorner Control</h2>
        
      </div>

      <nav className="admin-layout-nav" aria-label="Admin sections">
        {adminTabs.map((tab) => {
          const isActive = activeTab === tab.key;

          return (
            <Link
              key={tab.key}
              href={`${pathname}?tab=${tab.key}`}
              className={`admin-layout-nav-link ${isActive ? 'active' : ''}`}
            >
              <i className={tab.icon} />
              <div>
                <strong>{tab.label}</strong>
                <span>{tab.description}</span>
              </div>
            </Link>
          );
        })}
      </nav>

      <button type="button" className="admin-layout-logout" onClick={handleLogout}>
        <i className="fa-solid fa-arrow-right-from-bracket" />
        <span>Logout</span>
      </button>
    </aside>
  );
}
