import { type SyntheticEvent, useState } from 'react';
import type { Card } from '../domain/types';
import { countCards } from '../domain/stats';
import { dayToShortLabel } from '../domain/days';
import { formatInterval } from '../domain/sm2';
import { toCsv } from '../io/csv';
import { toMarkdownDeck } from '../io/markdown';
import { useStore } from '../state/store';
import { href } from '../router/routes';
import { navigate } from '../router/useHashRoute';
import { CardEditor } from './CardEditor';
import { ImportPanel } from './ImportPanel';
import { PageHeading } from './PageHeading';
import { downloadText, slugify } from './download';
import { useAnnounce } from './Announcer';

export function DeckView({ deckId }: { readonly deckId: string }) {
  const { state, actions, today } = useStore();
  const announce = useAnnounce();
  const deck = state.decks.find((d) => d.id === deckId);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);

  if (!deck) {
    return (
      <section>
        <PageHeading>Deck not found</PageHeading>
        <p>
          It may have been deleted. <a href={href({ name: 'home' })}>Back to decks</a>
        </p>
      </section>
    );
  }

  const cards = state.cards.filter((c) => c.deckId === deckId).sort((a, b) => a.createdAt - b.createdAt);
  const counts = countCards(cards, today);

  // The store's actions show the error banner and re-throw; these handlers catch so a
  // failed write never becomes an unhandled promise rejection.
  const rename = async (event: SyntheticEvent) => {
    event.preventDefault();
    const name = newName.trim();
    if (name === '') {
      setRenameError('Deck name is empty.');
      return;
    }
    try {
      await actions.updateDeck({ ...deck, name });
      setRenaming(false);
      setRenameError(null);
      announce(`Deck renamed to ${name}.`);
    } catch (e) {
      // Keep the form open with the typed name so the user can retry.
      setRenameError(e instanceof Error ? e.message : String(e));
    }
  };

  const remove = async () => {
    if (!window.confirm(`Delete "${deck.name}" and its ${cards.length} cards? This cannot be undone.`))
      return;
    try {
      await actions.deleteDeck(deck.id);
    } catch {
      return; // reported by the error banner
    }
    announce(`Deleted deck ${deck.name}.`);
    navigate({ name: 'home' });
  };

  const removeCard = async (card: Card) => {
    if (!window.confirm(`Delete the card "${card.front}"?`)) return;
    try {
      await actions.deleteCard(card.id);
      announce('Card deleted.');
    } catch {
      // reported by the error banner
    }
  };

  return (
    <section>
      <p className="breadcrumb">
        <a href={href({ name: 'home' })}>Decks</a> /
      </p>
      <PageHeading>{deck.name}</PageHeading>
      {deck.description && <p className="muted">{deck.description}</p>}
      <p className="muted">
        {counts.total} cards · {counts.due} due · {counts.newCards} new · {counts.learning} learning ·{' '}
        {counts.mature} mature
      </p>
      <div className="actions">
        {counts.due > 0 ? (
          <a className="button" href={href({ name: 'review', deckId })}>
            Review {counts.due} due {counts.due === 1 ? 'card' : 'cards'}
          </a>
        ) : (
          <span className="muted">Nothing due in this deck.</span>
        )}
        <button
          type="button"
          className="secondary"
          onClick={() => downloadText(`${slugify(deck.name)}.csv`, toCsv(cards), 'text/csv')}
          disabled={cards.length === 0}
        >
          Export CSV
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() =>
            downloadText(`${slugify(deck.name)}.md`, toMarkdownDeck(deck.name, cards), 'text/markdown')
          }
          disabled={cards.length === 0}
        >
          Export Markdown
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => {
            setNewName(deck.name);
            setRenameError(null);
            setRenaming(true);
          }}
        >
          Rename
        </button>
        <button type="button" className="danger" onClick={() => void remove()}>
          Delete deck
        </button>
      </div>
      {renaming && (
        <>
          <form className="inline-form" onSubmit={(e) => void rename(e)} noValidate>
            <label htmlFor="rename-deck">New name</label>
            <input
              id="rename-deck"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              aria-invalid={renameError !== null}
              aria-describedby={renameError ? 'rename-deck-error' : undefined}
              autoFocus
            />
            <button type="submit">Save</button>
            <button type="button" className="secondary" onClick={() => setRenaming(false)}>
              Cancel
            </button>
          </form>
          {renameError && (
            <p className="error" id="rename-deck-error" role="alert">
              {renameError}
            </p>
          )}
        </>
      )}

      <h2>Add a card</h2>
      <CardEditor
        submitLabel="Add card"
        onSubmit={async (draft) => {
          await actions.addCards(deckId, [draft]);
          announce('Card added.');
        }}
      />

      <h2>Cards ({cards.length})</h2>
      {cards.length === 0 ? (
        <p className="empty">This deck has no cards yet.</p>
      ) : (
        <ul className="card-list">
          {cards.map((card) => (
            <li key={card.id} className="card-item">
              {editingId === card.id ? (
                <CardEditor
                  initial={{ front: card.front, back: card.back }}
                  submitLabel="Save card"
                  onCancel={() => setEditingId(null)}
                  onSubmit={async (draft) => {
                    await actions.updateCard(card.id, draft);
                    setEditingId(null);
                    announce('Card saved.');
                  }}
                />
              ) : (
                <>
                  <div className="card-text">
                    <p className="card-q">{card.front}</p>
                    <p className="card-a">{card.back}</p>
                    <p className="muted small">
                      {card.schedule.lastReviewedDay === null
                        ? 'New'
                        : `Interval ${formatInterval(card.schedule.intervalDays)} · due ${dayToShortLabel(card.schedule.dueDay)} · ease ${card.schedule.easeFactor.toFixed(2)}`}
                    </p>
                  </div>
                  <div className="actions">
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => setEditingId(card.id)}
                      aria-label={`Edit card: ${card.front}`}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="danger"
                      onClick={() => void removeCard(card)}
                      aria-label={`Delete card: ${card.front}`}
                    >
                      Delete
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <h2>Import cards into this deck</h2>
      <ImportPanel
        mode="existingDeck"
        onImport={async (result) => {
          await actions.addCards(deckId, result.cards);
        }}
      />
    </section>
  );
}
