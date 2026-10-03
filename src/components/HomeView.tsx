import { type SyntheticEvent, useState } from 'react';
import { countCards } from '../domain/stats';
import { useStore } from '../state/store';
import { href } from '../router/routes';
import { navigate } from '../router/useHashRoute';
import { ImportPanel } from './ImportPanel';
import { PageHeading } from './PageHeading';

export function HomeView() {
  const { state, actions, today } = useStore();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const decks = [...state.decks].sort((a, b) => a.createdAt - b.createdAt || a.name.localeCompare(b.name));
  const totalDue = countCards(state.cards, today).due;

  const create = async (event: SyntheticEvent) => {
    event.preventDefault();
    if (name.trim() === '') {
      setError('Deck name is empty.');
      return;
    }
    try {
      const deck = await actions.createDeck(name);
      setName('');
      setError(null);
      navigate({ name: 'deck', deckId: deck.id });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <section>
      <PageHeading>Your decks</PageHeading>
      {decks.length === 0 ? (
        <div className="empty">
          <p>No decks yet. Create one, import a Markdown or CSV file, or start with the samples.</p>
          <button type="button" className="secondary" onClick={() => void actions.addSampleDecks()}>
            Add sample decks
          </button>
        </div>
      ) : (
        <>
          <p>
            {totalDue === 0 ? (
              'Nothing is due right now.'
            ) : (
              <a className="button" href={href({ name: 'review', deckId: null })}>
                Review all due cards ({totalDue})
              </a>
            )}
          </p>
          <ul className="deck-list">
            {decks.map((deck) => {
              const counts = countCards(
                state.cards.filter((c) => c.deckId === deck.id),
                today,
              );
              return (
                <li key={deck.id} className="deck-item">
                  <div>
                    <h2>
                      <a href={href({ name: 'deck', deckId: deck.id })}>{deck.name}</a>
                    </h2>
                    {deck.description && <p className="muted">{deck.description}</p>}
                    <p className="muted">
                      {counts.total} {counts.total === 1 ? 'card' : 'cards'} · {counts.due} due ·{' '}
                      {counts.newCards} new
                    </p>
                  </div>
                  {counts.due > 0 && (
                    <a className="button" href={href({ name: 'review', deckId: deck.id })}>
                      Review {counts.due}
                      <span className="visually-hidden"> due from {deck.name}</span>
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      <h2>Create a deck</h2>
      <form className="inline-form" onSubmit={(e) => void create(e)} noValidate>
        <label htmlFor="new-deck-name">Deck name</label>
        <input
          id="new-deck-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-invalid={error !== null}
          aria-describedby={error ? 'new-deck-error' : undefined}
        />
        <button type="submit">Create deck</button>
      </form>
      {error && (
        <p className="error" id="new-deck-error" role="alert">
          {error}
        </p>
      )}

      <h2>Import a deck</h2>
      <p className="muted">
        Markdown: each <code>### heading</code> is a question and the text under it is the answer. Markdown
        Q&amp;A decks import directly. CSV: a <code>front,back</code> header row.
      </p>
      <ImportPanel
        mode="newDeck"
        onImport={async (result, deckName) => {
          await actions.createDeckWithCards(deckName, result.cards);
        }}
      />
    </section>
  );
}
