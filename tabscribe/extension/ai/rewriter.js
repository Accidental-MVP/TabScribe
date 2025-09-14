import { getMode } from '../lib/settings.js';
import { geminiCall } from '../lib/hybrid.js';

function mapPresetToOptions(tonePreset = 'Concise') {
	const map = {
		Concise:  { tone: 'as-is',       length: 'shorter' },
		Academic: { tone: 'more-formal', length: 'as-is'  },
		Friendly: { tone: 'more-casual', length: 'as-is'  },
		Executive:{ tone: 'more-formal', length: 'shorter' }
	};
	const m = map[tonePreset] || map.Concise;
	return { tone: m.tone, length: m.length, format: 'as-is' };
}

export async function rewriteText(text, tonePreset = 'Concise', sharedContext = '') {
	// 1) Rewriter Origin Trial
	try {
		if ('Rewriter' in self) {
			const availability = await Rewriter.availability();
			const opts = { ...mapPresetToOptions(tonePreset), sharedContext };
			let rewriter;
			if (availability === 'available') {
				rewriter = await Rewriter.create(opts);
			} else if (availability === 'downloadable') {
				rewriter = await Rewriter.create({
					...opts,
					monitor(m) { m.addEventListener('downloadprogress', e => { try { chrome.runtime?.sendMessage({ type: 'tabscribe:model_progress', api: 'rewriter', loaded: e.loaded }); } catch {} }); }
				});
			}
			if (rewriter) {
				const result = await rewriter.rewrite(text, { context: 'Context: Improve clarity, precision, and logical flow for scholarly writing. Preserve technical terms, numerical values, and inline citations ([1],[2]). Do not simplify jargon that is essential for accuracy.' });
				rewriter.destroy?.();
				if (result) return result;
			}
		}
	} catch {}

	// 2) Hybrid fallback
	if ((await getMode()) === 'hybrid') {
		try { return await geminiCall(`Rewrite the text in ${tonePreset} academic style.\n- Improve clarity, logical flow, and conciseness.\n- Preserve meaning, technical terminology, and all inline citations ([1],[2]).\n- Maintain an objective, scholarly tone.\nOutput only the rewritten text.\n\n${text}`); } catch {}
	}

	// 3) Local stub
	if (tonePreset === 'Academic') return text.replace(/\b(you|we)\b/gi, 'one');
	if (tonePreset === 'Friendly') return '🙂 ' + text;
	if (tonePreset === 'Executive') return text.toUpperCase();
	return text;
}


