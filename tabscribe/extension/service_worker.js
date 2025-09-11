// Background service worker (MV3, ES module)
// - Creates context menu
// - Handles keyboard command Alt+S
// - Relays save requests to content script and persists via db

import { dbAddCard } from './lib/db.js';

const CONTEXT_ID_SAVE = 'tabscribe_save_selection';

chrome.runtime.onInstalled.addListener(() => {
	chrome.contextMenus.create({
		id: CONTEXT_ID_SAVE,
		contexts: ['selection'],
		title: 'Save to TabScribe'
	});
});

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
			return { title, url, favicon };
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
		badges: [],
		evidence: null
	};

	await dbAddCard(card);
	// Optionally notify the side panel to refresh
	chrome.runtime.sendMessage({ type: 'tabscribe:card_added', cardId: card.id });
}


