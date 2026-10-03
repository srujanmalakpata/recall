/** A sample Markdown deck must import cleanly. */
import { describe, expect, it } from 'vitest';
import deck from '../../e2e/fixtures/networking.md?raw';
import { parseMarkdownDeck } from './markdown';

describe('sample Markdown deck', () => {
  it('imports with no errors and includes all sample questions', () => {
    const result = parseMarkdownDeck(deck);
    expect(result.title).toBe('Networking basics');
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.cards.map((c) => c.front)).toEqual([
      'What does DNS do?',
      'What is the difference between TCP and UDP?',
      'What port does HTTPS use by default?',
    ]);
  });
});
