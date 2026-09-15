import { Orchestrator } from './index';
import { brregProvider } from './providers/brreg';
import { scoreProvider } from './providers/score';
import { fxProvider } from './providers/fx';
import { newsProvider } from './providers/news';
import { aiProvider } from './providers/ai';

function build(): Orchestrator {
  const o = new Orchestrator();
  for (const p of [brregProvider, scoreProvider, fxProvider, newsProvider, aiProvider]) {
    if (p.isEnabled()) o.register(p);
  }
  return o;
}

// Module-level singleton — reused within a warm serverless instance.
export const orchestrator = build();
