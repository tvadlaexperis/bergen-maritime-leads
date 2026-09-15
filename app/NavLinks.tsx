'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/', label: 'Selskaper' },
  { href: '/dashboard', label: 'Oversikt' },
  { href: '/favoritter', label: 'Favoritter' },
];

export default function NavLinks() {
  const path = usePathname();

  return (
    <nav className="app-tabs" aria-label="Seksjoner">
      {LINKS.map((l) => {
        const active = l.href === '/' ? path === '/' : path.startsWith(l.href);
        return (
          <Link key={l.href} href={l.href} className={`app-tab${active ? ' active' : ''}`}>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
