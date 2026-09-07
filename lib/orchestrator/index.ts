import type { Provider, ToolResult } from './types';

const DEFAULT_TIMEOUT_MS = 15_000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

// Routes namespaced tools (`gdelt.search`, `score.compute`, …) to isolated
// providers. Modeled on ../../Other Projects/minaksjeportal's Orchestrator.
// Providers run in-process for now; the interface is MCP-shaped so they can be
// extracted into real MCP servers later (docs/02-architecture.md, roadmap §5).
export class Orchestrator {
  private providers = new Map<string, Provider>();
  private toolMap = new Map<string, Provider>();

  register(p: Provider): this {
    this.providers.set(p.id, p);
    for (const t of p.tools) this.toolMap.set(`${p.id}.${t}`, p);
    return this;
  }

  listTools(): string[] {
    return [...this.toolMap.keys()];
  }

  hasProvider(id: string): boolean {
    return this.providers.has(id);
  }

  async callTool<T = unknown>(
    name: string,
    args: Record<string, unknown> = {},
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ): Promise<ToolResult<T>> {
    const started = Date.now();
    const provider = this.toolMap.get(name);
    if (!provider) {
      return { ok: false, error: `unknown tool: ${name}`, provider: '-', tookMs: 0 };
    }
    if (!provider.isEnabled()) {
      return { ok: false, error: 'provider not configured', provider: provider.id, tookMs: 0 };
    }
    const toolName = name.slice(provider.id.length + 1);
    try {
      const data = (await withTimeout(provider.call(toolName, args), timeoutMs)) as T;
      return { ok: true, data, provider: provider.id, tookMs: Date.now() - started };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { ok: false, error: message, provider: provider.id, tookMs: Date.now() - started };
    }
  }
}
