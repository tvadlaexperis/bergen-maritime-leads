import Link from 'next/link';

// Kundekontakt status shared by the company list and the company page's side
// list. The fields come from listCompaniesWithScore / listCompaniesBrief and
// are read from the konsern's main company.
export interface ContactFields {
  contact_count?: number;
  contact_last_on?: string | null;
  contact_last_outcome?: string | null;
  contact_answered?: number;
  contact_meeting_on?: string | null;
  home_meeting_date?: string | null;
}

function shortLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' });
}

/** Booked meeting: Bedriftsmøte date, else the date of a «avtalt møte» contact. */
export function meetingDate(r: ContactFields): string | null {
  return r.home_meeting_date || r.contact_meeting_on || null;
}

function isoLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric' });
}

type ContactState = 'none' | 'called' | 'answered' | 'meeting';

function contactState(r: ContactFields): ContactState {
  if (meetingDate(r)) return 'meeting';
  if ((r.contact_answered ?? 0) > 0) return 'answered';
  if ((r.contact_count ?? 0) > 0) return 'called';
  return 'none';
}

const STATE_TEXT: Record<ContactState, string> = {
  none: 'Ikke kontaktet ennå',
  called: 'Ringt — ikke fått svar',
  answered: 'Fått svar',
  meeting: 'Møte avtalt',
};

// Phone icon: grey = not contacted, amber = called without reaching anyone,
// blue = reached someone; a green calendar = meeting booked. Details on hover.
export function ContactStatusIcon({ r }: { r: ContactFields & { orgnr: string } }) {
  const state = contactState(r);
  const meeting = meetingDate(r);
  const title = [
    STATE_TEXT[state],
    r.contact_count ? `${r.contact_count} registrert${r.contact_count === 1 ? '' : 'e'} kontakt${r.contact_count === 1 ? '' : 'er'}` : null,
    r.contact_last_on ? `sist ${isoLabel(r.contact_last_on)}${r.contact_last_outcome ? ` (${r.contact_last_outcome})` : ''}` : null,
    meeting ? `møte ${isoLabel(meeting)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <Link href={`/company/${r.orgnr}`} className="contact-status" data-state={state} title={title} aria-label={title}>
      {state === 'meeting' ? (
        // Meeting booked: a calendar with a tick, so it doesn't read as just another phone colour.
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="4.5" width="18" height="16.5" rx="2" />
          <path d="M3 9.5h18M8 2.5v4M16 2.5v4" />
          <path d="m9 15 2 2 4-4" />
        </svg>
      ) : (
      <svg viewBox="0 0 24 24" width="15" height="15" fill={state === 'none' ? 'none' : 'currentColor'} stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" strokeLinejoin="round" />
      </svg>
      )}
    </Link>
  );
}

export function MeetingCell({ r, short = false }: { r: ContactFields; short?: boolean }) {
  const m = meetingDate(r);
  if (!m) return <span className="muted">—</span>;
  const today = new Date().toLocaleDateString('sv-SE');
  const upcoming = m >= today;
  return (
    <span className={`meeting-chip${upcoming ? ' upcoming' : ''}`} title={upcoming ? 'Avtalt møte' : 'Møtet er avholdt'}>
      {short ? shortLabel(m) : isoLabel(m)}
    </span>
  );
}

