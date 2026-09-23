import './globals.css';
import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { getCurrentUser } from '@/lib/auth';
import { getThemePref, themeAttr } from '@/lib/theme';
import { listRecentNotifications, countUnreadNotifications } from '@/lib/db';
import { Suspense } from 'react';
import ThemeToggle from './ThemeToggle';
import NavLinks from './NavLinks';
import FxTicker from './FxTicker';
import NotificationsBell from './NotificationsBell';
import ProfileMenu from './ProfileMenu';

const font = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: {
    default: 'Maritim Bergen',
    template: '%s · Maritim Bergen',
  },
  description: 'Salgs-leads i maritim sektor i Bergen — nøkkeltall fra Brønnøysundregistrene.',
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  const theme = getThemePref();
  const [notifications, unreadCount] = user
    ? await Promise.all([listRecentNotifications(15), countUnreadNotifications()])
    : [[], 0];

  return (
    <html lang="nb" data-theme={themeAttr(theme)} className={font.variable} suppressHydrationWarning>
      <body>
        <header className="app-header">
          <Link href="/" className="app-brand">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M12 2v20M12 6l7 3M12 6L5 9" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M5 9c0 5 3 9 7 11 4-2 7-6 7-11" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="12" cy="4" r="1.6" />
            </svg>
            <span className="app-brand-name">Maritim Bergen</span>
          </Link>

          {user && (
            <Suspense fallback={<div className="fx-ticker" />}>
              <FxTicker />
            </Suspense>
          )}

          <div className="app-nav">
            {user && <NavLinks />}
            {user && <NotificationsBell initial={notifications} initialUnread={unreadCount} />}
            <ThemeToggle initial={theme} />
            {user ? (
              <ProfileMenu user={{ displayName: user.displayName, email: user.email, role: user.role }} />
            ) : (
              <Link href="/login" className="link-accent">
                Logg inn
              </Link>
            )}
          </div>
        </header>
        <main className="app-main">
          <div className="app-main-inner">{children}</div>
        </main>
      </body>
    </html>
  );
}
