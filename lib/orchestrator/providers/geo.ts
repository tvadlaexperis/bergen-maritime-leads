import type { Provider } from '../types';
import { safeFetchText } from '../../http/safeFetch';

// Kartverket's open address register (ws.geonorge.no, NLOD licence, no key)
// turns a company's business address into coordinates for the map. One
// lookup per address; lib/scan.ts only asks again when the address changes.
const HOST = 'ws.geonorge.no';
const BASE = `https://${HOST}/adresser/v1/sok`;

export interface GeoPoint {
  lat: number;
  lon: number;
  /** 'adresse' = the street address itself; 'postnummer' = somewhere in the postcode area (no usable street address, e.g. a PO box). */
  precision: 'adresse' | 'postnummer';
}

type RawResult = { adresser?: { representasjonspunkt?: { lat?: number; lon?: number } }[] };

function firstPoint(json: unknown): { lat: number; lon: number } | null {
  const p = (json as RawResult)?.adresser?.[0]?.representasjonspunkt;
  return p && typeof p.lat === 'number' && typeof p.lon === 'number' ? { lat: p.lat, lon: p.lon } : null;
}

async function search(params: Record<string, string>): Promise<{ lat: number; lon: number } | null> {
  const q = new URLSearchParams({ ...params, treffPerSide: '1' }).toString();
  const body = await safeFetchText(`${BASE}?${q}`, { allowHosts: [HOST], timeoutMs: 8_000, headers: { Accept: 'application/json' } });
  if (!body) return null;
  try {
    return firstPoint(JSON.parse(body));
  } catch {
    return null;
  }
}

async function geocode(args: { address: string | null; postnummer: string | null }): Promise<GeoPoint | null> {
  // "c/o SFL Management AS, Bryggegata 3" — the street is the part that
  // isn't a c/o line or a PO box. But "c/o <a person>" usually means the
  // company is registered at someone's home: then only the postcode area is
  // used (GDPR — same reason sole proprietorships aren't placed at all).
  const parts = (args.address ?? '').split(',').map((p) => p.trim());
  const careOf = parts.find((p) => /^c\s*\/\s*o\b/i.test(p));
  const careOfPerson = !!careOf && !/\b(AS|A\/S|ASA|SA|DA|ANS|KS|NUF|BA|AB|LTD|GMBH|KOMMUNE|HAVN)\b/i.test(careOf);
  const street = careOfPerson
    ? ''
    : (parts.find((p) => p && !/^c\s*\/\s*o\b/i.test(p) && !/^(postboks|pb\.?|boks)\b/i.test(p)) ?? '');
  const isStreet = !!street;
  if (isStreet && args.postnummer) {
    const p = await search({ sok: street, postnummer: args.postnummer });
    if (p) return { ...p, precision: 'adresse' };
  }
  if (args.postnummer) {
    const p = await search({ postnummer: args.postnummer });
    if (p) return { ...p, precision: 'postnummer' };
  }
  return null;
}

export const geoProvider: Provider = {
  id: 'geo',
  tools: ['geocode'],
  isEnabled: () => true,
  async call(tool, args) {
    if (tool === 'geocode') return geocode(args as { address: string | null; postnummer: string | null });
    throw new Error(`geo: unknown tool ${tool}`);
  },
};
