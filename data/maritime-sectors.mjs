// The scan universe: which municipalities and which industry (NACE / SN2007)
// codes count as "maritime" for this tool. Plain .mjs so both the Next app (TS)
// and the Node scan/seed scripts can import it; types in maritime-sectors.d.ts.
//
// Codes are matched as PREFIXES against a company's naeringskode1/2/3 from
// Brønnøysund (Enhetsregisteret). "50.1" therefore catches 50.101, 50.109, …
// Edit this list to widen or narrow the sector — it is the single source of
// truth for the nightly scan and the manual "Run scan" button.

/** @type {{ nr: string, name: string }[]} */
// Bergen and the municipalities within about an hour's drive (2024 numbers).
// Left out on purpose: Kvam, Modalen, Masfjorden, Fedje, Voss, Stord and
// further — more than an hour away.
export const KOMMUNER = [
  { nr: '4601', name: 'Bergen' },
  { nr: '4626', name: 'Øygarden' },
  { nr: '4627', name: 'Askøy' },
  { nr: '4624', name: 'Bjørnafjorden' },
  { nr: '4631', name: 'Alver' },
  { nr: '4630', name: 'Osterøy' },
  { nr: '4623', name: 'Samnanger' },
  { nr: '4628', name: 'Vaksdal' },
  { nr: '4625', name: 'Austevoll' },
];

/** @type {{ orgnr: string, name: string, why: string, segment?: { code: string, label: string, group: string } }[]} */
// Companies outside KOMMUNER that belong in the tool anyway — ferry and
// express-boat operators with big routes, crews or contracts in the Bergen
// region (Fjord1 sits in Florø, Norled in Stavanger, …). The scan always
// fetches these and never hides them for their address. Add an orgnr here
// to include another; the scan picks it up on its next discovery run.
// `segment` places a company whose NACE code isn't on the maritime list
// (e.g. maritime software, 62.100) in one of the list's segments.
export const EXTRA_COMPANIES = [
  { orgnr: '983472583', name: 'FJORD1 AS', why: 'Største ferjerederi på Vestlandet (Florø)' },
  { orgnr: '982985927', name: 'F1 ADMINISTRASJON AS', why: 'Fjord1-konsernets administrasjon (Florø)' },
  { orgnr: '981940768', name: 'NORLED AS', why: 'Ferje og hurtigbåt, mange Vestland-samband (Stavanger)' },
  { orgnr: '974208849', name: 'BOREAL SJØ AS', why: 'Ferje- og hurtigbåtrederi (Hammerfest)' },
  { orgnr: '916819927', name: 'TORGHATTEN AS', why: 'Morselskap i Torghatten-konsernet, ferje og hurtigbåt (Trondheim)' },
  { orgnr: '910310895', name: 'FJORD LINE AS', why: 'Utenlandsferje Bergen–Stavanger–Hirtshals (Eigersund)' },
  { orgnr: '918458999', name: 'HAVILA KYSTRUTEN OPERATIONS AS', why: 'Kystruten Bergen–Kirkenes (Herøy)' },
  { orgnr: '985979456', name: 'HURTIGRUTEN SJØ AS', why: 'Kystruten Bergen–Kirkenes (Sør-Varanger)' },
  { orgnr: '982947863', name: 'RØDNE TRAFIKK AS', why: 'Hurtigbåt og fjordcruise, også i Bergen (Stavanger)' },
  {
    orgnr: '979273177',
    name: 'UNISEA AS',
    why: 'Programvare for skipsdrift og rederier (Karmøy)',
    segment: { code: '62.100', label: 'Maritim programvare', group: 'Havn & tjenester' },
  },
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
  // Seafood trading/export (Lerøy Seafood, Seaborn, Norges Sildesalgslag,
  // Grieg Seafood Sales) — ~70 companies in the region.
  { code: '46.32', label: 'Engroshandel med fisk og sjømat', group: 'Sjømat' },
  { code: '09.10', label: 'Tjenester tilknyttet olje- og gassutvinning (offshore)', group: 'Offshore' },
  // Pumps and compressors: in the Bergen region this is subsea and marine
  // pump makers (OneSubsea Processing, Framo) — a handful, all maritime.
  { code: '28.13', label: 'Pumper og kompressorer (subsea/marint)', group: 'Offshore' },
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
