import { getMode } from '../lib/settings.js';
import { geminiCall } from '../lib/hybrid.js';

function preferredOutputLanguage() {
	const n = (navigator.language || 'en').toLowerCase();
	if (n.startsWith('es')) return 'es';
	if (n.startsWith('ja')) return 'ja';
	return 'en';
}

export async function summarizeText(text) {
	// 1) Stable global Summarizer API (Chrome 138+)
	try {
		if ('Summarizer' in self) {
			const tldr = await createSummarizer({ type: 'tldr', format: 'markdown', length: 'medium' });
			const keypoints = await createSummarizer({ type: 'key-points', format: 'markdown', length: 'medium' });
			if (tldr && keypoints) {
				const tldrOut = await tldr.summarize(text, { context: 'Audience: general; concise and factual.' });
				const kpOut = await keypoints.summarize(text, { context: 'Extract top 5 key ideas as bullets.' });
				const quote = pickStandoutQuote(text);
				return `${tldrOut}\n\n${kpOut}\n\n> "${quote}"`;
			}
		}
	} catch {}

	// 2) Hybrid fallback
	if ((await getMode()) === 'hybrid') {
		try {
			return await geminiCall(`Summarize in 2–3 sentences, then 5 bullets, then a standout quote. Return Markdown.\n\n${text}`);
		} catch {}
	}

	// 3) Stub
	const first = text.split(/\n|\.\s/).slice(0, 3).join('. ') + '.';
	const bullets = Array.from(new Set(text.split(/[.!?]\s+/).slice(0, 5))).map(s => `- ${s.trim()}`).join('\n');
	return `${first}\n\n${bullets}\n\n> "${pickStandoutQuote(text)}"`;
}

async function createSummarizer(options) {
	const availability = await Summarizer.availability();
	if (availability === 'unavailable') return null;
	return Summarizer.create({
		...options,
		outputLanguage: preferredOutputLanguage(),
		monitor(m) {
			m.addEventListener('downloadprogress', (e) => {
				try { chrome.runtime?.sendMessage({ type: 'tabscribe:model_progress', api: 'summarizer', loaded: e.loaded }); } catch {}
			});
		}
	});
}

function pickStandoutQuote(text) {
	const quoted = text.match(/“[^”]{40,200}”|\"[^\"]{40,200}\"/);
	if (quoted) return quoted[0].replace(/^[\"“]|[\"”]$/g, '');
	const sentences = text.split(/(?<=[.!?])\s+/).filter(s => s.length > 40);
	return (sentences[0] || text).trim().slice(0, 200);
}


