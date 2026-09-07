import { Orchestrator } from './index';
import { brregProvider } from './providers/brreg';
import { scoreProvider } from './providers/score';
import { fxProvider } from './providers/fx';

function build(): Orchestrator {
  const o = new Orchestrator();
  for (const p of [brregProvider, scoreProvider, fxProvider]) {
    if (p.isEnabled()) o.register(p);
  }
  return o;
}

// Module-level singleton — reused within a warm serverless instance.
export const orchestrator = build();
