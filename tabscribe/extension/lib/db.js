// Simple IndexedDB wrapper for cards

const DB_NAME = 'tabscribe';
const DB_VERSION = 1;
const STORE_CARDS = 'cards';

let dbPromise;
const subscribers = new Set();

function openDb() {
	if (!dbPromise) {
		dbPromise = new Promise((resolve, reject) => {
			const req = indexedDB.open(DB_NAME, DB_VERSION);
			req.onupgradeneeded = () => {
				const db = req.result;
				if (!db.objectStoreNames.contains(STORE_CARDS)) {
					const store = db.createObjectStore(STORE_CARDS, { keyPath: 'id' });
					store.createIndex('createdAt', 'createdAt');
				}
			};
			req.onsuccess = () => resolve(req.result);
			req.onerror = () => reject(req.error);
		});
	}
	return dbPromise;
}

export async function dbAddCard(card) {
	const db = await openDb();
	await tx(db, STORE_CARDS, 'readwrite', store => store.put(card));
	notify();
}

export async function dbGetAllCards() {
	const db = await openDb();
	return tx(db, STORE_CARDS, 'readonly', store => store.getAll());
}

export async function dbUpdateCard(id, updates) {
	const db = await openDb();
	const card = await tx(db, STORE_CARDS, 'readonly', store => store.get(id));
	if (!card) return;
	const next = { ...card, ...updates };
	await tx(db, STORE_CARDS, 'readwrite', store => store.put(next));
	notify();
}

export async function dbDeleteCard(id) {
	const db = await openDb();
	await tx(db, STORE_CARDS, 'readwrite', store => store.delete(id));
	notify();
}

function tx(db, storeName, mode, fn) {
	return new Promise((resolve, reject) => {
		const t = db.transaction(storeName, mode);
		const store = t.objectStore(storeName);
		const req = fn(store);
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

export function dbSubscribe(cb) {
	subscribers.add(cb);
	return () => subscribers.delete(cb);
}

function notify() {
	for (const cb of subscribers) {
		try { cb(); } catch {}
	}
}

// Expose for service worker importScripts
self.dbAddCard = dbAddCard;
self.dbGetAllCards = dbGetAllCards;
self.dbUpdateCard = dbUpdateCard;
self.dbDeleteCard = dbDeleteCard;


