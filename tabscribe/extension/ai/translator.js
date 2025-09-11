import { getMode } from '../lib/settings.js';
import { geminiCall } from '../lib/hybrid.js';

export async function translateText(text, target = 'fr') {
	try {
		if (globalThis.chrome?.ai?.translator) {
			const task = await chrome.ai.translator.create({ to: target });
			const result = await task.translate({ text });
			if (result) return result;
		}
	} catch {}

	if ((await getMode()) === 'hybrid') {
		try {
			return await geminiCall(`Translate to ${target}. Keep inline citation markers like [1], [2] intact.\n\nTEXT:\n${text}`);
		} catch {}
	}

	return `[${target}] ${text}`;
}


