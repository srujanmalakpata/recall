import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './components/App';
import { AnnouncerProvider } from './components/Announcer';
import { StoreProvider } from './state/store';
import { broadcastChangeFeed } from './state/changeFeed';
import { IndexedDbRepository } from './storage/indexedDbRepository';
import { deferredRepository } from './storage/deferredRepository';
import { registerServiceWorker } from './registerServiceWorker';
import './styles.css';

const repository = deferredRepository(IndexedDbRepository.open());
// Other tabs and installed-app windows reload their copy of the data after each write here.
const changes = broadcastChangeFeed();

const container = document.getElementById('root');
if (!container) throw new Error('index.html is missing <div id="root">.');

createRoot(container).render(
  <StrictMode>
    <AnnouncerProvider>
      <StoreProvider repository={repository} changes={changes}>
        <App />
      </StoreProvider>
    </AnnouncerProvider>
  </StrictMode>,
);

registerServiceWorker();
