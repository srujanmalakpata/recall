/**
 * Markdown deck import.
 *
 * Each card is a level-3 heading (the question) followed by the answer text:
 *
 * A level-1 heading supplies an optional deck name; levels 1 and 2 end the current
 * card. Answers may contain paragraphs, lists, fenced code and headings of level 4
 * or deeper. Headings inside fenced code blocks are ignored.
 *
 * Export escapes answer lines that would otherwise read as a heading or an unclosed
 * code fence by prefixing a backslash (as in Markdown, `\### text` is literal text);
 * import removes that one backslash, so export → import returns the same cards.
 */
import {
  type CardDraft,
  type ParseIssue,
  type ParseResult,
  MAX_IMPORT_CARDS,
  findDuplicateFronts,
  validateDraft,
} from './drafts';

// ATX heading (CommonMark): up to 3 spaces of indentation, 1-6 #, then text or nothing,
// and an optional closing sequence of #s preceded by whitespace.
const HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
const FENCE = /^[ \t]{0,3}(`{3,}|~{3,})/;
/** A line the importer treats as a card or section boundary (heading levels 1-3). */
const BOUNDARY_HEADING = /^ {0,3}#{1,3}(?:[ \t]|$)/;

/** Fence tracking shared by import and export: returns the open fence marker or null. */
function nextFenceState(fence: string | null, line: string): string | null {
  const marker = FENCE.exec(line)?.[1];
  if (marker === undefined) return fence;
  if (fence === null) return marker;
  return marker.startsWith(fence.charAt(0)) && marker.length >= fence.length ? null : fence;
}

/** True when the importer would drop a leading backslash from this answer line. */
function isEscapedLine(line: string): boolean {
  if (!line.startsWith('\\')) return false;
  const rest = line.slice(1);
  return BOUNDARY_HEADING.test(rest) || FENCE.test(rest) || isEscapedLine(rest);
}

function unescapeLine(line: string): string {
  return isEscapedLine(line) ? line.slice(1) : line;
}

interface PendingCard {
  front: string;
  line: number;
  body: string[];
}

export function parseMarkdownDeck(source: string): ParseResult {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const errors: ParseIssue[] = [];
  const valid: { draft: CardDraft; line: number }[] = [];
  let title: string | null = null;
  let current: PendingCard | null = null;
  let fence: string | null = null;
  /** Line of the code fence that is currently open, for the "never closed" message. */
  let fenceLine = 0;
  let invalidCards = 0;

  const finish = () => {
    if (!current) return;
    const draft = { front: current.front, back: trimBlankLines(current.body).join('\n') };
    const problem = validateDraft(draft);
    if (problem) {
      invalidCards += 1;
      errors.push({ line: current.line, message: `"${preview(current.front)}": ${problem}` });
    } else {
      valid.push({ draft, line: current.line });
    }
    current = null;
  };

  for (const [index, text] of lines.entries()) {
    const lineNo = index + 1;
    if (FENCE.test(text)) {
      if (fence === null) fenceLine = lineNo;
      fence = nextFenceState(fence, text);
      current?.body.push(text);
      continue;
    }
    const heading = fence === null ? HEADING.exec(text) : null;
    if (heading?.[1] !== undefined && heading[1].length <= 3) {
      const level = heading[1].length;
      const content = heading[2] ?? '';
      finish();
      if (level === 1 && title === null) title = content;
      if (level === 3) {
        if (content === '') {
          invalidCards += 1;
          errors.push({ line: lineNo, message: 'Question heading is empty.' });
        } else current = { front: content, line: lineNo, body: [] };
      }
      continue;
    }
    current?.body.push(unescapeLine(text));
  }
  if (fence !== null) {
    // Headings after the opening fence were read as code, so the card that holds it may
    // have swallowed later questions: report it and do not import it.
    const unclosed = `The code block opened on line ${fenceLine} is never closed, so any questions after it were read as answer text. Add the closing fence.`;
    if (current) {
      const { front } = current;
      invalidCards += 1;
      errors.push({ line: fenceLine, message: `"${preview(front)}": ${unclosed}` });
      current = null;
    } else {
      errors.push({ line: fenceLine, message: unclosed });
    }
  }
  finish();

  if (valid.length === 0 && errors.length === 0) {
    errors.push({
      line: 1,
      message:
        'No questions found. Start each card with a "### " heading and put the answer on the lines below it.',
    });
  }
  if (valid.length > MAX_IMPORT_CARDS) {
    errors.push({
      line: valid[MAX_IMPORT_CARDS]?.line ?? 1,
      message: `Too many cards: ${valid.length}. Import at most ${MAX_IMPORT_CARDS} at a time.`,
    });
  }

  const kept = valid.slice(0, MAX_IMPORT_CARDS);
  return {
    title,
    cards: kept.map((v) => v.draft),
    errors,
    warnings: findDuplicateFronts(kept.map((v) => ({ front: v.draft.front, line: v.line }))),
    skipped: invalidCards + (valid.length - kept.length),
  };
}

function trimBlankLines(lines: readonly string[]): string[] {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start]?.trim() === '') start += 1;
  while (end > start && lines[end - 1]?.trim() === '') end -= 1;
  return lines.slice(start, end);
}

function preview(text: string): string {
  return text.length > 40 ? `${text.slice(0, 39)}…` : text;
}

/** A heading holds one line: join a multi-line question with spaces. */
function oneLine(text: string): string {
  return text.replace(/\s*[\r\n]+\s*/g, ' ').trim();
}

function headingText(text: string): string {
  const line = oneLine(text);
  // "What is C #" would lose its "#" as a closing sequence; add one to protect it.
  return /[ \t]#+$/.test(line) ? `${line} #` : line;
}

function escapeAnswer(back: string): string {
  const lines = back.replace(/\r\n?/g, '\n').split('\n');
  // Balanced code fences can stay as they are; an unclosed one would swallow the next cards.
  const unbalanced = lines.reduce<string | null>(nextFenceState, null) !== null;
  return lines
    .map((line) =>
      BOUNDARY_HEADING.test(line) || (unbalanced && FENCE.test(line)) || isEscapedLine(line)
        ? `\\${line}`
        : line,
    )
    .join('\n');
}

/** Export a deck back to the same Markdown shape, so export → import returns the same cards. */
export function toMarkdownDeck(title: string, cards: readonly CardDraft[]): string {
  const parts = [`# ${headingText(title)}`, ''];
  for (const card of cards) parts.push(`### ${headingText(card.front)}`, '', escapeAnswer(card.back), '');
  return parts.join('\n');
}
