import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const file = path.join(__dirname, '../src/libraries/characters.ts');
const s = fs.readFileSync(file, 'utf8');
const body = s
  .replace(/^import[^\n]+\n\nexport const CHARACTER_LIBRARY[^=]+=\s*/, '')
  .replace(/;\s*\n\nexport const CHARACTER_CATEGORIES[\s\S]*$/, '');
const arr = JSON.parse(JSON.stringify(eval(`(${body})`)));

for (const c of arr) {
  const name = String(c.name || '').trim();
  let d = String(c.description || '');
  if (name) {
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    d = d.replace(new RegExp(`^${esc}[。．，,]\\s*`), '');
    d = d.replace(new RegExp(`${esc}[。．，,]\\s*`, 'g'), '');
    d = d.replace(new RegExp(esc, 'g'), '');
  }
  c.description = d.replace(/\s{2,}/g, ' ').trim();
  delete c.name;
}

const out = `import type { CharacterLibraryItem } from './types';

export const CHARACTER_LIBRARY: CharacterLibraryItem[] = ${JSON.stringify(arr, null, 2)};

export const CHARACTER_CATEGORIES = Array.from(
  new Set(CHARACTER_LIBRARY.map((i) => i.category)),
);
`;
fs.writeFileSync(file, out);
console.log('ok', arr.length, arr[0]);
