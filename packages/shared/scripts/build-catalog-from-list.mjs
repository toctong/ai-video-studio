import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const vendors = { 1: 'Anthropic', 2: 'Google', 3: 'OpenAI', 4: 'DeepSeek', 5: 'xAI' };

/** model_name|vendor_id — chat-capable only from OpenAI-HK pricing dump */
const ROWS = `
gpt-4.1-nano|3
claude-opus-4-6|1
gpt-5.6-luna|3
gpt-4.1-mini|3
gemini-3-pro-preview|2
gemini-3.5-flash|2
gpt-4-turbo-2024-04-09|3
gpt-4.5-preview-2025-02-27|3
gpt-5.5-openai-compact|3
claude-opus-4-6-thinking|1
gpt-5.2-pro-2025-12-11|3
gpt-5.4-mini|3
gpt-5.4-xhigh|3
gpt-4o-mini-2024-07-18|3
gpt-5.1-2025-11-13|3
gpt-5.6-terra|3
claude-sonnet-4-6-thinking|1
deepseek-v3.2|4
deepseek-v4-pro|4
gpt-5-high|3
grok-4.1|5
claude-sonnet-4-20250514|1
gpt-4-0314|3
gpt-4-1106-vision-preview|3
gpt-5.1-codex-mini|3
o1-mini-2024-09-12|3
o3-mini-high|3
claude-3-5-haiku-20241022|1
gpt-5.4-medium|3
gpt-5.5-high|3
gpt-4-32k-0314|3
gpt-5.1-codex|3
gpt-5.1-codex-max|3
gpt-5.3-codex-high|3
gpt-5.5-xhigh|3
deepseek-v3|4
deepseek-v3-0324|4
gpt-5.2-2025-12-11|3
gpt-5.3-chat-latest|3
grok-3-deepsearch|5
o1-mini-all|3
o3-mini-2025-01-31|3
gpt-4o-2024-11-20|3
claude-sonnet-4-20250514-thinking|1
claude-3-5-sonnet-20241022|1
claude-haiku-4-5-20251001|1
gpt-5.1|3
claude-opus-4-8|1
chatgpt-4o-latest|3
claude-3-7-sonnet-20250219-thinking|1
claude-sonnet-4-5-20250929-thinking|1
deepseek-r1|4
gpt-3.5-turbo|3
gpt-3.5-turbo-0125|3
o3-mini-2025-01-31-medium|3
gpt-4-0125-preview|3
gpt-4.5-preview|3
gpt-5.2-chat-latest|3
grok-4|5
claude-3-5-sonnet-20240620|1
claude-sonnet-4-5|1
gpt-4-turbo|3
gpt-5-chat-latest|3
claude-opus-4-5-20251101|1
claude-sonnet-4-5-20250929|1
claude-sonnet-5|1
gpt-4.1|3
gpt-5-mini|3
gpt-5.4-nano|3
o3-mini-2025-01-31-high|3
grok-3|5
claude-opus-4-20250514|1
claude-haiku-4-5-20251001-thinking|1
gpt-5-chat|3
gpt-5.2-pro|3
o1|3
o1-preview-2024-09-12|3
gpt-5.5-low|3
gemini-3.1-pro-preview|2
gpt-5|3
gpt-5-chat-2025-08-07|3
gpt-5-nano-2025-08-07|3
gpt-5-thinking-all|3
gpt-5.4-mini-2026-03-17|3
claude-haiku-4-5|1
claude-opus-4-6-high|1
gpt-4.1-2025-04-14|3
gpt-5-low|3
gpt-5.2-codex|3
o3-mini-2025-01-31-low|3
o3-mini-medium|3
gpt-5.4|3
claude-opus-4-6-low|1
deepseek-v4-flash|4
gemini-3.1-flash|2
gemini-3.1-pro|2
gpt-3.5-turbo-0613|3
gpt-5.4-nano-2026-03-17|3
gemini-3-pro-preview-thinking-high|2
gpt-4.1-mini-2025-04-14|3
gpt-5-nano|3
gpt-5.3-codex|3
o1-2024-12-17|3
gpt-5.6-sol|3
gpt-3.5-turbo-16k|3
gpt-5.1-chat-latest|3
gpt-5.1-codex-medium|3
gpt-5.2-all|3
o3|3
gpt-5.4-pro|3
claude-opus-4-1-20250805-thinking|1
claude-opus-4-6-max|1
gpt-4-32k|3
gpt-4.1-nano-2025-04-14|3
claude-3-7-sonnet-20250219|1
gpt-4-32k-0613|3
gpt-4-all|3
gpt-4o-mini|3
gpt-5.4-2026-03-05|3
gpt-5.5-pro|3
claude-3-haiku-20240307|1
gpt-5.4-openai-compact|3
claude-opus-4-5-20251101-thinking|1
gpt-5-pro-all|3
gpt-5.1-codex-high|3
claude-opus-4-6-medium|1
gpt-5.6|3
claude-3-5-sonnet-all|1
gpt-3.5-turbo-0301|3
gpt-4-vision-preview|3
gpt-4o|3
o1-mini|3
o1-preview-all|3
claude-3-opus-20240229|1
gpt-5.4-high|3
gemini-2.5-pro-preview-05-06|2
gpt-4o-2024-05-13|3
gpt-5-mini-2025-08-07|3
gpt-5.3-codex-low|3
gpt-5.3-codex-medium|3
claude-3-sonnet-20240229|1
gpt-5.4-low|3
gemini-2.5-flash|2
gpt-4-0613|3
gpt-4-1106-preview|3
gpt-5.2|3
gpt-5.5|3
gpt-3.5-turbo-1106|3
gpt-4-turbo-preview|3
o1-preview|3
o1-pro-all|3
o3-2025-04-16|3
o3-mini|3
o3-mini-low|3
gpt-5-2025-08-07|3
o4-mini-2025-04-16|3
gpt-5.5-medium|3
gemini-3-flash-preview|2
gpt-5-medium|3
claude-opus-4-20250514-thinking|1
claude-sonnet-4-5-all|1
gemini-2.5-pro|2
gpt-4|3
gpt-4o-2024-08-06|3
grok-4.2|5
o4-mini|
claude-opus-4-1-20250805|1
claude-opus-4-7|1
claude-sonnet-4-6|1
gemini-2.5-flash-lite|2
gemini-3.1-flash-lite-preview|2
gpt-3.5-turbo-16k-0613|3
`.trim();

function guessVendor(name, vid) {
  if (vid && vendors[vid]) return vendors[vid];
  const n = name.toLowerCase();
  if (n.startsWith('claude')) return 'Anthropic';
  if (n.startsWith('gemini')) return 'Google';
  if (n.startsWith('deepseek')) return 'DeepSeek';
  if (n.startsWith('grok')) return 'xAI';
  return 'OpenAI';
}

const models = ROWS.split(/\n/)
  .map((line) => {
    const [value, vid] = line.trim().split('|');
    return {
      value,
      vendor: guessVendor(value, vid ? Number(vid) : undefined),
    };
  })
  .sort((a, b) => a.vendor.localeCompare(b.vendor) || a.value.localeCompare(b.value));

const out = path.join(__dirname, '../src/openai-hk-catalog.json');
fs.writeFileSync(out, JSON.stringify({ updatedAt: new Date().toISOString(), models }, null, 2));
console.log(`Wrote ${models.length} models → ${out}`);
