// Turns a scan's raw error list (one entry per company per failed call, often
// dozens of identical Gemini JSON blobs) into a few readable groups for the
// admin "Siste skann" details: which step failed, the actual message, how
// many companies it hit, and — for the errors we recognise — what to do.

export interface ScanErrorGroup {
  step: string; // human label, e.g. "Nettsidesøk"
  message: string; // cleaned message, identical within the group
  hint: string | null; // what to do about it, when we know
  count: number;
  orgnrs: string[];
}

const STEP_LABELS: Record<string, string> = {
  'ai.analyze': 'AI-vurdering',
  'ai.findWebsite': 'Nettsidesøk',
  'ai.extractContacts': 'Kontakter fra nettside',
  ai: 'AI',
  regnskap: 'Regnskap (Brreg)',
  roller: 'Roller (Brreg)',
  score: 'Score',
  brreg: 'Brreg',
  discover: 'Oppdagelse',
  discovery: 'Oppdagelse',
  refresh: 'Oppdatering',
};

// Google's error bodies are JSON with the useful sentence in `"message"`,
// followed by boilerplate links — keep just that first sentence.
export function cleanErrorMessage(raw: string): string {
  let msg = raw;
  const json = raw.match(/"message"\s*:\s*"([^"]+)/);
  if (json) {
    const status = raw.match(/HTTP (\d{3})/)?.[1];
    const sentence = json[1].split(/(?<=\.)\s/)[0];
    msg = `${status ? `HTTP ${status}: ` : ''}${sentence}`;
  }
  // Durations vary per call (clipped to the run's remaining budget) — drop
  // them so otherwise identical timeouts group together.
  return msg
    .replace(/timeout after \d+ms/i, 'tidsavbrudd')
    .replace(/tidsavbrudd etter \d+ s/i, 'tidsavbrudd')
    .replace(/^Gemini\s+/, '')
    .trim();
}

function hintFor(message: string, step: string): string | null {
  if (/429/.test(message) && /quota|billing|kvote/i.test(message)) {
    return 'Gemini-kvoten er brukt opp. Slå på fakturering for prosjektet til GEMINI_API_KEY i Google AI Studio (aistudio.google.com → API keys → Set up billing).';
  }
  if (/429/.test(message)) return 'For mange kall per minutt — «Kjør AI-køen» venter og prøver igjen automatisk.';
  if (/tidsavbrudd/i.test(message)) {
    return step.startsWith('Nettside') || step.startsWith('Kontakter') || step.startsWith('AI')
      ? 'Gemini svarte ikke innen tidsgrensen for kjøringen — selskapet prøves igjen senere.'
      : 'Brønnøysund svarte ikke i tide — prøves igjen ved neste kjøring.';
  }
  if (/HTTP 5\d\d/.test(message)) return 'Feil hos tjenesten selv — prøves igjen ved neste kjøring.';
  return null;
}

export function groupScanErrors(errors: { scope: string; message: string }[]): ScanErrorGroup[] {
  const groups = new Map<string, ScanErrorGroup>();
  for (const e of errors) {
    const [key, ...rest] = e.scope.split(' ');
    const step = STEP_LABELS[key] ?? key;
    const message = cleanErrorMessage(e.message);
    const id = `${step}\u0000${message}`;
    let g = groups.get(id);
    if (!g) groups.set(id, (g = { step, message, hint: hintFor(message, step), count: 0, orgnrs: [] }));
    g.count++;
    const orgnr = rest.join(' ');
    if (/^\d{9}$/.test(orgnr)) g.orgnrs.push(orgnr);
  }
  return [...groups.values()].sort((a, b) => b.count - a.count);
}
