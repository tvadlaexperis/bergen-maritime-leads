import { orchestrator } from './orchestrator/boot';
import type { FxRate } from './orchestrator/providers/fx';

// Header ticker rates. Best-effort — returns [] on any failure so the header
// just omits the strip.
export async function getFxRates(): Promise<FxRate[]> {
  if (!orchestrator.hasProvider('fx')) return [];
  const res = await orchestrator.callTool<FxRate[]>('fx.rates', {}, 12_000);
  return res.ok ? res.data : [];
}

export type { FxRate } from './orchestrator/providers/fx';
