import { isValidOrgnr } from './brreg';

export type OrgnrResult = { ok: true; orgnr: string } | { ok: false; error: string };

// Accepts "912 345 678", "912345678", "NO 912 345 678 MVA" etc.
export function parseOrgnr(raw: string): OrgnrResult {
  const digits = (raw ?? '').replace(/\D/g, '');
  const orgnr = digits.length === 12 && digits.startsWith('47') ? digits.slice(3) : digits;
  if (orgnr.length !== 9) return { ok: false, error: 'Et organisasjonsnummer har 9 siffer.' };
  if (!isValidOrgnr(orgnr)) return { ok: false, error: 'Ugyldig organisasjonsnummer (feil kontrollsiffer).' };
  return { ok: true, orgnr };
}
