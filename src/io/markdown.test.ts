import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseMarkdownDeck, toMarkdownDeck } from './markdown';
import { MAX_FRONT_LENGTH, MAX_IMPORT_CARDS } from './drafts';

describe('parseMarkdownDeck', () => {
  it('turns each ### heading and the text below it into a card', () => {
    const result = parseMarkdownDeck(`# Networking

Intro paragraph that is not a card.

### What is TCP?
A reliable, ordered byte stream.

It retransmits lost segments.

### What is UDP?
Datagrams with no delivery guarantee.
`);
    expect(result.title).toBe('Networking');
    expect(result.errors).toEqual([]);
    expect(result.cards).toEqual([
      { front: 'What is TCP?', back: 'A reliable, ordered byte stream.\n\nIt retransmits lost segments.' },
      { front: 'What is UDP?', back: 'Datagrams with no delivery guarantee.' },
    ]);
  });

  it('ends a card at the next ## section and keeps #### sub-headings in the answer', () => {
    const result = parseMarkdownDeck(`## Scheduler questions
### Why SM-2?
Simple and explainable.
#### Details
Ease factor per card.
## Next section
Not part of any answer.
`);
    expect(result.cards).toEqual([
      { front: 'Why SM-2?', back: 'Simple and explainable.\n#### Details\nEase factor per card.' },
    ]);
  });

  it('ignores headings inside fenced code blocks', () => {
    const result = parseMarkdownDeck(
      ['### How do you comment in Bash?', '```bash', '### not a heading', 'echo hi', '```'].join('\n'),
    );
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]?.back).toContain('### not a heading');
  });

  it('keeps a trailing # that is part of the text (C#) and strips a closing sequence', () => {
    const result = parseMarkdownDeck('### What is C#\nA language.\n### Closed ###\nYes.');
    expect(result.cards.map((c) => c.front)).toEqual(['What is C#', 'Closed']);
  });

  it('reports a question with no answer, with its line number, and keeps the valid cards', () => {
    const result = parseMarkdownDeck('### Good?\nYes.\n\n### Empty?\n\n### Also good?\nYes.');
    expect(result.cards.map((c) => c.front)).toEqual(['Good?', 'Also good?']);
    expect(result.errors).toEqual([{ line: 4, message: '"Empty?": Answer is empty.' }]);
    expect(result.skipped).toBe(1);
  });

  it('reports a bare ### as an empty question instead of folding it into the previous answer', () => {
    const result = parseMarkdownDeck('### Q\nA\n###\nOrphan answer\n### Q2\nB');
    expect(result.cards).toEqual([
      { front: 'Q', back: 'A' },
      { front: 'Q2', back: 'B' },
    ]);
    expect(result.errors).toEqual([{ line: 3, message: 'Question heading is empty.' }]);
    expect(result.skipped).toBe(1);
  });

  it('accepts headings indented by up to three spaces (CommonMark), not four', () => {
    const result = parseMarkdownDeck('  ### Indented?\nYes.\n    ### Code, not a heading\n');
    expect(result.cards).toEqual([{ front: 'Indented?', back: 'Yes.\n    ### Code, not a heading' }]);
  });

  it('counts cards over the import limit as skipped', () => {
    const source = Array.from({ length: MAX_IMPORT_CARDS + 2 }, (_, i) => `### Q${i}\nA`).join('\n');
    const result = parseMarkdownDeck(source);
    expect(result.cards).toHaveLength(MAX_IMPORT_CARDS);
    expect(result.errors).toHaveLength(1);
    expect(result.skipped).toBe(2);
  });

  it('explains the expected format when there are no questions', () => {
    const result = parseMarkdownDeck('# Just a title\n\nSome notes.');
    expect(result.cards).toEqual([]);
    expect(result.errors[0]?.message).toMatch(/No questions found/);
  });

  it('flags an unclosed code fence', () => {
    const result = parseMarkdownDeck('### Q\n```\ncode');
    expect(result.errors.some((e) => e.message.includes('never closed'))).toBe(true);
  });

  it('reports an unclosed fence on the line that opened it and skips the card that swallowed questions', () => {
    const result = parseMarkdownDeck('### Q1\n```\ncode\n\n### Q2\nA2\n### Q3\nA3\n');
    expect(result.cards).toEqual([]);
    expect(result.skipped).toBe(1);
    expect(result.errors).toEqual([
      {
        line: 2,
        message:
          '"Q1": The code block opened on line 2 is never closed, so any questions after it were read as answer text. Add the closing fence.',
      },
    ]);
  });

  it('keeps the cards before an unclosed fence that is outside any card', () => {
    const result = parseMarkdownDeck('### Q1\nA1\n## Notes\n~~~\n### Q2\nA2');
    expect(result.cards).toEqual([{ front: 'Q1', back: 'A1' }]);
    expect(result.errors.map((e) => e.line)).toEqual([4]);
    expect(result.skipped).toBe(0);
  });

  it('warns about duplicate questions', () => {
    const result = parseMarkdownDeck('### Same\nA\n### same\nB');
    expect(result.cards).toHaveLength(2);
    expect(result.warnings).toEqual([{ line: 3, message: 'Duplicate question (first seen on line 1).' }]);
  });

  it('rejects an over-long question', () => {
    const result = parseMarkdownDeck(`### ${'x'.repeat(MAX_FRONT_LENGTH + 1)}\nA`);
    expect(result.cards).toEqual([]);
    expect(result.errors[0]?.message).toMatch(/limit is 1000/);
  });

  it('handles Windows line endings', () => {
    expect(parseMarkdownDeck('### Q\r\nA\r\n').cards).toEqual([{ front: 'Q', back: 'A' }]);
  });

  it('round-trips through toMarkdownDeck', () => {
    const cards = [
      { front: 'One', back: 'First\n\nwith a paragraph' },
      { front: 'Two', back: '- a list\n- of items' },
    ];
    const parsed = parseMarkdownDeck(toMarkdownDeck('Deck', cards));
    expect(parsed.title).toBe('Deck');
    expect(parsed.cards).toEqual(cards);
  });

  it('escapes answer lines that would end the card, and joins multi-line questions', () => {
    const cards = [
      { front: 'Line one\nline two', back: '## Notes\nmore\n### not a question' },
      { front: 'What is C #', back: '```\nunclosed fence' },
      { front: 'Next', back: 'Still a separate card' },
    ];
    const markdown = toMarkdownDeck('Deck', cards);
    expect(markdown).toContain('\\## Notes');
    const parsed = parseMarkdownDeck(markdown);
    expect(parsed.errors).toEqual([]);
    expect(parsed.cards).toEqual([{ ...cards[0], front: 'Line one line two' }, cards[1], cards[2]]);
  });

  it('round-trips any card text the app can store (property test)', () => {
    const unit = fc.constantFrom('a', 'Z', ' ', '#', '`', '~', '\\', '\n', '\t', 'é', '-');
    const text = fc
      .string({ unit, minLength: 1, maxLength: 40 })
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    // Questions are single-line in Markdown; the exporter joins lines with a space.
    const oneLine = (s: string) => s.replace(/\s*\n+\s*/g, ' ').trim();
    fc.assert(
      fc.property(
        fc.array(fc.record({ front: text, back: text }), { minLength: 1, maxLength: 8 }),
        (cards) => {
          const parsed = parseMarkdownDeck(toMarkdownDeck('Deck', cards));
          expect(parsed.errors).toEqual([]);
          expect(parsed.cards).toEqual(cards.map((c) => ({ front: oneLine(c.front), back: c.back })));
        },
      ),
      { numRuns: 500 },
    );
  });
});
