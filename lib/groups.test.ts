import { describe, it, expect } from 'vitest';
import { computeGroups, distinctiveWords, ownDomain, describeGroupBasis, type GroupInput } from './groups';

const co = (p: Partial<GroupInput> & { orgnr: string; name: string }): GroupInput => ({
  website: null,
  email: null,
  ceoName: null,
  parentOrgnr: null,
  rootOrgnr: null,
  rootName: null,
  people: [],
  ...p,
});

describe('distinctiveWords / ownDomain', () => {
  it('drops company forms and generic words', () => {
    expect(distinctiveWords('MISJE REDERI AS')).toEqual(['misje']);
    expect(distinctiveWords('BERGEN MARINE SERVICE AS')).toEqual([]);
  });
  it('prefers the website, falls back to email, ignores free mail', () => {
    expect(ownDomain('https://www.misje.no/om', null)).toBe('misje.no');
    expect(ownDomain(null, 'post@misje.no')).toBe('misje.no');
    expect(ownDomain(null, 'ola@gmail.com')).toBeNull();
  });
});

describe('computeGroups', () => {
  it('groups the Misje companies by domain and people although Brreg has no group for them', () => {
    const g = computeGroups([
      co({ orgnr: '931918060', name: 'MISJE REDERI AS', website: 'https://misje.no', ceoName: 'Roald Misje' }),
      co({ orgnr: '924716541', name: 'MISJE ECOBULK AS', email: 'post@misje.no', ceoName: 'Roald Misje' }),
      co({
        orgnr: '916166184',
        name: 'MISJE CHARTERING AS',
        website: 'https://www.misje.no',
        ceoName: 'Alina Printseva',
        parentOrgnr: '980127567',
        rootOrgnr: '980127567',
        rootName: 'NIMI II AS',
      }),
      co({ orgnr: '111111111', name: 'ANNET REDERI AS', website: 'https://annet.no' }),
    ]);
    expect(g.get('931918060')?.key).toBe(g.get('916166184')?.key);
    expect(g.get('924716541')?.key).toBe(g.get('931918060')?.key);
    expect(g.get('931918060')?.size).toBe(3);
    expect(g.get('931918060')?.basis.domains).toEqual(['misje.no']);
    expect(g.get('931918060')?.basis.people).toContain('Roald Misje');
    // Only Chartering is registered (under NIMI II) — the rest is inferred.
    expect(describeGroupBasis(g.get('931918060')!.basis)).toMatchObject({ documented: false });
    expect(g.has('111111111')).toBe(false);
  });

  it("does not merge strangers on a manager's shared domain", () => {
    const g = computeGroups([
      co({ orgnr: '1', name: 'ELSESRO BÅTHAVN SA', email: 'post@obos.no' }),
      co({ orgnr: '2', name: 'KALVEDALEN BÅTLAG SA', email: 'post@obos.no' }),
    ]);
    expect(g.size).toBe(0);
  });

  it('groups registered siblings under the same top parent, with the register as basis', () => {
    const g = computeGroups([
      co({ orgnr: '1', name: 'ODFJELL DRILLING AS', parentOrgnr: '9', rootOrgnr: '9', rootName: 'ODFJELL RIG OWNING LTD' }),
      co({ orgnr: '2', name: 'DEEP SEA MANAGEMENT AS', parentOrgnr: '1', rootOrgnr: '9', rootName: 'ODFJELL RIG OWNING LTD' }),
    ]);
    expect(g.get('1')?.key).toBe(g.get('2')?.key);
    expect(describeGroupBasis(g.get('1')!.basis)).toEqual({
      documented: true,
      text: 'Registrert konsern i Brønnøysund (ODFJELL RIG OWNING LTD).',
    });
  });

  it('needs more than one shared board member unless the names also match', () => {
    const one = computeGroups([
      co({ orgnr: '1', name: 'ALFA SHIPPING AS', people: ['Kari Nordmann'] }),
      co({ orgnr: '2', name: 'BETA OFFSHORE AS', people: ['Kari Nordmann'] }),
    ]);
    expect(one.size).toBe(0);
    const three = computeGroups([
      co({ orgnr: '1', name: 'ALFA SHIPPING AS', ceoName: 'A B', people: ['C D', 'E F'] }),
      co({ orgnr: '2', name: 'BETA OFFSHORE AS', ceoName: 'A B', people: ['C D', 'E F'] }),
    ]);
    expect(three.size).toBe(2);
  });
});
