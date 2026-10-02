// The work list (formerly «Favoritter»): org numbers kept in this browser's
// localStorage under the old favorites key, so existing stars carry over.
// Shared by the company list and the map popup; WORKLIST_EVENT tells other
// components on the page that it changed.
export const WORKLIST_KEY = 'bml.companyList.favorites.v1';
export const WORKLIST_EVENT = 'worklist-changed';

export function readWorklist(): Set<string> {
  try {
    const raw = window.localStorage.getItem(WORKLIST_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export function writeWorklist(list: Set<string>): void {
  try {
    window.localStorage.setItem(WORKLIST_KEY, JSON.stringify([...list]));
  } catch {
    // storage blocked (private mode) — the change lives until reload
  }
  window.dispatchEvent(new Event(WORKLIST_EVENT));
}

/** Adds or removes one company; returns whether it's on the list afterwards. */
export function toggleWorklist(orgnr: string): boolean {
  const list = readWorklist();
  const on = !list.has(orgnr);
  if (on) list.add(orgnr);
  else list.delete(orgnr);
  writeWorklist(list);
  return on;
}
