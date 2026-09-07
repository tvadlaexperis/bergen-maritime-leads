// The scan universe: which municipalities and which industry (NACE / SN2007)
// codes count as "maritime" for this tool. Plain .mjs so both the Next app (TS)
// and the Node scan/seed scripts can import it; types in maritime-sectors.d.ts.
//
// Codes are matched as PREFIXES against a company's naeringskode1/2/3 from
// Brønnøysund (Enhetsregisteret). "50.1" therefore catches 50.101, 50.109, …
// Edit this list to widen or narrow the sector — it is the single source of
// truth for the nightly scan and the manual "Run scan" button.

/** @type {{ nr: string, name: string }[]} */
export const KOMMUNER = [
  { nr: '4601', name: 'Bergen' },
];

/** @type {{ code: string, label: string, group: string }[]} */
export const NACE_CODES = [
  { code: '30.11', label: 'Bygging av skip og flytende materiell', group: 'Verft & bygging' },
  { code: '30.12', label: 'Bygging av fritidsbåter', group: 'Verft & bygging' },
  { code: '33.15', label: 'Reparasjon og vedlikehold av skip og båter', group: 'Verft & bygging' },
  { code: '50.1', label: 'Sjøfart – passasjertransport', group: 'Sjøtransport' },
  { code: '50.2', label: 'Sjøfart – godstransport', group: 'Sjøtransport' },
  { code: '50.3', label: 'Innenriks sjøtransport – passasjerer', group: 'Sjøtransport' },
  { code: '50.4', label: 'Innenriks sjøtransport – gods', group: 'Sjøtransport' },
  { code: '52.22', label: 'Tjenester tilknyttet sjøtransport', group: 'Havn & tjenester' },
  { code: '52.24', label: 'Lasting og lossing', group: 'Havn & tjenester' },
  { code: '77.34', label: 'Utleie og leasing av sjøtransportmateriell', group: 'Havn & tjenester' },
  { code: '03.11', label: 'Hav- og kystfiske', group: 'Sjømat' },
  { code: '03.21', label: 'Hav- og kystbasert akvakultur', group: 'Sjømat' },
  { code: '09.10', label: 'Tjenester tilknyttet olje- og gassutvinning (offshore)', group: 'Offshore' },
];

/** Does any of a company's NACE codes fall under our maritime list? */
export function matchNace(codes) {
  for (const raw of codes) {
    if (!raw) continue;
    const c = String(raw).replace(/\s/g, '');
    for (const entry of NACE_CODES) {
      if (c === entry.code || c.startsWith(entry.code + '.') || c.startsWith(entry.code)) {
        return entry;
      }
    }
  }
  return null;
}
