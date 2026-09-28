import { describe, it, expect } from 'vitest';
import { parseFeedPage, parseAd, isCandidate, employerNameKeys } from './jobAds';

describe('parseFeedPage', () => {
  it('reads the feed lines and the next page', () => {
    const page = parseFeedPage({
      next_url: '/api/v1/feed/abc',
      items: [
        {
          id: 'u1',
          url: '/api/v1/feed/u1',
          _feed_entry: { uuid: 'u1', status: 'ACTIVE', businessName: 'Wilson Management AS', municipal: 'BERGEN', sistEndret: '2026-09-27T10:00:00+02:00' },
        },
        { id: 'broken' },
      ],
    });
    expect(page.nextUrl).toBe('/api/v1/feed/abc');
    expect(page.lines).toEqual([
      { uuid: 'u1', url: '/api/v1/feed/u1', status: 'ACTIVE', businessName: 'Wilson Management AS', municipal: 'BERGEN', modified: '2026-09-27T10:00:00+02:00' },
    ]);
  });
});

describe('parseAd', () => {
  const ad = {
    ad_content: {
      title: 'Systemutvikler .NET',
      jobtitle: 'Utvikler',
      employer: { name: 'Wilson Management AS', orgnr: '972418331' },
      occupationCategories: [{ level1: 'IT', level2: 'Utvikling' }],
      workLocations: [{ city: 'BERGEN', municipal: 'BERGEN' }],
      published: '2026-09-20T08:00:00',
      expires: '2026-10-20T00:00:00',
      applicationDue: 'Snarest',
      contactList: [{ name: 'Kari Nordmann', title: 'IT-sjef', email: 'kno@wilsonship.no', phone: '+47 900 00 000' }, { name: '' }],
    },
  };
  it('picks out the fields we show, and flags IT roles', () => {
    expect(parseAd(ad, 'u1')).toEqual({
      uuid: 'u1',
      employerOrgnr: '972418331',
      employerName: 'Wilson Management AS',
      title: 'Systemutvikler .NET',
      jobTitle: 'Utvikler',
      occupation: 'IT / Utvikling',
      location: 'BERGEN',
      published: '2026-09-20',
      expires: '2026-10-20',
      applicationDue: 'Snarest',
      sourceUrl: 'https://arbeidsplassen.nav.no/stillinger/stilling/u1',
      contacts: [{ name: 'Kari Nordmann', title: 'IT-sjef', email: 'kno@wilsonship.no', phone: '+47 900 00 000' }],
      isTech: true,
    });
  });
  it('does not flag non-tech roles, and returns null for stopped (emptied) ads', () => {
    const cook = { ad_content: { title: 'Kokk på MS Nordlys', occupationCategories: [{ level1: 'Reiseliv og mat', level2: 'Kokk' }] } };
    expect(parseAd(cook, 'u2')?.isTech).toBe(false);
    const superintendent = { ad_content: { title: 'Technical Superintendent', occupationCategories: [{ level1: 'Industri og produksjon', level2: 'Maskinist' }] } };
    expect(parseAd(superintendent, 'u4')?.isTech).toBe(false);
    const architect = { ad_content: { title: 'Arkitekt – bolig og næring' } };
    expect(parseAd(architect, 'u5')?.isTech).toBe(false);
    expect(parseAd({ ad_content: { title: 'Løsningsarkitekt Azure' } }, 'u6')?.isTech).toBe(true);
    expect(parseAd({ ad_content: { title: 'IT-konsulent' } }, 'u7')?.isTech).toBe(true);
    expect(parseAd({ status: 'INACTIVE' }, 'u3')).toBeNull();
  });
});

describe('isCandidate', () => {
  const muni = new Set(['BERGEN']);
  const words = new Set(['wilson', 'misje']);
  const line = (p: Partial<{ status: string; municipal: string | null; businessName: string | null }>) => ({
    uuid: 'x',
    url: '/x',
    modified: null,
    status: 'ACTIVE',
    municipal: null,
    businessName: null,
    ...p,
  });
  it('keeps active ads in our municipalities or from employers named like ours', () => {
    expect(isCandidate(line({ municipal: 'Bergen' }), muni, words)).toBe(true);
    expect(isCandidate(line({ municipal: 'OSLO', businessName: 'Wilson Agency Norge AS' }), muni, words)).toBe(true);
    expect(isCandidate(line({ municipal: 'OSLO', businessName: 'Tine SA' }), muni, words)).toBe(false);
    expect(isCandidate(line({ municipal: 'BERGEN', status: 'INACTIVE' }), muni, words)).toBe(false);
  });
  it('matches employers on the distinctive first name word only', () => {
    const keys = employerNameKeys(['ODFJELL DRILLING AS', 'NORDIC SCALLOPS AS', 'HK CREW AS', 'WILSON MANAGEMENT AS']);
    expect([...keys].sort()).toEqual(['odfjell', 'wilson']);
    expect(isCandidate(line({ municipal: 'TANANGER', businessName: 'Odfjell Technology AS' }), muni, keys)).toBe(true);
    expect(isCandidate(line({ municipal: 'KONGSVINGER', businessName: 'SCHÜTZ Nordic AS' }), muni, keys)).toBe(false);
  });
});
