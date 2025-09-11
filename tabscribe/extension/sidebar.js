import { dbGetAllCards, dbAddCard, dbSubscribe, dbUpdateCard } from './lib/db.js';
import { summarizeText } from './ai/summarize.js';
import { rewriteText } from './ai/rewriter.js';
import { proofreadText } from './ai/proofreader.js';
import { translateText } from './ai/translator.js';
import { exportMarkdown, exportDocx } from './lib/exports.js';

const cardsEl = document.getElementById('cards');
const btnSample = document.getElementById('btn-sample');
const btnDraft = document.getElementById('btn-draft');
const modeLabel = document.getElementById('mode-label');

async function loadMode() {
    const mode = await new Promise(resolve => {
        chrome.runtime.sendMessage({ type: 'tabscribe:get_mode' }, (res) => resolve(res?.mode || 'offline'));
    });
    modeLabel.textContent = mode === 'hybrid' ? 'Hybrid' : 'Offline';
}

modeLabel.parentElement.addEventListener('click', async () => {
    const current = modeLabel.textContent === 'Hybrid' ? 'hybrid' : 'offline';
    const next = current === 'offline' ? 'hybrid' : 'offline';
    await new Promise(resolve => {
        chrome.runtime.sendMessage({ type: 'tabscribe:set_mode', mode: next }, () => resolve());
    });
});
const btnExportMd = document.getElementById('btn-export-md');
const btnExportDocx = document.getElementById('btn-export-docx');
const btnCopyAll = document.getElementById('btn-copy-all');
const btnJudge = document.getElementById('btn-judge');
const btnAudio = document.getElementById('btn-audio');
const draftModal = document.getElementById('draft-modal');
const btnGenDraft = document.getElementById('btn-generate-draft');
const btnCloseDraft = document.getElementById('btn-close-draft');
const draftOutput = document.getElementById('draft-output');
const citeStyleSel = document.getElementById('cite-style');
const btnCopyDraft = document.getElementById('btn-copy-draft');
const btnExportDraftMd = document.getElementById('btn-export-draft-md');
import { writeDraft } from './ai/writer.js';
const dropzone = document.getElementById('dropzone');
const onboarding = document.getElementById('onboarding');
const dismissOnboarding = document.getElementById('dismiss-onboarding');

function renderCard(card) {
	const el = document.createElement('article');
	el.className = 'card';
	
	// Create badges markup if any exist
	const badgesHtml = card.badges && card.badges.length ? `
		<div class="card-badges">
			${card.badges.map(badge => {
				const label = {
					'summ': 'Summarized',
					'rewr': 'Rewritten',
					'proof': 'Proofread',
					'trans': 'Translated',
					'image': 'Image',
					'audio': 'Audio'
				}[badge] || badge;
				return `<span class="badge">${label}</span>`;
			}).join('')}
		</div>
	` : '';
	
	el.innerHTML = `
		${badgesHtml}
		<div class="card-head">
			<img class="fav" src="${card.favicon || 'icons/icon.svg'}" alt=""/>
			<div class="meta">
				<div class="title">${escapeHtml(card.title || 'Untitled')}</div>
				<a class="url" href="${card.url}" target="_blank">${new URL(card.url).hostname}</a>
			</div>
		</div>
		<div class="snippet">${escapeHtml(card.snippet)}</div>
		<div class="actions" data-id="${card.id}">
			<button data-act="summ">Summarize</button>
			<button data-act="rewr">Rewrite</button>
			<button data-act="proof">Proofread</button>
			<button data-act="trans">Translate</button>
		</div>
	`;
	return el;
}

function escapeHtml(s) {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

async function render() {
	cardsEl.innerHTML = '';
	const cards = await dbGetAllCards();
	cards.sort((a, b) => b.createdAt - a.createdAt);
	for (const c of cards) cardsEl.appendChild(renderCard(c));
}

dbSubscribe(() => render());

cardsEl.addEventListener('click', async (e) => {
	const btn = e.target.closest('button');
	if (!btn) return;
	const act = btn.getAttribute('data-act');
	const container = btn.closest('.actions');
	const id = container?.getAttribute('data-id');
	if (!id) return;
	
	// Show processing state
	const originalText = btn.textContent;
	btn.textContent = '...';
	btn.disabled = true;
	btn.style.opacity = '0.7';
	
	try {
		const cards = await dbGetAllCards();
		const card = cards.find(c => c.id === id);
		if (!card) return;
		
		let nextSnippet = card.snippet;
		
		// Process based on action type
		if (act === 'summ') {
			nextSnippet = await summarizeText(card.snippet);
			btn.textContent = '✓ Summarized';
		} else if (act === 'rewr') {
			nextSnippet = await rewriteText(card.snippet, 'Concise');
			btn.textContent = '✓ Rewritten';
		} else if (act === 'proof') {
			nextSnippet = await proofreadText(card.snippet);
			btn.textContent = '✓ Proofread';
		} else if (act === 'trans') {
			nextSnippet = await translateText(card.snippet, 'fr');
			btn.textContent = '✓ Translated';
		}
		
		const nextBadges = Array.from(new Set([...(card.badges || []), act]));
		await dbUpdateCard(id, { snippet: nextSnippet, badges: nextBadges });
		
		// Restore button after short delay
		setTimeout(() => {
			btn.disabled = false;
			btn.style.opacity = '1';
			btn.textContent = originalText;
		}, 1500);
	} catch (err) {
		btn.textContent = '✗ Error';
		setTimeout(() => {
			btn.disabled = false;
			btn.style.opacity = '1';
			btn.textContent = originalText;
		}, 1500);
	}
});

btnSample.addEventListener('click', async () => {
	const samples = [
		{ title: 'News: AI Breakthrough', url: 'https://news.example/item', favicon: '', snippet: 'Researchers announced a new technique that reduces training costs by 80%.' },
		{ title: 'Wikipedia: Graph Theory', url: 'https://en.wikipedia.org/wiki/Graph_theory', favicon: '', snippet: 'Graph theory is the study of graphs, which are mathematical structures used to model pairwise relations.' },
	];
	for (const s of samples) {
		await dbAddCard({ id: crypto.randomUUID(), createdAt: Date.now(), badges: [], tags: [], evidence: null, ...s });
	}
});

btnDraft.addEventListener('click', () => {
	draftModal.style.display = 'flex';
});
btnCloseDraft.addEventListener('click', () => draftModal.style.display = 'none');
btnGenDraft.addEventListener('click', async () => {
    const cards = await dbGetAllCards();
    const bullets = cards.map(c => c.snippet.split(/[\.!?]/)[0]).slice(0, 12);
    const sources = cards.map(c => ({ title: c.title, url: c.url }));
    const draft = await writeDraft('', bullets, [], sources);
    draftOutput.value = draft;
});
btnCopyDraft.addEventListener('click', async () => {
    await navigator.clipboard.writeText(draftOutput.value || '');
});
btnExportDraftMd.addEventListener('click', async () => {
    const blob = new Blob([draftOutput.value || ''], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tabscribe-draft.md';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
});

btnExportMd.addEventListener('click', () => alert('Export Markdown (coming soon)'));
btnExportMd.addEventListener('click', async () => {
    const cards = await dbGetAllCards();
    const md = exportMarkdown(cards, true);
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tabscribe-export.md';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
});
btnExportDocx.addEventListener('click', async () => {
    const cards = await dbGetAllCards();
    const blob = await exportDocx(cards);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tabscribe-export.docx';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
});
btnCopyAll.addEventListener('click', async () => {
	const cards = await dbGetAllCards();
	const text = cards.map(c => `> ${c.snippet}\n— ${c.title} (${c.url})`).join('\n\n');
	await navigator.clipboard.writeText(text);
	alert('Copied to clipboard');
});

render();
loadMode();
initOnboarding();

chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'tabscribe:card_added') {
        render();
    }
    if (msg?.type === 'tabscribe:mode_changed') {
        modeLabel.textContent = msg.mode === 'hybrid' ? 'Hybrid' : 'Offline';
    }
});

// Multimodal: image drop explain
document.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.style.display = 'block';
});
document.addEventListener('dragleave', (e) => {
    if (e.target === dropzone) dropzone.style.display = 'none';
});
document.addEventListener('drop', async (e) => {
    e.preventDefault();
    dropzone.style.display = 'none';
    const file = e.dataTransfer?.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    const b64 = await fileToDataUrl(file);
    const explanation = await explainImage(b64);
    await dbAddCard({ id: crypto.randomUUID(), createdAt: Date.now(), title: 'Image Note', url: 'about:blank', favicon: '', snippet: explanation, badges: ['image'], tags: [], evidence: { type: 'image', content: b64 } });
});

async function fileToDataUrl(file) {
    return new Promise((resolve) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.readAsDataURL(file);
    });
}

async function explainImage(dataUrl) {
    try {
        if (globalThis.chrome?.ai?.prompt) {
            const task = await chrome.ai.prompt.create({ multimodal: true });
            const res = await task.generate({ input: [{ type: 'image', data: dataUrl }], instructions: 'Explain this image in 2 concise bullets, plain English.' });
            if (res?.output) return res.output;
        }
    } catch {}
    return '• An image was provided.\n• Explanation unavailable in this environment.';
}

function initOnboarding() {
    const key = 'tabscribe_onboarding_dismissed';
    chrome.storage.local.get([key], (res) => {
        if (!res[key]) onboarding.style.display = 'block';
    });
    dismissOnboarding?.addEventListener('click', () => {
        onboarding.style.display = 'none';
        chrome.storage.local.set({ 'tabscribe_onboarding_dismissed': true });
    });
}

btnJudge?.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('judge.html') });
});

// Audio note capture
btnAudio?.addEventListener('click', async () => {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const rec = new MediaRecorder(stream);
        const chunks = [];
        rec.ondataavailable = (e) => chunks.push(e.data);
        rec.onstop = async () => {
            const blob = new Blob(chunks, { type: 'audio/webm' });
            const b64 = await blobToDataUrl(blob);
            const transcript = await transcribeAudio(b64);
            await dbAddCard({ id: crypto.randomUUID(), createdAt: Date.now(), title: 'Audio Note', url: 'about:blank', favicon: '', snippet: transcript, badges: ['audio'], tags: [], evidence: { type: 'audio', content: b64 } });
        };
        rec.start();
        setTimeout(() => rec.stop(), 5000);
    } catch (e) {
        alert('Microphone permission denied.');
    }
});

async function blobToDataUrl(blob) {
    return new Promise((resolve) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.readAsDataURL(blob);
    });
}

async function transcribeAudio(dataUrl) {
    try {
        if (globalThis.chrome?.ai?.prompt) {
            const task = await chrome.ai.prompt.create({ multimodal: true });
            const res = await task.generate({ input: [{ type: 'audio', data: dataUrl }], instructions: 'Transcribe the audio as clear notes.' });
            if (res?.output) return res.output;
        }
    } catch {}
    return 'Audio note captured. Transcription unavailable in this environment.';
}


