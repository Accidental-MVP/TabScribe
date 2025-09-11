import { getMode } from '../lib/settings.js';
import { geminiCall } from '../lib/hybrid.js';

export async function rewriteText(text, tone = 'Concise') {
	try {
		if (globalThis.chrome?.ai?.rewriter) {
			const task = await chrome.ai.rewriter.create({ style: tone.toLowerCase() });
			const result = await task.rewrite({ text });
			if (result) return result;
		}
	} catch {}

	if ((await getMode()) === 'hybrid') {
		try {
			return await geminiCall(`Rewrite the following in a ${tone} tone, improve clarity but keep meaning.\n\nTEXT:\n${text}`);
		} catch {}
	}

	if (tone === 'Academic') return text.replace(/\b(you|we)\b/gi, 'one');
	if (tone === 'Friendly') return '🙂 ' + text;
	if (tone === 'Executive') return text.toUpperCase();
	return text;
}


