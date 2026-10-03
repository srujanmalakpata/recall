import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { CsvSyntaxError, parseCsvDeck, parseCsvRecords, toCsv } from './csv';

describe('parseCsvRecords', () => {
  it('handles quotes, escaped quotes, commas and newlines inside quotes', () => {
    const records = parseCsvRecords('a,"b, c","say ""hi""","multi\nline"\nx,y,z,w');
    expect(records).toEqual([
      { fields: ['a', 'b, c', 'say "hi"', 'multi\nline'], line: 1 },
      { fields: ['x', 'y', 'z', 'w'], line: 3 },
    ]);
  });

  it('skips blank lines, strips a BOM and accepts CRLF', () => {
    expect(parseCsvRecords('﻿a,b\r\n\r\nc,d\r\n').map((r) => r.fields)).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('keeps empty fields', () => {
    expect(parseCsvRecords('a,,c\n,').map((r) => r.fields)).toEqual([
      ['a', '', 'c'],
      ['', ''],
    ]);
  });

  it('throws a CsvSyntaxError with the line of an unterminated quote', () => {
    expect(() => parseCsvRecords('a,b\nc,"never closed\nmore')).toThrow(CsvSyntaxError);
    try {
      parseCsvRecords('a,b\nc,"never closed');
    } catch (e) {
      expect((e as CsvSyntaxError).line).toBe(2);
    }
  });
});

describe('parseCsvDeck', () => {
  it('reads front/back columns by header name, in any order, ignoring extras', () => {
    const result = parseCsvDeck('tags,back,front\nnet,"Transmission Control Protocol",What is TCP?');
    expect(result.cards).toEqual([{ front: 'What is TCP?', back: 'Transmission Control Protocol' }]);
    expect(result.errors).toEqual([]);
  });

  it('does not mistake a data row such as "Q,A" for a header', () => {
    expect(parseCsvDeck('Q,A\nfoo,bar').errors[0]?.message).toMatch(/Missing header row/);
  });

  it('accepts question/answer headers', () => {
    expect(parseCsvDeck('Question,Answer\nQ,A').cards).toEqual([{ front: 'Q', back: 'A' }]);
  });

  it('requires a header row and says so', () => {
    const result = parseCsvDeck('What is TCP?,A protocol');
    expect(result.cards).toEqual([]);
    expect(result.errors[0]?.message).toMatch(/Missing header row/);
  });

  it('reports rows with a missing answer by line and keeps the rest', () => {
    const result = parseCsvDeck('front,back\nQ1,A1\nQ2\nQ3,A3');
    expect(result.cards.map((c) => c.front)).toEqual(['Q1', 'Q3']);
    expect(result.errors).toEqual([{ line: 3, message: 'Answer is empty.' }]);
  });

  it('reports an empty file, a header with no rows, and a syntax error', () => {
    expect(parseCsvDeck('').errors[0]?.message).toBe('The file is empty.');
    expect(parseCsvDeck('front,back\n').errors[0]?.message).toBe('No cards below the header row.');
    expect(parseCsvDeck('front,back\n"oops,1').errors[0]).toEqual({
      line: 2,
      message: 'A quoted field is never closed.',
    });
  });
});

describe('toCsv', () => {
  it('quotes only when needed and uses CRLF', () => {
    expect(
      toCsv([
        { front: 'plain', back: 'has, comma' },
        { front: 'say "x"', back: 'two\nlines' },
      ]),
    ).toBe('front,back\r\nplain,"has, comma"\r\n"say ""x""","two\nlines"\r\n');
  });

  it('neutralises spreadsheet formulas (CSV injection) and restores them on import', () => {
    const cards = [
      { front: '=HYPERLINK("http://evil","x")', back: '+1' },
      { front: '-2 mod 3', back: '@SUM(A1)' },
      { front: "'=already quoted", back: "it's fine" },
    ];
    const csv = toCsv(cards);
    expect(csv.split('\r\n').slice(1, 4)).toEqual([
      `"'=HYPERLINK(""http://evil"",""x"")",'+1`,
      `'-2 mod 3,'@SUM(A1)`,
      `''=already quoted,it's fine`,
    ]);
    expect(parseCsvDeck(csv).cards).toEqual(cards);
  });

  it('round-trips any printable card text (property test)', () => {
    const text = fc
      .string({
        unit: fc.constantFrom('a', 'Z', ' ', ',', '"', '\n', 'é', '1', '#', "'", '=', '+', '-', '@'),
        minLength: 1,
      })
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    fc.assert(
      fc.property(
        fc.array(fc.record({ front: text, back: text }), { minLength: 1, maxLength: 20 }),
        (cards) => {
          const parsed = parseCsvDeck(toCsv(cards));
          expect(parsed.errors).toEqual([]);
          expect(parsed.cards).toEqual(cards);
        },
      ),
    );
  });
});
