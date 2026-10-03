/** Shared shapes and validation for anything that turns text into new cards. */

export interface CardDraft {
  readonly front: string;
  readonly back: string;
}

export interface ParseIssue {
  /** 1-based line number in the source text. */
  readonly line: number;
  readonly message: string;
}

export interface ParseResult {
  /** A deck name found in the source (a Markdown "# Title"), if any. */
  readonly title: string | null;
  /** Valid cards only; anything with an error is listed in `errors` instead. */
  readonly cards: CardDraft[];
  readonly errors: ParseIssue[];
  readonly warnings: ParseIssue[];
  /** Cards found in the source but not imported (invalid, or over MAX_IMPORT_CARDS). */
  readonly skipped: number;
}

export const MAX_FRONT_LENGTH = 1_000;
export const MAX_BACK_LENGTH = 20_000;
export const MAX_IMPORT_CARDS = 5_000;

/** Validate one draft; returns an error message or null. Used by importers and the card editor. */
export function validateDraft(draft: CardDraft): string | null {
  if (draft.front.trim() === '') return 'Question is empty.';
  if (draft.back.trim() === '') return 'Answer is empty.';
  if (draft.front.length > MAX_FRONT_LENGTH) {
    return `Question is ${draft.front.length} characters; the limit is ${MAX_FRONT_LENGTH}.`;
  }
  if (draft.back.length > MAX_BACK_LENGTH) {
    return `Answer is ${draft.back.length} characters; the limit is ${MAX_BACK_LENGTH}.`;
  }
  return null;
}

/** Warn (do not fail) when the same question appears twice in one import. */
export function findDuplicateFronts(
  entries: readonly { readonly front: string; readonly line: number }[],
): ParseIssue[] {
  const firstSeen = new Map<string, number>();
  const warnings: ParseIssue[] = [];
  for (const { front, line } of entries) {
    const key = front.trim().toLowerCase();
    const previous = firstSeen.get(key);
    if (previous === undefined) firstSeen.set(key, line);
    else warnings.push({ line, message: `Duplicate question (first seen on line ${previous}).` });
  }
  return warnings;
}
