import { getMode } from '../lib/settings.js';
import { geminiCall } from '../lib/hybrid.js';

export async function summarizeText(text) {
	// Try Chrome Built-in AI summarizer if available
	try {
		if (globalThis.chrome?.ai?.summarizer) {
			const task = await chrome.ai.summarizer.create();
			const result = await task.summarize({ text, format: 'bullets+summary' });
			if (result) return result;
		}
	} catch {}

	// Hybrid fallback to Gemini API if mode permits
	if ((await getMode()) === 'hybrid') {
		try {
			return await geminiCall(`Summarize in 2-3 sentences then 5 bullets and a standout quote.\n\nTEXT:\n${text}`);
		} catch {}
	}

	// Local stub
	const first = text.split(/\n|\.\s/).slice(0, 3).join('. ') + '.';
	const bullets = Array.from(new Set(text.split(/[.!?]\s+/).slice(0, 5))).map(s => `- ${s.trim()}`).join('\n');
	return `${first}\n\n${bullets}`;
}


