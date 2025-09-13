let session;

function getDefaultOutputLanguage() {
	try {
		const lang = (navigator.language || 'en').toLowerCase();
		if (lang.startsWith('es')) return 'es';
		if (lang.startsWith('ja')) return 'ja';
		return 'en';
	} catch {
		return 'en';
	}
}

async function getSession(opts = {}) {
	if (!('LanguageModel' in self)) return null;
	const available = await LanguageModel.availability();
	if (available === 'unavailable') return null;
	if (!session) {
		session = await LanguageModel.create({
			outputLanguage: getDefaultOutputLanguage(),
			...opts,
			monitor(m) {
				m.addEventListener('downloadprogress', e => {
					try { chrome.runtime?.sendMessage({ type: 'tabscribe:model_progress', api: 'prompt', loaded: e.loaded }); } catch {}
				});
			}
		});
	}
	return session;
}

export async function promptText(text, options = {}) {
	const s = await getSession();
	if (!s) return '';
	return s.prompt(text, options);
}

export async function promptStructured(text, schema, options = {}) {
	const s = await getSession();
	if (!s) return '';
	const res = await s.prompt(text, { responseConstraint: schema, ...options });
	try { return JSON.parse(res); } catch { return res; }
}

export async function promptMultimodal(parts, expected = ['image','audio']) {
	const s = await getSession({ expectedInputs: expected.map(t => ({ type: t })) });
	if (!s) return '';
	return s.prompt([{ role: 'user', content: parts }]);
}

export async function promptStream(text, onChunk) {
	const s = await getSession();
	if (!s) return '';
	const stream = s.promptStreaming(text);
	let out = '';
	for await (const chunk of stream) {
		out += chunk;
		onChunk?.(chunk, out);
	}
	return out;
}


