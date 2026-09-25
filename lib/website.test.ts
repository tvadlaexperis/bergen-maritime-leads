import { describe, it, expect } from 'vitest';
import { stripHtml, findLikelyContactPages, contactPageCandidates, siteMentionsCompany } from './website';

describe('stripHtml', () => {
  it('removes tags, scripts and styles, decoding common entities', () => {
    const html = `
      <html><head><style>.x{color:red}</style><script>alert(1)</script></head>
      <body><h1>Roald Misje</h1><p>CEO &amp; Technical Manager</p><p>rm@misje.no</p></body></html>
    `;
    const text = stripHtml(html);
    expect(text).toContain('Roald Misje');
    expect(text).toContain('CEO & Technical Manager');
    expect(text).toContain('rm@misje.no');
    expect(text).not.toContain('alert(1)');
    expect(text).not.toContain('color:red');
  });

  it('decodes Norwegian letters and numeric entities', () => {
    expect(stripHtml('Sj&oslash;transport &Aring;s')).toBe('Sjøtransport Ås');
    expect(stripHtml('&#216;degaard')).toBe('Ødegaard');
  });
});

describe('findLikelyContactPages', () => {
  it('picks up a same-site "about us" link over an unrelated one', () => {
    const html = `
      <a href="/about-us">Read more about us</a>
      <a href="/products">Our products</a>
    `;
    const links = findLikelyContactPages(html, 'https://misje.no/');
    expect(links).toEqual(['https://misje.no/about-us']);
  });

  it('ranks a link matching both href and text above one matching only href', () => {
    const html = `
      <a href="/kontakt">Se her</a>
      <a href="/kontakt-oss">Kontakt oss</a>
    `;
    const links = findLikelyContactPages(html, 'https://firma.no');
    expect(links[0]).toBe('https://firma.no/kontakt-oss');
  });

  it('resolves relative hrefs and drops links to other domains', () => {
    const html = `
      <a href="team">Vårt team</a>
      <a href="https://linkedin.com/company/firma/people">LinkedIn</a>
    `;
    const links = findLikelyContactPages(html, 'https://firma.no/about/');
    expect(links).toEqual(['https://firma.no/about/team']);
  });

  it('returns [] for no matches or an unparsable base URL', () => {
    expect(findLikelyContactPages('<a href="/products">Products</a>', 'https://firma.no')).toEqual([]);
    expect(findLikelyContactPages('<a href="/about">About</a>', 'not-a-url')).toEqual([]);
  });

  it('caps results to the requested limit, best matches first', () => {
    const html = `
      <a href="/team">Team</a>
      <a href="/about-us">About us</a>
      <a href="/contact">Contact</a>
      <a href="/ansatte">Ansatte</a>
    `;
    const links = findLikelyContactPages(html, 'https://firma.no', 2);
    expect(links).toHaveLength(2);
  });
});

describe('contactPageCandidates', () => {
  it('treats www and bare host as the same site', () => {
    const html = '<a href="https://www.firma.no/kontakt">Kontakt</a><a href="https://annet.no/team">Team</a>';
    expect(contactPageCandidates(html, 'https://firma.no', 1)).toEqual(['https://www.firma.no/kontakt']);
  });
  it('tops up with common paths, without duplicates', () => {
    const html = '<a href="/kontakt">Kontakt oss</a>';
    expect(contactPageCandidates(html, 'https://firma.no', 3)).toEqual([
      'https://firma.no/kontakt',
      'https://firma.no/om-oss',
      'https://firma.no/ansatte',
    ]);
  });
});

describe('siteMentionsCompany', () => {
  it('accepts a page naming the company', () => {
    expect(siteMentionsCompany('<h1>Beerenberg</h1><p>Welcome</p>', 'BEERENBERG SERVICES AS', '123456789')).toBe(true);
    expect(siteMentionsCompany('<p>Bergen Marine Service AS</p>', 'BERGEN MARINE SERVICE AS', '123456789')).toBe(true);
    expect(siteMentionsCompany('<footer>Org.nr 996 824 888</footer>', 'NOE HELT ANNET AS', '996824888')).toBe(true);
  });
  it("rejects a manager's or group's site", () => {
    expect(siteMentionsCompany('<h1>OBOS</h1><p>Bolig i Bergen</p>', 'ELSESRO BÅTHAVN SA', '912345678')).toBe(false);
    // Only generic words shared: not enough.
    expect(siteMentionsCompany('<p>Marine services in Bergen</p>', 'BERGEN MARINE SERVICE AS', '123456789')).toBe(false);
  });
});
