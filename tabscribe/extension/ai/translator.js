import { getMode } from '../lib/settings.js';
import { geminiCall } from '../lib/hybrid.js';

let detectorInstance = null;

async function getDetector() {
	if (!('LanguageDetector' in self)) return null;
	if (detectorInstance) return detectorInstance;
	const availability = await LanguageDetector.availability();
	if (availability === 'unavailable') return null;
	detectorInstance = await LanguageDetector.create({
		monitor(m) {
			m.addEventListener('downloadprogress', e => {
				try { chrome.runtime?.sendMessage({ type: 'tabscribe:model_progress', api: 'language-detector', loaded: e.loaded }); } catch {}
			});
		}
	});
	return detectorInstance;
}

async function detectLanguage(text) {
	try {
		const detector = await getDetector();
		if (!detector) return { lang: 'unknown', confidence: 0 };
		const results = await detector.detect(text);
		const top = results?.[0];
		if (!top) return { lang: 'unknown', confidence: 0 };
		if (text.trim().length < 12 && top.confidence < 0.95) return { lang: 'unknown', confidence: top.confidence };
		if (top.confidence < 0.6) return { lang: 'unknown', confidence: top.confidence };
		return { lang: top.language || top.detectedLanguage, confidence: top.confidence ?? 1 };
	} catch {
		return { lang: 'unknown', confidence: 0 };
	}
}

export async function translateText(text, target = 'fr', source = '') {
	try {
		let src = source;
		if (!src) {
			const det = await detectLanguage(text);
			src = det.lang !== 'unknown' ? det.lang : undefined;
		}
		if ('Translator' in self) {
			const availability = await Translator.availability({ sourceLanguage: src, targetLanguage: target });
			let translator;
			if (availability === 'available') {
				translator = await Translator.create({ sourceLanguage: src, targetLanguage: target });
			} else if (availability === 'downloadable') {
				translator = await Translator.create({
					sourceLanguage: src,
					targetLanguage: target,
					monitor(m) {
						m.addEventListener('downloadprogress', e => {
							try { chrome.runtime?.sendMessage({ type: 'tabscribe:model_progress', api: 'translator', loaded: e.loaded }); } catch {}
						});
					}
				});
			}
			if (translator) {
				const out = await translator.translate(text);
				if (out) return out;
			}
		}
	} catch {}

	if ((await getMode()) === 'hybrid') {
		try {
			return await geminiCall(`Translate to ${target}. Keep citation markers like [1], [2] intact.\n\n${text}`);
		} catch {}
	}

	return `[${target}] ${text}`;
}


