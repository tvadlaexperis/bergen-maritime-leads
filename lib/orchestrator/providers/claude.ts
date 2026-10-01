import { safeFetchResult } from '../../http/safeFetch';

// Anthropic Claude as the AI backend (lib/orchestrator/providers/ai.ts picks
// it when ANTHROPIC_API_KEY is set). Haiku 4.5 by default — the cheapest
// Claude model, plenty for structured lead analysis; CLAUDE_MODEL overrides.
// API data isn't used for training by default, so contacts read off
// websites can go here too (unlike Gemini's free tier).
const HOST = 'api.anthropic.com';
const URL = `https://${HOST}/v1/messages`;
const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

export const claudeModel = () => process.env.CLAUDE_MODEL?.trim() || DEFAULT_MODEL;

type Block =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; name: string; input: unknown }
  | { type: string; [k: string]: unknown };

/**
 * One Messages API call → the answer as text.
 * - `schema`: the answer is forced through a tool with that input schema and
 *   returned as JSON text (same contract as Gemini's structured output).
 * - `search`: Claude's own web search tool (billed per search); the answer is
 *   the text written after the last search result, without the
 *   "I'll search for…" preamble.
 * Throws with the API's reason on errors, like geminiText.
 */
export async function claudeText(
  prompt: string,
  opts: { schema?: object; search?: boolean; maxTokens?: number } = {},
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('Claude: ANTHROPIC_API_KEY mangler');

  const body: Record<string, unknown> = {
    model: claudeModel(),
    max_tokens: opts.maxTokens ?? 4096,
    messages: [{ role: 'user', content: prompt }],
  };
  if (opts.schema) {
    body.tools = [{ name: 'svar', description: 'Gi svaret i dette formatet.', input_schema: opts.schema }];
    body.tool_choice = { type: 'tool', name: 'svar' };
  } else if (opts.search) {
    // Each search is billed, and its results come back as input tokens
    // (often 10-20k) — two searches is plenty for "find the website" / news.
    body.tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: 2 }];
  }

  const res = await safeFetchResult(URL, {
    allowHosts: [HOST],
    method: 'POST',
    timeoutMs: 55_000,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Claude ${res.reason}`);

  let data: { content?: Block[]; stop_reason?: string };
  try {
    data = JSON.parse(res.text);
  } catch {
    throw new Error('Claude: svaret var ikke gyldig JSON');
  }
  const content = data.content ?? [];

  if (opts.schema) {
    const call = content.find((b): b is Extract<Block, { type: 'tool_use' }> => b.type === 'tool_use');
    if (!call) throw new Error(`Claude: fikk ikke strukturert svar (stopp: ${data.stop_reason ?? 'ukjent'})`);
    return JSON.stringify(call.input);
  }

  const lastResult = content.map((b) => b.type).lastIndexOf('web_search_tool_result');
  const text = content
    .slice(lastResult + 1)
    .filter((b): b is Extract<Block, { type: 'text' }> => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
  if (!text) throw new Error(`Claude: tomt svar (stopp: ${data.stop_reason ?? 'ukjent'})`);
  return text;
}
