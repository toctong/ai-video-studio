import fs from 'node:fs';

const p =
  'C:/Users/Administrator/.cursor/projects/g-AI Video Studio/agent-transcripts/df43a57a-f76a-44a0-a5c6-56f07becf0dc/df43a57a-f76a-44a0-a5c6-56f07becf0dc.jsonl';
const out = 'packages/shared/src/openai-hk-pricing.json';
const lines = fs.readFileSync(p, 'utf8').split(/\n/);

function tryExtractPricing(text) {
  const key = '"auto_groups"';
  const at = text.indexOf(key);
  if (at < 0) return null;
  // walk left to nearest {
  let start = at;
  while (start > 0 && text[start] !== '{') start--;
  // brace match
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        const slice = text.slice(start, i + 1);
        try {
          const j = JSON.parse(slice);
          if (j && Array.isArray(j.data) && j.success !== undefined) return j;
          if (j && Array.isArray(j.data) && j.vendors) return j;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

let pricing = null;
for (let i = lines.length - 1; i >= 0; i--) {
  const line = lines[i];
  if (!line.includes('auto_groups') || !line.includes('sora_video2')) continue;
  // unescape common jsonl string embeddings
  let candidates = [line];
  try {
    const obj = JSON.parse(line);
    candidates.push(JSON.stringify(obj));
    const walk = (node, depth = 0) => {
      if (pricing || depth > 12) return;
      if (typeof node === 'string') {
        if (node.includes('auto_groups') && node.includes('model_name')) {
          const got = tryExtractPricing(node);
          if (got) pricing = got;
          // also try if the whole string is the JSON
          try {
            const j = JSON.parse(node);
            if (j?.data && Array.isArray(j.data)) pricing = j;
          } catch {
            /* ignore */
          }
        }
        return;
      }
      if (Array.isArray(node)) node.forEach((x) => walk(x, depth + 1));
      else if (node && typeof node === 'object') {
        for (const v of Object.values(node)) walk(v, depth + 1);
      }
    };
    walk(obj);
  } catch {
    /* ignore */
  }
  if (!pricing) {
    for (const c of candidates) {
      pricing = tryExtractPricing(c);
      if (pricing) break;
    }
  }
  if (pricing) {
    console.log('extracted from line', i, 'models', pricing.data.length);
    break;
  }
}

if (!pricing) {
  console.error('Could not extract pricing JSON from transcript');
  process.exit(1);
}

fs.writeFileSync(out, `${JSON.stringify(pricing, null, 2)}\n`, 'utf8');
console.log('Wrote', out, 'models', pricing.data.length);
