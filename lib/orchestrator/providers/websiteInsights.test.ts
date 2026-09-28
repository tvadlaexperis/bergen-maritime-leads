import { describe, it, expect } from 'vitest';
import { verifyWebsiteInsights } from './ai';

const page = 'https://firma.no/om-oss';
const text = `--- ${page} ---\nVi drifter flåten med ShipNet og har eget IT-team på fem utviklere. Data lagres i Microsoft Azure.`;

describe('verifyWebsiteInsights', () => {
  it('keeps technologies whose name and quote are in the text and whose source was read', () => {
    const out = verifyWebsiteInsights(
      {
        contacts: [],
        // @ts-expect-error — the model's raw extra fields
        technologies: [
          { name: 'ShipNet', category: 'maritime systemer', evidence: 'Vi drifter flåten med ShipNet', sourceUrl: page },
          { name: 'Microsoft Azure', category: 'sky og plattform', evidence: 'Data lagres i Microsoft Azure', sourceUrl: page },
          { name: 'SAP', category: 'ERP/CRM', evidence: 'Vi bruker SAP', sourceUrl: page }, // not in the text
          { name: 'ShipNet', category: 'annet', evidence: 'Vi drifter flåten med ShipNet', sourceUrl: 'https://annen.no' }, // page not read
        ],
        itEnvironment: { value: 'ja', evidence: 'har eget IT-team på fem utviklere' },
        digitalProducts: { value: 'ja', evidence: 'Vi selger egen programvare' }, // not in the text
      },
      text,
      [page],
    );
    expect(out.technologies.map((t) => t.name)).toEqual(['ShipNet', 'Microsoft Azure']);
    expect(out.itEnvironment).toEqual({ value: 'ja', evidence: 'har eget IT-team på fem utviklere' });
    expect(out.digitalProducts).toEqual({ value: 'ukjent', evidence: null });
  });
});
