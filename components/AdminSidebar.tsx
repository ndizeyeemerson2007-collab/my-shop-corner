'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

const adminTabs = [
  {
    key: 'overview',
    label: 'Overview',
    icon: 'fa-solid fa-chart-pie',
    description: 'Platform stats and revenue',
  },
  {
    key: 'sellers',
    label: 'Sellers',
    icon: 'fa-solid fa-user-check',
    description: 'Approvals and seller reviews',
  },
  {
    key: 'products',
    label: 'Products',
    icon: 'fa-solid fa-box-open',
    description: 'Catalog moderation',
  },
  {
    key: 'users',
    label: 'Users',
    icon: 'fa-solid fa-users-gear',
    description: 'Suspensions and account control',
  },
] as const;

export default function AdminSidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeTab = searchParams.get('tab') || 'overview';

  return (
    <aside className="admin-layout-sidebar">
      <div className="admin-layout-brand">
        <p className="admin-layout-kicker">Admin section</p>
        <h2>MyShop Control</h2>
        <span>Dedicated navigation for all admin views.</span>
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
    </aside>
  );
}
