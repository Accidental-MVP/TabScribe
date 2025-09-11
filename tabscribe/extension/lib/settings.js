const STORAGE_MODE_KEY = 'tabscribe_mode';
const STORAGE_API_KEY = 'tabscribe_api_key';

export async function getMode() {
	return new Promise((resolve) => {
		chrome.storage.local.get([STORAGE_MODE_KEY], (res) => resolve(res[STORAGE_MODE_KEY] || 'offline'));
	});
}

export async function getApiKey() {
	return new Promise((resolve) => {
		chrome.storage.local.get([STORAGE_API_KEY], (res) => resolve(res[STORAGE_API_KEY] || ''));
	});
}

export async function setApiKey(key) {
	return new Promise((resolve) => {
		chrome.storage.local.set({ [STORAGE_API_KEY]: key }, () => resolve());
	});
}


