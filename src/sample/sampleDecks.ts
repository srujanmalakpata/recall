/**
 * Sample decks seeded on first open so the app is useful immediately.
 * Written for this project; short answers on purpose (a flashcard is a prompt, not a textbook).
 */
import type { CardDraft } from '../io/drafts';

export interface SampleDeck {
  readonly name: string;
  readonly description: string;
  readonly cards: readonly CardDraft[];
}

const dataStructures: SampleDeck = {
  name: 'Data structures',
  description: 'Core data structures and their computational costs.',
  cards: [
    {
      front: 'What is the time complexity of indexing into an array, and why?',
      back: 'O(1). Elements are contiguous and equally sized, so the address is base + index × size.',
    },
    {
      front: 'Amortised cost of appending to a dynamic array (e.g. a JavaScript array or Java ArrayList)?',
      back: 'O(1) amortised. When full it grows capacity by a constant factor (e.g. ×2, or about ×1.5 for Java’s ArrayList) and copies (O(n)), but geometric growth makes the copies average out to a constant per append.',
    },
    {
      front: 'Linked list vs array: when does a linked list win?',
      back: 'Frequent insertions/removals in the middle when you already hold a reference to the node (O(1)), and no need for random access. Arrays win on indexing and cache locality.',
    },
    {
      front: 'What does a hash table do on a collision?',
      back: 'Either chaining (each bucket holds a list) or open addressing (probe for another slot). Average lookup stays O(1) while the load factor is kept low by resizing.',
    },
    {
      front: 'Stack vs queue?',
      back: 'Stack: LIFO (push/pop at one end), used for call stacks, undo, DFS. Queue: FIFO (enqueue at back, dequeue at front), used for BFS and task scheduling.',
    },
    {
      front: 'What is a binary heap and what is it used for?',
      back: 'A complete binary tree stored in an array where each parent ≤ its children (min-heap). Insert and extract-min are O(log n), peek is O(1). It backs priority queues, Dijkstra and heap sort.',
    },
    {
      front: 'Why does a binary search tree need balancing?',
      back: 'Inserting sorted data into a plain BST builds a linked list, so operations degrade from O(log n) to O(n). Self-balancing trees (AVL, red-black) keep the height O(log n).',
    },
    {
      front: 'BFS vs DFS on a graph?',
      back: 'BFS uses a queue and visits by distance, so it finds shortest paths in unweighted graphs. DFS uses a stack/recursion and goes deep first; useful for cycle detection, topological sort and connected components.',
    },
    {
      front: 'Adjacency list vs adjacency matrix?',
      back: 'List: O(V + E) space, good for sparse graphs, iterating neighbours is cheap. Matrix: O(V²) space, O(1) edge lookup, good for dense graphs.',
    },
    {
      front: 'What is a trie?',
      back: 'A tree where each edge is a character, so all keys sharing a prefix share a path. Lookup is O(length of key); used for autocomplete and prefix search.',
    },
    {
      front: 'What does "amortised" complexity mean?',
      back: 'The average cost per operation over a worst-case sequence of operations, not an average over random inputs. Occasional expensive steps are paid for by many cheap ones.',
    },
    {
      front: 'What is an LRU cache built from?',
      back: 'A hash map (key → node) plus a doubly linked list ordered by recency. Get and put are O(1): move the node to the front on access, evict from the tail when full.',
    },
  ],
};

const httpBasics: SampleDeck = {
  name: 'HTTP basics',
  description: 'Requests, responses, caching and status codes for web developers.',
  cards: [
    {
      front: 'What are the parts of an HTTP request?',
      back: 'A request line (method, path, version), headers, a blank line, and an optional body.',
    },
    {
      front: 'Which HTTP methods are idempotent?',
      back: 'GET, HEAD, PUT, DELETE, OPTIONS (and TRACE). Repeating them has the same effect as doing it once. POST and PATCH are not guaranteed to be.',
    },
    {
      front: 'What is the difference between 401 and 403?',
      back: '401 Unauthorized: you are not authenticated (no or bad credentials). 403 Forbidden: you are authenticated but not allowed to access the resource.',
    },
    {
      front: 'What do the status code classes 2xx, 3xx, 4xx and 5xx mean?',
      back: '2xx success, 3xx redirection, 4xx client error (fix the request), 5xx server error (the server failed on a valid request).',
    },
    {
      front: 'What does a 304 Not Modified response mean?',
      back: 'The client sent a conditional request (If-None-Match with an ETag, or If-Modified-Since) and its cached copy is still valid, so no body is sent.',
    },
    {
      front: 'What does Cache-Control: no-cache mean?',
      back: 'The response may be stored, but must be revalidated with the server before each use. (no-store is the one that forbids storing it.)',
    },
    {
      front: 'What is CORS?',
      back: 'Cross-Origin Resource Sharing: browsers block cross-origin reads unless the server opts in with Access-Control-Allow-Origin. Non-simple requests are checked first with an OPTIONS preflight.',
    },
    {
      front: 'What does HTTPS add on top of HTTP?',
      back: 'TLS: encryption in transit, integrity (tampering is detected) and server authentication through a certificate chain.',
    },
    {
      front: 'What changed in HTTP/2 compared with HTTP/1.1?',
      back: 'Binary framing and multiplexing of many streams over one connection, header compression (HPACK) and no head-of-line blocking at the HTTP layer (TCP-level blocking remains; HTTP/3 over QUIC removes it).',
    },
    {
      front: 'What is a cookie with the HttpOnly and Secure flags?',
      back: 'HttpOnly: JavaScript cannot read it (limits XSS token theft). Secure: only sent over HTTPS. SameSite additionally limits cross-site sending (CSRF protection).',
    },
    {
      front: 'PUT vs PATCH?',
      back: 'PUT replaces the whole resource at a URL (idempotent). PATCH applies a partial change.',
    },
    {
      front: 'What does a service worker do for a web app?',
      back: 'It is a script that sits between the page and the network, so it can serve cached responses, which is what lets a PWA open offline.',
    },
  ],
};

export const SAMPLE_DECKS: readonly SampleDeck[] = [dataStructures, httpBasics];
