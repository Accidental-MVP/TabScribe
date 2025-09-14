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
			return await geminiCall(`Proofread this text for academic correctness.\n- Correct grammar, syntax, and punctuation.\n- Improve readability without changing meaning.\n- Preserve technical terms, equations, and inline citations ([1], [2]).\n- Return only the corrected text.\n\n${text}`);
		} catch {}
	}

	return text.replace(/\s+/g, ' ').replace(/\s,/, ',');
}


