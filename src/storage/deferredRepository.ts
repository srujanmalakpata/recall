import type { Repository } from './repository';

/**
 * Wrap a repository that is still opening (IndexedDB opens asynchronously) so the
 * app can render immediately. Every call waits for the open; if opening failed,
 * every call rejects with that error and the UI shows its "storage unavailable" state.
 */
export function deferredRepository(opening: Promise<Repository>): Repository {
  return {
    loadAll: async () => (await opening).loadAll(),
    saveDeck: async (deck) => (await opening).saveDeck(deck),
    addDecksWithCards: async (decks, cards, flag) => (await opening).addDecksWithCards(decks, cards, flag),
    deleteDeck: async (deckId) => (await opening).deleteDeck(deckId),
    saveCards: async (cards) => (await opening).saveCards(cards),
    deleteCard: async (cardId) => (await opening).deleteCard(cardId),
    updateCard: async (cardId, update) => (await opening).updateCard(cardId, update),
    recordReview: async (cardId, build) => (await opening).recordReview(cardId, build),
    replaceAll: async (snapshot) => (await opening).replaceAll(snapshot),
    getFlag: async (key) => (await opening).getFlag(key),
    setFlag: async (key, value) => (await opening).setFlag(key, value),
  };
}
