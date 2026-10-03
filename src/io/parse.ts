import type { ParseResult } from './drafts';
import { parseCsvDeck } from './csv';
import { parseMarkdownDeck } from './markdown';

export type ImportFormat = 'markdown' | 'csv';

/** Pick the parser from a file name; anything that is not .csv is treated as Markdown. */
export function detectFormat(fileName: string): ImportFormat {
  return /\.csv$/i.test(fileName) ? 'csv' : 'markdown';
}

export function parseByFormat(format: ImportFormat, text: string): ParseResult {
  return format === 'csv' ? parseCsvDeck(text) : parseMarkdownDeck(text);
}
