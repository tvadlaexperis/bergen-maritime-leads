import Link from 'next/link';

// Icon-only "back" link placed left of a page title. The label lives in
// aria-label/title, so it still reads as "Tilbake til …" for screen readers
// and on hover.
export default function BackArrow({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="link-accent"
      aria-label={label}
      title={label}
      style={{ display: 'inline-flex', padding: 4, marginLeft: -4, flexShrink: 0 }}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M19 12H5" />
        <path d="M12 19l-7-7 7-7" />
      </svg>
    </Link>
  );
}
