/**
 * CSV import/export (RFC 4180): comma-separated, double-quoted fields may contain
 * commas, quotes ("" escapes a quote) and line breaks.
 *
 * Import needs a header row with "front" and "back" columns ("question"/"answer"
 * are accepted too); other columns are ignored, so exports from other tools work.
 */
import {
  type CardDraft,
  type ParseIssue,
  type ParseResult,
  MAX_IMPORT_CARDS,
  findDuplicateFronts,
  validateDraft,
} from './drafts';

export interface CsvRecord {
  readonly fields: string[];
  /** 1-based line on which the record starts. */
  readonly line: number;
}

export class CsvSyntaxError extends Error {
  constructor(
    message: string,
    readonly line: number,
  ) {
    super(message);
    this.name = 'CsvSyntaxError';
  }
}

/** Split CSV text into records. Throws CsvSyntaxError on an unterminated quote. */
export function parseCsvRecords(source: string): CsvRecord[] {
  const text = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const records: CsvRecord[] = [];
  let fields: string[] = [];
  let field = '';
  let line = 1;
  let recordLine = 1;
  let inQuotes = false;
  let quoteLine = 1;
  let fieldStarted = false;

  const endRecord = () => {
    fields.push(field);
    // A blank line is not a record.
    if (!(fields.length === 1 && fields[0] === '')) records.push({ fields, line: recordLine });
    fields = [];
    field = '';
    fieldStarted = false;
  };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text.charAt(i);
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        if (ch === '\n') line += 1;
        field += ch;
      }
      continue;
    }
    if (ch === '"' && !fieldStarted) {
      inQuotes = true;
      fieldStarted = true;
      quoteLine = line;
    } else if (ch === ',') {
      fields.push(field);
      field = '';
      fieldStarted = false;
    } else if (ch === '\n') {
      endRecord();
      line += 1;
      recordLine = line;
    } else {
      field += ch;
      fieldStarted = true;
    }
  }
  if (inQuotes) throw new CsvSyntaxError('A quoted field is never closed.', quoteLine);
  if (field !== '' || fields.length > 0) endRecord();
  return records;
}

// Deliberately no one-letter aliases: a data row like "Q,A" must not be mistaken for a header.
const FRONT_NAMES = ['front', 'question'];
const BACK_NAMES = ['back', 'answer'];

export function parseCsvDeck(source: string): ParseResult {
  let records: CsvRecord[];
  try {
    records = parseCsvRecords(source);
  } catch (error) {
    if (error instanceof CsvSyntaxError) {
      return {
        title: null,
        cards: [],
        errors: [{ line: error.line, message: error.message }],
        warnings: [],
        skipped: 0,
      };
    }
    throw error;
  }

  const [header, ...rows] = records;
  if (!header) {
    return {
      title: null,
      cards: [],
      errors: [{ line: 1, message: 'The file is empty.' }],
      warnings: [],
      skipped: 0,
    };
  }
  const names = header.fields.map((f) => f.trim().toLowerCase());
  const frontIndex = names.findIndex((n) => FRONT_NAMES.includes(n));
  const backIndex = names.findIndex((n) => BACK_NAMES.includes(n));
  if (frontIndex === -1 || backIndex === -1) {
    return {
      title: null,
      cards: [],
      errors: [
        {
          line: header.line,
          message: 'Missing header row: the first line must name the columns, e.g. "front,back".',
        },
      ],
      warnings: [],
      skipped: 0,
    };
  }

  const errors: ParseIssue[] = [];
  const valid: { draft: CardDraft; line: number }[] = [];
  let invalidRows = 0;
  for (const row of rows) {
    const draft = {
      front: unguardFormula((row.fields[frontIndex] ?? '').trim()),
      back: unguardFormula((row.fields[backIndex] ?? '').trim()),
    };
    const problem = validateDraft(draft);
    if (problem) {
      invalidRows += 1;
      errors.push({ line: row.line, message: problem });
    } else valid.push({ draft, line: row.line });
  }
  if (rows.length === 0) errors.push({ line: header.line, message: 'No cards below the header row.' });
  if (valid.length > MAX_IMPORT_CARDS) {
    errors.push({
      line: valid[MAX_IMPORT_CARDS]?.line ?? 1,
      message: `Too many cards: ${valid.length}. Import at most ${MAX_IMPORT_CARDS} at a time.`,
    });
  }
  const kept = valid.slice(0, MAX_IMPORT_CARDS);
  return {
    title: null,
    cards: kept.map((v) => v.draft),
    errors,
    warnings: findDuplicateFronts(kept.map((v) => ({ front: v.draft.front, line: v.line }))),
    skipped: invalidRows + (valid.length - kept.length),
  };
}

/**
 * CSV/formula injection guard (OWASP): spreadsheet apps run a cell that starts with
 * = + - @ (or a tab/CR) as a formula. Export prefixes such cells with a single quote;
 * import removes exactly that one quote. A cell that already starts with a quote
 * followed by a guarded cell gets another quote, so export → import is lossless.
 */
const FORMULA_START = /^[=+\-@\t\r]/;

function startsWithGuard(value: string): boolean {
  if (!value.startsWith("'")) return false;
  const rest = value.slice(1);
  return FORMULA_START.test(rest) || startsWithGuard(rest);
}

export function guardFormula(value: string): string {
  return FORMULA_START.test(value) || startsWithGuard(value) ? `'${value}` : value;
}

export function unguardFormula(value: string): string {
  return startsWithGuard(value) ? value.slice(1) : value;
}

function quote(value: string): string {
  return /[",\n\r]|^\s|\s$/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Serialise cards as CSV with a front,back header and CRLF line endings (RFC 4180). */
export function toCsv(cards: readonly CardDraft[]): string {
  const cell = (value: string) => quote(guardFormula(value));
  const lines = ['front,back', ...cards.map((c) => `${cell(c.front)},${cell(c.back)}`)];
  return `${lines.join('\r\n')}\r\n`;
}
