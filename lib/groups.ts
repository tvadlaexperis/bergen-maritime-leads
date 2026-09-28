// Company groups ("konsern") for the list and the company page. Pure — no
// I/O — so the rules below are unit-tested; lib/db.ts#recomputeGroups feeds
// it and stores the result.
//
// Brønnøysund's konsernstruktur covers only groups that report as one, and
// many small shipowner families don't (Misje Rederi and Misje Ecobulk both
// 404 there, though they share a website, people and a name). So a group is
// built from three kinds of links, and each group keeps the reasons it was
// formed — the UI shows "registered" and "probable" differently:
//
//   register — same registered top parent, or one is the other's parent
//   domain   — same own website/email domain, AND that domain contains a
//              distinctive word from both names (misje.no ↔ MISJE REDERI,
//              MISJE ECOBULK). The name check keeps a manager's domain
//              (post@obos.no on boat-harbour co-ops) from merging strangers.
//   people   — same daglig leder + a shared distinctive name word, or two
//              shared people (daglig leder/board) + a shared word, or three
//              shared people regardless of name.
import { FREE_MAIL_DOMAINS } from './brreg';
import { GENERIC_NAME_WORDS } from './website';

export interface GroupInput {
  orgnr: string;
  name: string;
  website: string | null;
  email: string | null;
  ceoName: string | null;
  parentOrgnr: string | null;
  rootOrgnr: string | null;
  rootName: string | null;
  people: string[]; // board members (Brreg), ceo excluded or not — deduped here
}

export interface GroupBasis {
  register: string | null; // registered top parent's name (or orgnr) when the register links any of them
  registerCoversAll?: boolean; // true when the register alone links EVERY member (fully documented)
  domains: string[]; // shared domains that linked members
  people: string[]; // shared people that linked members
}

export interface GroupAssignment {
  key: string;
  basis: GroupBasis;
  size: number;
}

const COMPANY_FORMS = new Set(['as', 'asa', 'sa', 'da', 'ans', 'ks', 'nuf', 'ba', 'ltd', 'bv', 'gmbh', 'ab']);

/** Distinctive words in a company name: lower case, 4+ letters, not generic or a company form. */
export function distinctiveWords(name: string): string[] {
  return [
    ...new Set(
      name
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .split(/\s+/)
        .filter((w) => w.length >= 4 && !COMPANY_FORMS.has(w) && !GENERIC_NAME_WORDS.has(w)),
    ),
  ];
}

/** The company's own domain from its website, else its email; null for free-mail providers. */
export function ownDomain(website: string | null, email: string | null): string | null {
  let host: string | null = null;
  if (website) {
    try {
      host = new URL(website).hostname;
    } catch {
      host = null;
    }
  }
  if (!host && email) host = email.split('@')[1] ?? null;
  if (!host) return null;
  host = host.toLowerCase().replace(/^www\./, '');
  if (FREE_MAIL_DOMAINS.has(host)) return null;
  return host;
}

function domainMatchesName(domain: string, words: string[]): boolean {
  const label = domain.split('.')[0].replace(/-/g, '');
  return words.some((w) => label.includes(w));
}

const normPerson = (n: string) => n.toLowerCase().replace(/\s+/g, ' ').trim();

export function computeGroups(companies: GroupInput[]): Map<string, GroupAssignment> {
  const idx = new Map(companies.map((c, i) => [c.orgnr, i]));
  const parent = companies.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const reasons: { a: number; b: number; kind: 'register' | 'domains' | 'people'; value: string }[] = [];
  // A second union over register links only — to tell a fully documented
  // group from one the register only partly explains.
  const regParent = companies.map((_, i) => i);
  const regFind = (i: number): number => (regParent[i] === i ? i : (regParent[i] = regFind(regParent[i])));
  const link = (a: number, b: number, kind: 'register' | 'domains' | 'people', value: string) => {
    if (a === b) return;
    reasons.push({ a, b, kind, value });
    if (kind === 'register') {
      const x = regFind(a);
      const y = regFind(b);
      if (x !== y) regParent[x] = y;
    }
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };

  const words = companies.map((c) => distinctiveWords(c.name));
  const sharesWord = (a: number, b: number) => words[a].some((w) => words[b].includes(w));

  // register: same top parent, same immediate parent, or parent/child both in the list
  const byKey = new Map<string, number[]>();
  const push = (k: string, i: number) => byKey.set(k, [...(byKey.get(k) ?? []), i]);
  companies.forEach((c, i) => {
    if (c.rootOrgnr) push(`root:${c.rootOrgnr}`, i);
    if (c.parentOrgnr) push(`parent:${c.parentOrgnr}`, i);
    if (c.parentOrgnr && idx.has(c.parentOrgnr)) link(i, idx.get(c.parentOrgnr)!, 'register', c.parentOrgnr);
    if (c.rootOrgnr && idx.has(c.rootOrgnr)) link(i, idx.get(c.rootOrgnr)!, 'register', c.rootOrgnr);
  });
  for (const [k, members] of byKey) {
    for (let j = 1; j < members.length; j++) link(members[0], members[j], 'register', k.split(':')[1]);
  }

  // domain
  const byDomain = new Map<string, number[]>();
  companies.forEach((c, i) => {
    const d = ownDomain(c.website, c.email);
    if (d) byDomain.set(d, [...(byDomain.get(d) ?? []), i]);
  });
  for (const [d, members] of byDomain) {
    const ok = members.filter((i) => domainMatchesName(d, words[i]));
    for (let j = 1; j < ok.length; j++) link(ok[0], ok[j], 'domains', d);
  }

  // people
  const peopleOf = companies.map(
    (c) => new Set([c.ceoName, ...c.people].filter((p): p is string => !!p).map(normPerson)),
  );
  const byPerson = new Map<string, number[]>();
  peopleOf.forEach((set, i) => set.forEach((p) => byPerson.set(p, [...(byPerson.get(p) ?? []), i])));
  const pairShared = new Map<string, string[]>();
  for (const [p, members] of byPerson) {
    if (members.length > 25) continue; // a professional board member everywhere says nothing
    for (let x = 0; x < members.length; x++)
      for (let y = x + 1; y < members.length; y++) {
        const k = `${members[x]}|${members[y]}`;
        pairShared.set(k, [...(pairShared.get(k) ?? []), p]);
      }
  }
  for (const [k, shared] of pairShared) {
    const [a, b] = k.split('|').map(Number);
    const ceoA = companies[a].ceoName && normPerson(companies[a].ceoName!);
    const sameCeo = !!ceoA && ceoA === (companies[b].ceoName && normPerson(companies[b].ceoName!));
    const word = sharesWord(a, b);
    if ((sameCeo && word) || (shared.length >= 2 && word) || shared.length >= 3) {
      const byName = new Map<string, string>();
      [companies[a].ceoName, ...companies[a].people].forEach((n) => n && byName.set(normPerson(n), n));
      shared.forEach((p) => link(a, b, 'people', byName.get(p) ?? p));
    }
  }

  // collect
  const groups = new Map<number, number[]>();
  companies.forEach((_, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), i]));
  const out = new Map<string, GroupAssignment>();
  for (const [root, members] of groups) {
    if (members.length < 2) continue;
    const key = `g:${members.map((i) => companies[i].orgnr).sort()[0]}`;
    const mine = reasons.filter((r) => find(r.a) === root);
    const reg = mine.find((r) => r.kind === 'register');
    // Name the group after the top parent most members report (members can
    // sit under different registered roots when people/domain joined them);
    // else the linked company's name; an orgnr alone reads as "org.nr …".
    const rootCounts = new Map<string, number>();
    for (const i of members) {
      const n = companies[i].rootName;
      if (n) rootCounts.set(n, (rootCounts.get(n) ?? 0) + 1);
    }
    const commonRoot = [...rootCounts.entries()].sort((x, y) => y[1] - x[1])[0]?.[0];
    const regName = reg
      ? (commonRoot ?? companies.find((c) => c.orgnr === reg.value)?.name ?? `org.nr ${reg.value}`)
      : null;
    const basis: GroupBasis = {
      register: regName,
      registerCoversAll: !!reg && members.every((i) => regFind(i) === regFind(members[0])),
      domains: [...new Set(mine.filter((r) => r.kind === 'domains').map((r) => r.value))],
      people: [...new Set(mine.filter((r) => r.kind === 'people').map((r) => r.value))].slice(0, 5),
    };
    for (const i of members) out.set(companies[i].orgnr, { key, basis, size: members.length });
  }
  return out;
}

/** One line for the UI: why these companies are shown as one group. */
export function describeGroupBasis(b: GroupBasis): { documented: boolean; partly?: boolean; text: string } {
  const probable = [
    b.domains.length ? `samme nettsted ${b.domains.join(', ')}` : null,
    b.people.length ? `felles personer (${b.people.slice(0, 3).join(', ')})` : null,
  ].filter(Boolean);
  if (b.register && b.registerCoversAll) {
    return {
      documented: true,
      text: `Registrert konsern i Brønnøysund (${b.register})${probable.length ? `, i tillegg ${probable.join(' og ')}` : ''}.`,
    };
  }
  if (b.register) {
    return {
      documented: false,
      partly: true,
      text: `Delvis registrert: noen av selskapene står i Brønnøysund under ${b.register}; resten er koblet via ${probable.join(' og ') || 'andre selskaper i gruppen'}.`,
    };
  }
  return { documented: false, text: `Sannsynlig samme selskapsgruppe: ${probable.join(' og ')}. Ikke registrert som konsern.` };
}
