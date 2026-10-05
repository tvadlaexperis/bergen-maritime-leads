// Known challenges per maritime segment, given to the AI analysis so its
// «Utfordringer i bransjen» are specific to the company's industry instead
// of the same three generic ones everywhere (climate, skills, cyber). The
// model picks the 2-4 most relevant and tailors them; each entry carries
// the angle where IT consultants or staffing can help.
// Keyed by the NACE code from data/maritime-sectors.mjs (matched_code).

export interface IndustryChallenge {
  challenge: string;
  angle: string; // where IT/tech consultants or staffing come in
}

const AQUACULTURE: IndustryChallenge[] = [
  { challenge: 'Lakselus — dyr bekjempelse, behandlingsskader og påvirkning på villaks', angle: 'sensorer, bildeanalyse/AI for lusetelling, data til behandlingsplanlegging' },
  { challenge: 'Fiskehelse, dødelighet og fiskevelferd (gjellesykdom, vintersår, PD/ISA)', angle: 'helsedata, tidlig varsling, dokumentasjon mot Mattilsynet' },
  { challenge: 'Rekordhøye produksjonskostnader (fôr, lus, energi, dokumentasjonskrav)', angle: 'effektivisering, automatisering, bedre styringsdata og ERP' },
  { challenge: 'Miljøkrav og trafikklyssystemet som styrer vekst per produksjonsområde', angle: 'miljørapportering, utslipps- og rømmingsdata' },
  { challenge: 'Grunnrenteskatt og usikkerhet om nye konsesjons- og vekstregler', angle: 'økonomi- og skattemodellering, beslutningsstøtte' },
  { challenge: 'Varmere hav: mer lus, alger, maneter og nye sykdommer', angle: 'miljøovervåking og prediktive modeller' },
  { challenge: 'Fôr og råvarer: importavhengighet og krav til bærekraftig fôr', angle: 'sporbarhet og leverandørdata' },
  { challenge: 'Nye produksjonsformer (lukket, landbasert, havbruk til havs) og mer automasjon', angle: 'styringssystemer, IoT, prosjekt- og driftskompetanse' },
];

const FISHING: IndustryChallenge[] = [
  { challenge: 'Kvotenedgang og usikre kvoter (bl.a. torsk, deling av makrell/kolmule med andre land)', angle: 'planlegging av fangst og drift, lønnsomhetsanalyse' },
  { challenge: 'Drivstoffkostnader, CO₂-avgift og overgang til lav-/nullutslippsfartøy', angle: 'energistyring, drivstoff- og utslippsdata' },
  { challenge: 'Rekruttering av fiskere og mannskap', angle: 'bemanning og kompetansestyring' },
  { challenge: 'Strengere elektronisk rapportering og sporbarhet (fangstdagbok, dokumentasjon)', angle: 'integrasjoner mot Fiskeridirektoratet og kjøpere' },
  { challenge: 'Svingende priser og markedstilgang (sanksjoner, handelshindringer)', angle: 'markeds- og salgsdata' },
];

const SEAFOOD_TRADE: IndustryChallenge[] = [
  { challenge: 'Volatile priser og valuta i eksportmarkedene', angle: 'prising, sikring og analyse i sanntid' },
  { challenge: 'Markedsadgang og handelshindringer (toll, sanksjoner, nye krav i EU/Asia)', angle: 'compliance og dokumentasjonssystemer' },
  { challenge: 'Krav til sporbarhet og dokumentasjon fra kunder og myndigheter (fangstsertifikat, bærekraft)', angle: 'sporbarhetsløsninger og integrasjon med leverandører' },
  { challenge: 'Logistikk for fersk sjømat (fly/bil, kostnad, holdbarhet)', angle: 'logistikk- og ordreoptimalisering' },
  { challenge: 'Råvaretilgang begrenset av kvoter og biomassetak, og press på marginer', angle: 'innkjøps- og lønnsomhetsanalyse' },
];

const SHIPPING: IndustryChallenge[] = [
  { challenge: 'EU ETS for skipsfart og FuelEU Maritime — kvoter og krav til drivstoffets utslipp', angle: 'utslippsdata (MRV), kvoteregnskap og rapportering' },
  { challenge: 'IMOs klimamål og CII-vurdering av hvert skip', angle: 'drifts- og energidata, optimalisering av seilas' },
  { challenge: 'Valg av fremtidig drivstoff og flåtefornyelse (LNG, metanol, ammoniakk, batteri)', angle: 'beslutningsstøtte, tekniske prosjekter' },
  { challenge: 'Mangel på sjøfolk og maritime offiserer', angle: 'bemanning, mannskapsplanlegging og sertifikatstyring' },
  { challenge: 'Cybersikkerhet om bord — nye klassekrav for skip (IACS UR E26/E27)', angle: 'OT-sikkerhet og IT-/OT-kompetanse' },
  { challenge: 'Volatile fraktrater og kostnader', angle: 'kommersielle analyser og flåtestyring' },
];

const FERRY_PASSENGER: IndustryChallenge[] = [
  { challenge: 'Nullutslippskrav i offentlige anbud og elektrifisering med lading', angle: 'energistyring, ladesystemer og driftsdata' },
  { challenge: 'Anbudskonkurranse og kontraktsrisiko', angle: 'kalkyle, dokumentasjon og rapportering til oppdragsgiver' },
  { challenge: 'Regularitet og drift med få marginer', angle: 'vedlikeholdssystemer og sanntidsdata' },
  { challenge: 'Mangel på sjøfolk og maritime offiserer', angle: 'bemanning og mannskapsplanlegging' },
];

const PORT_SERVICES: IndustryChallenge[] = [
  { challenge: 'Landstrøm og elektrifisering av havner', angle: 'energistyring og tekniske prosjekter' },
  { challenge: 'Automatisering og digital havnelogistikk (anløpsplanlegging, slot-booking)', angle: 'systemutvikling og integrasjoner' },
  { challenge: 'Kundenes nye utslippskrav (EU ETS, FuelEU) stiller krav til data fra havnen', angle: 'datadeling og rapportering' },
  { challenge: 'Sikkerhet og beredskap (ISPS) og cyberangrep mot kritisk infrastruktur', angle: 'IT-/OT-sikkerhet' },
  { challenge: 'Kostnadspress og arealknapphet', angle: 'effektivisering og kapasitetsplanlegging' },
];

const SHIPYARD: IndustryChallenge[] = [
  { challenge: 'Konkurranse fra verft i lavkostland (Asia, Tyrkia) og svingende ordrebok', angle: 'effektivisering og bedre prosjektstyring' },
  { challenge: 'Grønne skip og ny teknologi (batteri, hydrogen, metanol) krever ny kompetanse', angle: 'ingeniør- og systemkompetanse' },
  { challenge: 'Mangel på fagarbeidere og ingeniører', angle: 'bemanning og innleie' },
  { challenge: 'Prosjektgjennomføring og kostnadsoverskridelser', angle: 'prosjekt-/PLM-systemer, digitale tvillinger' },
  { challenge: 'Leverandørkjede og materialpriser', angle: 'innkjøps- og planleggingssystemer' },
];

const OFFSHORE_SERVICE: IndustryChallenge[] = [
  { challenge: 'Energiomstillingen og usikker etterspørsel på sokkelen etter 2030', angle: 'strategi- og omstillingsprosjekter' },
  { challenge: 'Havvind som ny vekst, men med usikker lønnsomhet', angle: 'nye tjenester og digitale verktøy' },
  { challenge: 'Kostnadspress fra operatørene', angle: 'effektivisering og automatisering' },
  { challenge: 'Elektrifisering av sokkelen', angle: 'tekniske prosjekter og ingeniørkompetanse' },
  { challenge: 'Kompetanseskifte og sykliske investeringer', angle: 'fleksibel bemanning' },
];

const PUMPS_SUBSEA: IndustryChallenge[] = [
  { challenge: 'Sykliske investeringer i olje og gass', angle: 'fleksibel bemanning gjennom svingningene' },
  { challenge: 'Nye drivstoff (LNG, metanol, ammoniakk) krever nye pumpe- og systemløsninger', angle: 'ingeniør- og utviklingskompetanse' },
  { challenge: 'Ettermarked og service: tilstandsovervåking og prediktivt vedlikehold', angle: 'IoT, dataplattformer og analyse' },
  { challenge: 'Global konkurranse og krav til leveransetid', angle: 'ERP, produksjonsplanlegging og digitalisering' },
  { challenge: 'Mangel på ingeniører og fagarbeidere', angle: 'bemanning og innleie' },
];

const BY_CODE: Record<string, IndustryChallenge[]> = {
  '03.21': AQUACULTURE,
  '03.11': FISHING,
  '46.32': SEAFOOD_TRADE,
  '50.1': FERRY_PASSENGER,
  '50.3': FERRY_PASSENGER,
  '50.2': SHIPPING,
  '50.4': SHIPPING,
  '52.22': PORT_SERVICES,
  '52.24': PORT_SERVICES,
  '77.34': SHIPPING,
  '30.11': SHIPYARD,
  '30.12': SHIPYARD,
  '33.15': SHIPYARD,
  '09.10': OFFSHORE_SERVICE,
  '28.13': PUMPS_SUBSEA,
};

/** The known challenges for a company's maritime NACE code, or [] if unknown. */
export function industryChallengesFor(code: string | null): IndustryChallenge[] {
  if (!code) return [];
  const key = Object.keys(BY_CODE).find((k) => code.startsWith(k));
  return key ? BY_CODE[key] : [];
}
