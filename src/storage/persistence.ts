/**
 * Persistent-storage requests (StorageManager). By default IndexedDB is "best-effort":
 * the browser may evict it under storage pressure, and Safari deletes script-written
 * data after 7 days without use for sites that are not installed. persist() asks the
 * browser to keep it; Chromium decides silently from site engagement, Firefox asks the user.
 */
interface PersistenceApi {
  persisted(): Promise<boolean>;
  persist(): Promise<boolean>;
}

function api(): PersistenceApi | null {
  const storage = (navigator as { storage?: Partial<PersistenceApi> }).storage;
  if (typeof storage?.persist !== 'function' || typeof storage.persisted !== 'function') return null;
  return storage as PersistenceApi;
}

/** true/false from the browser, or null when the API is unavailable. */
export async function isStoragePersisted(): Promise<boolean | null> {
  const storage = api();
  return storage ? storage.persisted() : null;
}

export async function requestPersistentStorage(): Promise<boolean | null> {
  const storage = api();
  return storage ? storage.persist() : null;
}
