// Local deck library — multiple saved card-news decks per browser (guest mode).
// IndexedDB-backed (not localStorage): a deck carries its full background image
// as a dataURL, so a library of them easily exceeds localStorage's ~5MB cap.
//
// This is the "use it free, no login" store. When accounts (Supabase) land, the
// same SavedDeck shape syncs to a per-user table; this stays as the guest cache.

import type { Deck } from "@/types";

export interface SavedDeck {
  id: string;
  name: string;
  deck: Deck;
  createdAt: number;
  updatedAt: number;
}

const DB_NAME = "ek-library";
const STORE = "decks";
const OLD_SINGLE_KEY = "ek-studio-v1"; // the previous one-deck slot
const MIGRATED_FLAG = "ek-library-migrated";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error);
        tx.oncomplete = () => db.close();
      }),
  );
}

export function newDeckId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `d-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
}

export async function listDecks(): Promise<SavedDeck[]> {
  const all = await run<SavedDeck[]>("readonly", (s) => s.getAll());
  return (all || []).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getDeck(id: string): Promise<SavedDeck | undefined> {
  return run<SavedDeck | undefined>("readonly", (s) => s.get(id));
}

// Upsert: keep createdAt on an existing record, bump updatedAt.
export async function saveDeck(id: string, name: string, deck: Deck): Promise<SavedDeck> {
  const existing = await getDeck(id);
  const now = Date.now();
  const rec: SavedDeck = {
    id,
    name: name.trim() || existing?.name || "제목 없는 카드뉴스",
    deck,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await run("readwrite", (s) => s.put(rec));
  return rec;
}

export async function renameDeck(id: string, name: string): Promise<void> {
  const existing = await getDeck(id);
  if (!existing) return;
  await run("readwrite", (s) => s.put({ ...existing, name: name.trim() || existing.name, updatedAt: Date.now() }));
}

export async function duplicateDeck(id: string): Promise<SavedDeck | undefined> {
  const src = await getDeck(id);
  if (!src) return undefined;
  const now = Date.now();
  const copy: SavedDeck = { ...src, id: newDeckId(), name: `${src.name} (사본)`, createdAt: now, updatedAt: now };
  await run("readwrite", (s) => s.put(copy));
  return copy;
}

export async function deleteDeck(id: string): Promise<void> {
  await run("readwrite", (s) => s.delete(id));
}

// One-time import of the legacy single-deck localStorage slot into the library,
// so an existing user keeps their current work. Returns the new id (or null).
export async function migrateOldSlot(): Promise<string | null> {
  try {
    if (localStorage.getItem(MIGRATED_FLAG)) return null;
    const raw = localStorage.getItem(OLD_SINGLE_KEY);
    localStorage.setItem(MIGRATED_FLAG, "1");
    if (!raw) return null;
    const deck = JSON.parse(raw) as Deck;
    if (!deck?.content) return null;
    const id = newDeckId();
    await saveDeck(id, deck.meta?.title || "내 카드뉴스", deck);
    localStorage.removeItem(OLD_SINGLE_KEY);
    return id;
  } catch {
    return null;
  }
}
