// Simple IndexedDB wrapper for cards

const DB_NAME = 'tabscribe';
const DB_VERSION = 2;
const STORE_CARDS = 'cards';
const STORE_PROJECTS = 'projects';

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
					store.createIndex('projectId', 'projectId');
					store.createIndex('deletedAt', 'deletedAt');
				} else {
					try { db.transaction(STORE_CARDS, 'versionchange').objectStore(STORE_CARDS).createIndex('projectId', 'projectId'); } catch {}
					try { db.transaction(STORE_CARDS, 'versionchange').objectStore(STORE_CARDS).createIndex('deletedAt', 'deletedAt'); } catch {}
				}
				if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
					db.createObjectStore(STORE_PROJECTS, { keyPath: 'id' });
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

export async function dbGetCardsByProject(projectId, includeDeleted = false) {
	const all = await dbGetAllCards();
	return all.filter(c => c.projectId === projectId && (includeDeleted ? true : !c.deletedAt));
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

export async function dbSoftDeleteCard(id) {
	const db = await openDb();
	const card = await tx(db, STORE_CARDS, 'readonly', store => store.get(id));
	if (!card) return;
	card.deletedAt = Date.now();
	await tx(db, STORE_CARDS, 'readwrite', store => store.put(card));
	notify();
}

export async function dbRestoreCard(id) {
	const db = await openDb();
	const card = await tx(db, STORE_CARDS, 'readonly', store => store.get(id));
	if (!card) return;
	card.deletedAt = null;
	await tx(db, STORE_CARDS, 'readwrite', store => store.put(card));
	notify();
}

export async function dbAddProject(project) {
	const db = await openDb();
	await tx(db, STORE_PROJECTS, 'readwrite', store => store.put(project));
	notify();
}

export async function dbGetProjects() {
	const db = await openDb();
	if (!(await hasStore(db, STORE_PROJECTS))) return [];
	return tx(db, STORE_PROJECTS, 'readonly', store => store.getAll());
}

export async function dbUpdateProject(id, updates) {
	const db = await openDb();
	const p = await tx(db, STORE_PROJECTS, 'readonly', store => store.get(id));
	if (!p) return;
	await tx(db, STORE_PROJECTS, 'readwrite', store => store.put({ ...p, ...updates }));
	notify();
}

export async function dbDeleteProject(id) {
	const db = await openDb();
	await tx(db, STORE_PROJECTS, 'readwrite', store => store.delete(id));
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

async function hasStore(db, name) {
	return db.objectStoreNames.contains(name);
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
self.dbSoftDeleteCard = dbSoftDeleteCard;
self.dbRestoreCard = dbRestoreCard;
self.dbGetCardsByProject = dbGetCardsByProject;
self.dbAddProject = dbAddProject;
self.dbGetProjects = dbGetProjects;
self.dbUpdateProject = dbUpdateProject;
self.dbDeleteProject = dbDeleteProject;


