// The server validates chat phrase ids against the same JSON the client renders.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
export const PHRASES_PATH = path.resolve(here, '../../client/dist/phrases.json');

export function loadPhrases(file = PHRASES_PATH) {
  const data = JSON.parse(readFileSync(file, 'utf8'));
  const ids = new Set();
  for (const category of data.categories || []) {
    for (const phrase of category.phrases || []) {
      if (typeof phrase.id !== 'string' || ids.has(phrase.id)) throw new Error(`phrases.json: duplicate or invalid id "${phrase.id}"`);
      ids.add(phrase.id);
    }
  }
  return { data, ids };
}

export const PHRASE_IDS = loadPhrases().ids;
