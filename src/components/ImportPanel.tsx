import { type ChangeEvent, useId, useMemo, useState } from 'react';
import type { ParseResult } from '../io/drafts';
import { type ImportFormat, detectFormat, parseByFormat } from '../io/parse';
import { useAnnounce } from './Announcer';

interface ImportPanelProps {
  /** Ask for a deck name (new-deck import) or add to an existing deck. */
  readonly mode: 'newDeck' | 'existingDeck';
  readonly onImport: (result: ParseResult, deckName: string) => Promise<void>;
}

const EXAMPLE_MARKDOWN = `# HTTP basics

### What does 404 mean?
The server cannot find the requested resource.

### What does 503 mean?
Service Unavailable: the server is temporarily overloaded or down.`;

/**
 * Paste or choose a Markdown/CSV file, preview what will be imported (with line-numbered
 * errors), then import only the valid cards.
 */
export function ImportPanel({ mode, onImport }: ImportPanelProps) {
  const id = useId();
  const announce = useAnnounce();
  const [format, setFormat] = useState<ImportFormat>('markdown');
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [deckName, setDeckName] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const result = useMemo(() => (text.trim() === '' ? null : parseByFormat(format, text)), [format, text]);
  const suggestedName = result?.title ?? fileName?.replace(/\.[^.]+$/, '') ?? '';
  const effectiveName = deckName.trim() || suggestedName;

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setFormat(detectFormat(file.name));
    setText(await file.text());
    setStatus(null);
  };

  const submit = async () => {
    if (!result || result.cards.length === 0) return;
    if (mode === 'newDeck' && effectiveName === '') {
      setFailure('Give the new deck a name.');
      return;
    }
    setBusy(true);
    setFailure(null);
    try {
      await onImport(result, effectiveName);
      const message = `Imported ${result.cards.length} ${result.cards.length === 1 ? 'card' : 'cards'}.`;
      setStatus(message);
      announce(message);
      setText('');
      setFileName(null);
      setDeckName('');
    } catch (e) {
      setFailure(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const problems = result?.errors.length ?? 0;
  const skipped = result?.skipped ?? 0;

  return (
    <div className="import-panel">
      <fieldset className="format-choice">
        <legend>Format</legend>
        <label>
          <input
            type="radio"
            name={`${id}-format`}
            value="markdown"
            checked={format === 'markdown'}
            onChange={() => setFormat('markdown')}
          />
          Markdown (<code>### question</code> + answer)
        </label>
        <label>
          <input
            type="radio"
            name={`${id}-format`}
            value="csv"
            checked={format === 'csv'}
            onChange={() => setFormat('csv')}
          />
          CSV (<code>front,back</code> header)
        </label>
      </fieldset>
      <div className="field">
        <label htmlFor={`${id}-file`}>Choose a file</label>
        <input
          id={`${id}-file`}
          type="file"
          accept=".md,.markdown,.txt,.csv,text/markdown,text/csv,text/plain"
          onChange={(e) => void onFile(e)}
        />
      </div>
      <div className="field">
        <label htmlFor={`${id}-text`}>Or paste the text</label>
        <textarea
          id={`${id}-text`}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setStatus(null);
          }}
          rows={8}
          placeholder={format === 'csv' ? 'front,back\nWhat is 2+2?,4' : EXAMPLE_MARKDOWN}
          spellCheck={false}
        />
      </div>
      {mode === 'newDeck' && (
        <div className="field">
          <label htmlFor={`${id}-name`}>Deck name</label>
          <input
            id={`${id}-name`}
            value={deckName}
            placeholder={suggestedName || 'e.g. Operating systems'}
            onChange={(e) => setDeckName(e.target.value)}
          />
        </div>
      )}

      {result && (
        <div className="import-preview">
          <p data-testid="import-summary">
            Found {result.cards.length} valid {result.cards.length === 1 ? 'card' : 'cards'}
            {problems > 0 && `, ${problems} ${problems === 1 ? 'problem' : 'problems'}`}
            {result.warnings.length > 0 &&
              `, ${result.warnings.length} ${result.warnings.length === 1 ? 'warning' : 'warnings'}`}
            .
          </p>
          {result.errors.length > 0 && (
            <ul className="issues errors" aria-label="Problems">
              {result.errors.map((issue) => (
                <li key={`${issue.line}-${issue.message}`}>
                  Line {issue.line}: {issue.message}
                </li>
              ))}
            </ul>
          )}
          {result.warnings.length > 0 && (
            <ul className="issues warnings" aria-label="Warnings">
              {result.warnings.map((issue) => (
                <li key={`${issue.line}-${issue.message}`}>
                  Line {issue.line}: {issue.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {failure && (
        <p className="error" role="alert">
          {failure}
        </p>
      )}
      <div className="actions">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy || !result || result.cards.length === 0}
        >
          {result && result.cards.length > 0
            ? `Import ${result.cards.length} ${result.cards.length === 1 ? 'card' : 'cards'}${skipped > 0 ? ` (skip ${skipped})` : ''}`
            : 'Import'}
        </button>
      </div>
      {status && <p className="success">{status}</p>}
    </div>
  );
}
