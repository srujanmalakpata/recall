import { type ChangeEvent, useEffect, useState } from 'react';
import { createBackup, parseBackup } from '../io/backup';
import { useStore } from '../state/store';
import { isStoragePersisted, requestPersistentStorage } from '../storage/persistence';
import { useAnnounce } from './Announcer';
import { PageHeading } from './PageHeading';
import { downloadText } from './download';

/** Backup and restore of everything (decks, cards, review history) as one JSON file. */
export function DataView() {
  const { state, actions, now } = useStore();
  const announce = useAnnounce();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // undefined while checking, null when the browser has no StorageManager.persist().
  const [persisted, setPersisted] = useState<boolean | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    isStoragePersisted().then(
      (value) => {
        if (!cancelled) setPersisted(value);
      },
      () => {
        if (!cancelled) setPersisted(null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const askToPersist = async () => {
    const granted = await requestPersistentStorage().catch(() => null);
    setPersisted(granted);
    announce(
      granted
        ? 'The browser will keep your data.'
        : 'The browser did not grant persistent storage. Keep a backup.',
    );
  };

  const exportBackup = () => {
    const at = now();
    const backup = createBackup(state, at);
    downloadText(
      `recall-backup-${at.toISOString().slice(0, 10)}.json`,
      JSON.stringify(backup, null, 2),
      'application/json',
    );
    announce('Backup downloaded.');
  };

  const restore = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;
    setMessage(null);
    setError(null);
    const parsed = parseBackup(await file.text());
    input.value = '';
    if (!parsed.ok) {
      setError(`Could not restore "${file.name}": ${parsed.error}`);
      return;
    }
    const { decks, cards, reviews } = parsed.snapshot;
    const ok = window.confirm(
      `Replace all current data with ${decks.length} decks, ${cards.length} cards and ${reviews.length} reviews from "${file.name}"?`,
    );
    if (!ok) return;
    try {
      await actions.restore(parsed.snapshot);
      const text = `Restored ${decks.length} decks and ${cards.length} cards.`;
      setMessage(text);
      announce(text);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <section>
      <PageHeading>Backup and restore</PageHeading>
      <p>
        Everything is stored only in this browser (IndexedDB). Download a backup to move your decks and review
        history to another device or to keep a copy.
      </p>
      <p className="muted">
        {state.decks.length} decks · {state.cards.length} cards · {state.reviews.length} reviews
      </p>
      <div className="actions">
        <button type="button" onClick={exportBackup}>
          Download backup (JSON)
        </button>
      </div>
      <h2>Storage durability</h2>
      <p data-testid="persistence-status">
        {persisted === undefined && 'Checking storage…'}
        {persisted === true && 'Persistent storage is on: the browser will not clear this data on its own.'}
        {persisted === false &&
          'Best-effort storage: the browser may delete this data when disk space runs low, and Safari clears it after 7 days without a visit unless the app is installed. Keep a backup.'}
        {persisted === null && 'This browser does not report whether it will keep this data. Keep a backup.'}
      </p>
      {persisted === false && (
        <div className="actions">
          <button type="button" className="secondary" onClick={() => void askToPersist()}>
            Ask the browser to keep my data
          </button>
        </div>
      )}
      <h2>Restore</h2>
      <div className="field">
        <label htmlFor="restore-file">Restore from a backup file (replaces all current data)</label>
        <input
          id="restore-file"
          type="file"
          accept=".json,application/json"
          onChange={(e) => void restore(e)}
        />
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {message && <p className="success">{message}</p>}
    </section>
  );
}
