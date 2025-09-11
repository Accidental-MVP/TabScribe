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

function renderCard(card) {
	const el = document.createElement('article');
	el.className = 'card';
	el.innerHTML = `
		<div class="card-head">
			<img class="fav" src="${card.favicon || 'icons/icon16.png'}" alt=""/>
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
	const cards = await dbGetAllCards();
	const card = cards.find(c => c.id === id);
	if (!card) return;
	let nextSnippet = card.snippet;
	if (act === 'summ') nextSnippet = await summarizeText(card.snippet);
	if (act === 'rewr') nextSnippet = await rewriteText(card.snippet, 'Concise');
	if (act === 'proof') nextSnippet = await proofreadText(card.snippet);
	if (act === 'trans') nextSnippet = await translateText(card.snippet, 'fr');
	const nextBadges = Array.from(new Set([...(card.badges || []), act]));
	await dbUpdateCard(id, { snippet: nextSnippet, badges: nextBadges });
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
	// Placeholder for Draft Writer UI
	alert('Draft Report (coming soon)');
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

chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'tabscribe:card_added') {
        render();
    }
    if (msg?.type === 'tabscribe:mode_changed') {
        modeLabel.textContent = msg.mode === 'hybrid' ? 'Hybrid' : 'Offline';
    }
});


