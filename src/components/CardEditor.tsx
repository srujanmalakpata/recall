import { type SyntheticEvent, useId, useState } from 'react';
import { type CardDraft, validateDraft } from '../io/drafts';

interface CardEditorProps {
  readonly initial?: CardDraft;
  readonly submitLabel: string;
  readonly onSubmit: (draft: CardDraft) => Promise<void>;
  readonly onCancel?: () => void;
}

/** Question/answer form used both for adding and for editing a card. */
export function CardEditor({ initial, submitLabel, onSubmit, onCancel }: CardEditorProps) {
  const id = useId();
  const [front, setFront] = useState(initial?.front ?? '');
  const [back, setBack] = useState(initial?.back ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (event: SyntheticEvent) => {
    event.preventDefault();
    const draft = { front, back };
    const problem = validateDraft(draft);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    try {
      await onSubmit(draft);
      if (!initial) {
        setFront('');
        setBack('');
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="card-editor" onSubmit={(e) => void submit(e)} noValidate>
      <div className="field">
        <label htmlFor={`${id}-front`}>Question</label>
        <textarea
          id={`${id}-front`}
          value={front}
          onChange={(e) => setFront(e.target.value)}
          rows={2}
          aria-invalid={error !== null && front.trim() === ''}
          aria-describedby={error ? `${id}-error` : undefined}
        />
      </div>
      <div className="field">
        <label htmlFor={`${id}-back`}>Answer</label>
        <textarea
          id={`${id}-back`}
          value={back}
          onChange={(e) => setBack(e.target.value)}
          rows={4}
          aria-invalid={error !== null && back.trim() === ''}
          aria-describedby={error ? `${id}-error` : undefined}
        />
      </div>
      {error && (
        <p className="error" id={`${id}-error`} role="alert">
          {error}
        </p>
      )}
      <div className="actions">
        <button type="submit" disabled={saving}>
          {submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="secondary" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
