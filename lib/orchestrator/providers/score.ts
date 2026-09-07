import type { Provider } from '../types';
import { computeLeadScore, type LeadScoreResult } from '../../score';
import type { CompanyFinancials } from '../../types';

export type { LeadScoreResult } from '../../score';
export { scoreBand } from '../../score';

export const scoreProvider: Provider = {
  id: 'score',
  tools: ['compute'],
  isEnabled: () => true,
  async call(tool, args) {
    if (tool !== 'compute') throw new Error(`score: unknown tool ${tool}`);
    const { employees, financials } = args as {
      employees: number | null;
      financials: CompanyFinancials[];
    };
    return computeLeadScore({ employees: employees ?? null, financials: financials ?? [] });
  },
};

export type { LeadScoreResult as ScoreResult };
