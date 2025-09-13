// Background service worker (MV3, ES module)
// - Creates context menu
// - Handles keyboard command Alt+S
// - Relays save requests to content script and persists via db

import { dbAddCard, dbGetAllCards, dbDeleteCard } from './lib/db.js';

const CONTEXT_ID_SAVE = 'tabscribe_save_selection';
const STORAGE_MODE_KEY = 'tabscribe_mode'; // 'offline' | 'hybrid'

chrome.runtime.onInstalled.addListener(() => {
	chrome.contextMenus.create({
		id: CONTEXT_ID_SAVE,
		contexts: ['selection'],
		title: 'Save to TabScribe'
	});
	chrome.storage.local.set({ [STORAGE_MODE_KEY]: 'offline' });
	try { chrome.alarms.create('tabscribe_cleanup', { periodInMinutes: 60 * 24 }); } catch {}
	cleanupTrashed();
});

// Toggle side panel when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
	chrome.sidePanel.open({ windowId: tab.windowId });
});

chrome.runtime.onStartup?.addListener?.(() => {
	try { chrome.alarms.create('tabscribe_cleanup', { periodInMinutes: 60 * 24 }); } catch {}
	cleanupTrashed();
});

chrome.alarms?.onAlarm?.addListener((alarm) => {
	if (alarm?.name === 'tabscribe_cleanup') cleanupTrashed();
});

async function cleanupTrashed() {
	try {
		const TEN_DAYS_MS = 10 * 24 * 60 * 60 * 1000;
		const now = Date.now();
		const cards = await dbGetAllCards();
		for (const c of cards) {
			if (c.deletedAt && (now - c.deletedAt) > TEN_DAYS_MS) {
				await dbDeleteCard(c.id);
			}
		}
	} catch {}
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
	if (info.menuItemId !== CONTEXT_ID_SAVE || !tab?.id) return;
	await saveCurrentSelectionFromTab(tab.id);
});

chrome.commands.onCommand.addListener(async (command) => {
	if (command === 'save-selection') {
		const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
		if (tab?.id) await saveCurrentSelectionFromTab(tab.id);
	}
});

async function saveCurrentSelectionFromTab(tabId) {
	const [{ result: selection }] = await chrome.scripting.executeScript({
		target: { tabId },
		func: () => {
			const sel = window.getSelection?.();
			return sel ? sel.toString() : '';
		}
	});
	if (!selection) return;

	const [{ result: payload }] = await chrome.scripting.executeScript({
		target: { tabId },
		func: () => {
			const title = document.title || '';
			const url = location.href;
			const favicon = (() => {
				const link = document.querySelector('link[rel~="icon"]');
				return link ? (new URL(link.getAttribute('href'), location.href)).toString() : '';
			})();
			const isPdf = /\.pdf(\?|$)/i.test(url) || document.contentType === 'application/pdf';
			const metaDoi = document.querySelector('meta[name="citation_doi"], meta[name="dc.identifier"]')?.getAttribute('content') || '';
			return { title, url, favicon, isPdf, metaDoi };
		}
	});

	const card = {
		id: crypto.randomUUID(),
		createdAt: Date.now(),
		title: payload.title,
		url: payload.url,
		favicon: payload.favicon,
		snippet: selection,
		tags: [],
		badges: payload.isPdf ? ['pdf'] : [],
		doi: payload.metaDoi || '',
		projectId: 'default',
		deletedAt: null,
		evidence: await captureEvidence(tabId)
	};

	await dbAddCard(card);
	chrome.runtime.sendMessage({ type: 'tabscribe:card_added', cardId: card.id });
}

async function captureEvidence(tabId) {
	try {
		const [{ result: html }] = await chrome.scripting.executeScript({
			target: { tabId },
			func: () => {
				const sel = window.getSelection?.();
				if (!sel || sel.rangeCount === 0) return '';
				const range = sel.getRangeAt(0);
				const container = document.createElement('div');
				container.appendChild(range.cloneContents());
				return container.innerHTML.slice(0, 50000);
			}
		});
		return { type: 'html', content: html };
	} catch {
		return null;
	}
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
	if (msg?.type === 'tabscribe:get_mode') {
		chrome.storage.local.get([STORAGE_MODE_KEY], (res) => {
			sendResponse({ mode: res[STORAGE_MODE_KEY] || 'offline' });
		});
		return true;
	}
	if (msg?.type === 'tabscribe:set_mode') {
		const next = msg.mode === 'hybrid' ? 'hybrid' : 'offline';
		chrome.storage.local.set({ [STORAGE_MODE_KEY]: next }, () => {
			sendResponse({ ok: true, mode: next });
			chrome.runtime.sendMessage({ type: 'tabscribe:mode_changed', mode: next });
		});
		return true;
	}
	if (msg?.type === 'tabscribe:purge_card') {
		(async () => { try { await dbDeleteCard(msg.id); sendResponse({ ok: true }); } catch { sendResponse({ ok: false }); } })();
		return true;
	}
});


