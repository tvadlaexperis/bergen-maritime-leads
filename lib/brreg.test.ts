import { describe, it, expect } from 'vitest';
import { normalizeEnhet, parseEnhetPage, parseRegnskap, parseDagligLeder, parseKonsernstruktur, isValidOrgnr } from './brreg';
import { matchNace } from '../data/maritime-sectors.mjs';

const rawEnhet = {
  organisasjonsnummer: '971171898',
  navn: 'ALIMAK GROUP NORWAY AS',
  organisasjonsform: { kode: 'AS', beskrivelse: 'Aksjeselskap' },
  naeringskode1: { kode: '30.110', beskrivelse: 'Bygging av sivile skip og flytende materiell' },
  naeringskode2: { kode: '71.129', beskrivelse: 'Annen teknisk konsulentvirksomhet' },
  antallAnsatte: 60,
  telefon: '55 93 60 20',
  forretningsadresse: {
    adresse: ['Godviksvingene 128'],
    postnummer: '5179',
    poststed: 'GODVIK',
    kommune: 'BERGEN',
    kommunenummer: '4601',
  },
  registreringsdatoEnhetsregisteret: '1995-03-12',
  sisteInnsendteAarsregnskap: '2025',
  registrertIMvaregisteret: true,
  konkurs: false,
};

describe('normalizeEnhet', () => {
  const c = normalizeEnhet(rawEnhet as never);
  it('pulls the core facts', () => {
    expect(c.orgnr).toBe('971171898');
    expect(c.employees).toBe(60);
    expect(c.poststed).toBe('GODVIK');
    expect(c.kommunenummer).toBe('4601');
    expect(c.nace.map((n) => n.code)).toEqual(['30.110', '71.129']);
    expect(c.inMva).toBe(true);
    expect(c.bankrupt).toBe(false);
  });
});

describe('parseEnhetPage', () => {
  it('reads the embedded list and paging', () => {
    const page = parseEnhetPage({
      _embedded: { enheter: [rawEnhet] },
      page: { number: 0, totalPages: 3, totalElements: 42 },
    });
    expect(page.companies).toHaveLength(1);
    expect(page.totalPages).toBe(3);
    expect(page.totalElements).toBe(42);
  });
});

describe('parseRegnskap', () => {
  it('extracts revenue and results per year, newest first', () => {
    const rows = parseRegnskap([
      {
        regnskapsperiode: { tilDato: '2024-12-31' },
        valuta: 'NOK',
        resultatregnskapResultat: {
          aarsresultat: 5_335_708,
          driftsresultat: { driftsresultat: 5_935_439, driftsinntekter: { sumDriftsinntekter: 199_435_703 } },
        },
        egenkapitalGjeld: { egenkapital: { sumEgenkapital: 23_503_198 }, gjeldOversikt: { sumGjeld: 71_916_613 } },
        eiendeler: { sumEiendeler: 95_419_812 },
      },
      {
        regnskapsperiode: { tilDato: '2023-12-31' },
        resultatregnskapResultat: { driftsresultat: { driftsinntekter: { sumDriftsinntekter: 180_000_000 } } },
      },
    ]);
    expect(rows.map((r) => r.year)).toEqual([2024, 2023]);
    expect(rows[0].revenue).toBe(199_435_703);
    expect(rows[0].operatingResult).toBe(5_935_439);
    expect(rows[0].equity).toBe(23_503_198);
  });

  it('returns [] for a non-array', () => {
    expect(parseRegnskap({})).toEqual([]);
    expect(parseRegnskap(null)).toEqual([]);
  });
});

describe('isValidOrgnr', () => {
  it('accepts a valid number and rejects a bad check digit', () => {
    expect(isValidOrgnr('971171898')).toBe(true);
    expect(isValidOrgnr('971171899')).toBe(false);
    expect(isValidOrgnr('12345')).toBe(false);
  });
});

describe('parseDagligLeder', () => {
  it('reads the active daglig leder from a rollegruppe', () => {
    const name = parseDagligLeder({
      rollegrupper: [
        {
          type: { kode: 'DAGL' },
          roller: [{ type: { kode: 'DAGL' }, person: { navn: { fornavn: 'Audun', etternavn: 'Grimsland' } }, avregistrert: false }],
        },
        { type: { kode: 'STYR' }, roller: [] },
      ],
    });
    expect(name).toBe('Audun Grimsland');
  });

  it('includes a mellomnavn when present', () => {
    const name = parseDagligLeder({
      rollegrupper: [
        {
          type: { kode: 'DAGL' },
          roller: [{ person: { navn: { fornavn: 'Ingrid Sara', mellomnavn: 'Petersson', etternavn: 'Punkki' } }, avregistrert: false }],
        },
      ],
    });
    expect(name).toBe('Ingrid Sara Petersson Punkki');
  });

  it('skips a deregistered or deceased role holder', () => {
    const name = parseDagligLeder({
      rollegrupper: [
        {
          type: { kode: 'DAGL' },
          roller: [{ person: { navn: { fornavn: 'Gammel', etternavn: 'Leder' } }, avregistrert: true }],
        },
      ],
    });
    expect(name).toBeNull();
  });

  it('returns null when there is no DAGL group or malformed input', () => {
    expect(parseDagligLeder({ rollegrupper: [{ type: { kode: 'STYR' }, roller: [] }] })).toBeNull();
    expect(parseDagligLeder({})).toBeNull();
    expect(parseDagligLeder(null)).toBeNull();
  });
});

describe('parseKonsernstruktur', () => {
  const tree = {
    organisasjonsnummer: '926118056',
    navn: 'ODFJELL RIG OWNING LTD',
    children: [
      {
        organisasjonsnummer: '984669151',
        navn: 'ODFJELL DRILLING AS',
        parentOrganisasjonsnummer: '926118056',
        parentNavn: 'ODFJELL RIG OWNING LTD',
        children: [
          {
            organisasjonsnummer: '883462092',
            navn: 'DEEP SEA MANAGEMENT AS',
            parentOrganisasjonsnummer: '984669151',
            parentNavn: 'ODFJELL DRILLING AS',
          },
        ],
      },
    ],
  };

  it('finds the immediate parent of a nested member', () => {
    const info = parseKonsernstruktur(tree, '883462092');
    expect(info).toEqual({ parentOrgnr: '984669151', parentName: 'ODFJELL DRILLING AS' });
  });

  it('returns a null parent when the queried company is the root', () => {
    const info = parseKonsernstruktur(tree, '926118056');
    expect(info).toEqual({ parentOrgnr: null, parentName: null });
  });

  it('returns null when the target orgnr is not in the tree at all', () => {
    expect(parseKonsernstruktur(tree, '000000000')).toBeNull();
  });

  it('returns null for malformed input', () => {
    expect(parseKonsernstruktur({}, '883462092')).toBeNull();
    expect(parseKonsernstruktur(null, '883462092')).toBeNull();
  });
});

describe('matchNace', () => {
  it('matches maritime codes and rejects others', () => {
    expect(matchNace(['30.110'])?.group).toBe('Verft & bygging');
    expect(matchNace(['50.101'])?.group).toBe('Sjøtransport');
    expect(matchNace(['41.000', '71.129'])).toBeNull();
  });
});
