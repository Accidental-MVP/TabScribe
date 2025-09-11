import { getMode } from '../lib/settings.js';
import { geminiCall } from '../lib/hybrid.js';

export async function writeDraftFromCards(cards, opts = { tone: 'neutral', length: 'medium' }) {
	const bullets = cards.map(c => c.snippet.split(/[.!?]/)[0]).slice(0, 12).join('\n- ');
	const sources = cards.map((c, i) => `[${i+1}] ${c.title} — ${c.url}`).join('\n');
	const prompt = `Write a concise research draft with:\n- Intro (1 short paragraph)\n- Key Points as bullets\n- Open Questions\n- Sources (use inline citations [1], [2] mapping to list below)\n\nKey Points:\n- ${bullets}\n\nSources:\n${sources}`;

	// 1) Origin-trial Writer API
	try {
		if ('Writer' in self) {
			const availability = await Writer.availability();
			const options = { tone: opts.tone || 'neutral', format: 'markdown', length: opts.length || 'medium' };
			let writer;
			if (availability === 'available') {
				writer = await Writer.create(options);
			} else if (availability === 'downloadable') {
				writer = await Writer.create({
					...options,
					monitor(m) { m.addEventListener('downloadprogress', e => { try { chrome.runtime?.sendMessage({ type: 'tabscribe:model_progress', api: 'writer', loaded: e.loaded }); } catch {} }); }
				});
			}
			if (writer) {
				const result = await writer.write(prompt, { context: 'Academic research summary with citations preserved.' });
				writer.destroy?.();
				if (result) return result;
			}
		}
	} catch {}

	// 2) Hybrid fallback
	if ((await getMode()) === 'hybrid') {
		try { return await geminiCall(prompt); } catch {}
	}

	// 3) Stub
	return `Intro: This report synthesizes captured snippets.\n\n## Key Points\n- ${bullets}\n\n## Open Questions\n- What are the trade-offs?\n\n## Sources\n${sources}`;
}


