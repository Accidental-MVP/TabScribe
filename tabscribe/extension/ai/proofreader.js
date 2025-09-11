import { getMode } from '../lib/settings.js';
import { geminiCall } from '../lib/hybrid.js';

export async function proofreadText(text) {
	try {
		if (globalThis.chrome?.ai?.proofreader) {
			const task = await chrome.ai.proofreader.create();
			const result = await task.proofread({ text });
			if (result) return result;
		}
	} catch {}

	if ((await getMode()) === 'hybrid') {
		try {
			return await geminiCall(`Proofread and correct grammar and clarity; return only corrected text.\n\nTEXT:\n${text}`);
		} catch {}
	}

	return text.replace(/\s+/g, ' ').replace(/\s,/, ',');
}


