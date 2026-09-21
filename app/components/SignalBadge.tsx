import type { SignalLevel } from '@/lib/orchestrator/providers/ai';

// Reads the buying signal AI analysis already computed during enrichment
// (lib/scan.ts) — no new fetch, just surfacing a field that today is buried
// on the company detail page. Parsing failures are silent: the badge is a
// bonus signal, never something worth breaking a page render over.
export function parseBuyingSignalLevel(rawAiAnalysis: string | null): SignalLevel | null {
  if (!rawAiAnalysis) return null;
  try {
    const parsed = JSON.parse(rawAiAnalysis) as { buyingSignal?: { level?: SignalLevel } };
    return parsed.buyingSignal?.level ?? null;
  } catch {
    return null;
  }
}

// Only "høy" earns a badge in list contexts — "middels"/"lav" stay visible on
// the company page's own Kjøpssignal tab but would just be noise repeated
// across 600+ rows here.
export default function SignalBadge({ level }: { level: SignalLevel | null }) {
  if (level !== 'høy') return null;
  return (
    <span className="signal-badge" title="AI-analysen har funnet et sterkt kjøpssignal (se «Om selskapet» på selskapssiden)">
      Kjøpssignal
    </span>
  );
}
