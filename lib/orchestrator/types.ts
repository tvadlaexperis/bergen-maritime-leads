// JSON-serializable shape at the provider boundary, so a provider can later be
// extracted into a real MCP stdio server without changing callers
// (docs/02-architecture.md).

export type ToolResult<T = unknown> =
  | { ok: true; data: T; provider: string; tookMs: number }
  | { ok: false; error: string; provider: string; tookMs: number };

export interface Provider {
  /** namespace — tools are exposed as `${id}.${toolName}` */
  id: string;
  /** tool names this provider answers (without the namespace) */
  tools: string[];
  /** true only when the provider is configured (env vars present) */
  isEnabled(): boolean;
  call(toolName: string, args: Record<string, unknown>): Promise<unknown>;
}
