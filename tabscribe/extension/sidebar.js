import { dbGetAllCards, dbAddCard, dbSubscribe, dbUpdateCard, dbGetCardsByProject, dbAddProject, dbGetProjects, dbUpdateProject, dbSoftDeleteCard, dbRestoreCard } from './lib/db.js';
import { summarizeText } from './ai/summarize.js';
import { rewriteText } from './ai/rewriter.js';
import { proofreadText } from './ai/proofreader.js';
import { translateText } from './ai/translator.js';
import { exportMarkdown, exportDocx } from './lib/exports.js';

const cardsEl = document.getElementById('cards');
const btnSample = document.getElementById('btn-sample');
const btnDraft = document.getElementById('btn-draft');
const modeLabel = document.getElementById('mode-label');
const projectSelect = document.getElementById('project-select');
const btnNewProject = document.getElementById('btn-new-project');
const btnTrash = document.getElementById('btn-trash');
const btnOpenAll = document.getElementById('btn-open-all');
const searchInput = document.getElementById('search');

let currentProjectId = 'default';
let showTrash = false;
let allCardsCache = [];

async function ensureDefaultProject() {
    let projects = await dbGetProjects();
    if (!projects.find(p => p.id === 'default')) {
        await dbAddProject({ id: 'default', name: 'My Project' });
        projects = await dbGetProjects();
    }
    return projects;
}

async function loadProjects() {
    const projects = await ensureDefaultProject();
    projectSelect.innerHTML = '';
    for (const p of projects) {
        const opt = document.createElement('option');
        opt.value = p.id; opt.textContent = p.name;
        if (p.id === currentProjectId) opt.selected = true;
        projectSelect.appendChild(opt);
    }
}

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
import { writeDraftFromCards } from './ai/writer.js';
import { promptMultimodal } from './ai/prompt.js';
const dropzone = document.getElementById('dropzone');
const onboarding = document.getElementById('onboarding');
const dismissOnboarding = document.getElementById('dismiss-onboarding');

function renderCard(card) {
	const el = document.createElement('article');
	el.className = 'card';
	
	const badgesHtml = card.badges && card.badges.length ? `
		<div class="card-badges">
			${card.badges.map(badge => {
				const label = {
					'summ': 'Summarized',
					'rewr': 'Rewritten',
					'proof': 'Proofread',
					'trans': 'Translated',
					'image': 'Image',
					'audio': 'Audio',
					'pdf': 'PDF'
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
			<div style="margin-left:auto; display:flex; gap:6px;">
				<button data-act="cite">Cite ▾</button>
				<button data-act="more">⋮</button>
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
	// Simple context actions
	el.querySelector('[data-act="more"]').addEventListener('click', async () => {
		const op = prompt('Action: move|delete|restore');
		if (op === 'delete') await dbSoftDeleteCard(card.id);
		if (op === 'restore') await dbRestoreCard(card.id);
		if (op === 'move') {
			const pid = prompt('Move to project id:');
			if (pid) await dbUpdateCard(card.id, { projectId: pid });
		}
	});
	el.querySelector('[data-act="cite"]').addEventListener('click', async () => {
		const op = prompt('Cite: bibtex|apa|mla');
		if (!op) return;
		// Placeholder: real metadata fetch hooked later
		const meta = { title: card.title, url: card.url, authors: [], year: '', venue: '', doi: card.doi };
		if (op === 'bibtex') await navigator.clipboard.writeText('@article{ref, title={' + (meta.title||'') + '}, url={' + (meta.url||'') + '}}');
		if (op === 'apa') await navigator.clipboard.writeText(`${meta.title}. ${meta.url}`);
		if (op === 'mla') await navigator.clipboard.writeText(`${meta.title}. ${meta.url}`);
	});
	return el;
}

function escapeHtml(s) {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

async function loadAllCards() {
	allCardsCache = await dbGetAllCards();
}

async function render() {
	await loadAllCards();
	let cards = allCardsCache.filter(c => c.projectId === currentProjectId && (showTrash ? !!c.deletedAt : !c.deletedAt));
	const q = (searchInput?.value || '').toLowerCase().trim();
	if (q) {
		cards = cards.filter(c => (c.title||'').toLowerCase().includes(q) || (c.url||'').toLowerCase().includes(q) || (c.snippet||'').toLowerCase().includes(q) || (c.tags||[]).join(' ').toLowerCase().includes(q));
	}
	cardsEl.innerHTML = '';
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
	
	const originalText = btn.textContent;
	btn.textContent = '...';
	btn.disabled = true;
	btn.style.opacity = '0.7';
	const t0 = performance.now();
	
	try {
		const cards = allCardsCache;
		const card = cards.find(c => c.id === id);
		if (!card) return;
		
		let nextSnippet = card.snippet;
		if (act === 'summ') { nextSnippet = await summarizeText(card.snippet); btn.textContent = '✓ Summarized'; }
		else if (act === 'rewr') { nextSnippet = await rewriteText(card.snippet, 'Concise'); btn.textContent = '✓ Rewritten'; }
		else if (act === 'proof') { nextSnippet = await proofreadText(card.snippet); btn.textContent = '✓ Proofread'; }
		else if (act === 'trans') { nextSnippet = await translateText(card.snippet, 'fr'); btn.textContent = '✓ Translated'; }
		
		const latency = ((performance.now() - t0)/1000).toFixed(1);
		btn.title = `Completed in ${latency}s`;
		const nextBadges = Array.from(new Set([...(card.badges || []), act]));
		await dbUpdateCard(id, { snippet: nextSnippet, badges: nextBadges });
		
		setTimeout(() => {
			btn.disabled = false;
			btn.style.opacity = '1';
			btn.textContent = originalText;
		}, 1500);
	} catch {
		btn.textContent = '✗ Error';
		setTimeout(() => { btn.disabled = false; btn.style.opacity = '1'; btn.textContent = originalText; }, 1500);
	}
});

btnSample.addEventListener('click', async () => {
	const samples = [
		{ title: 'arXiv: LLM Hallucinations', url: 'https://arxiv.org/pdf/2401.00001.pdf', favicon: '', snippet: 'We study hallucination taxonomy...', badges: ['pdf'] },
		{ title: 'Nature News: AI Policy', url: 'https://www.nature.com/articles/ai-policy', favicon: '', snippet: 'Regulators push new guidelines...', badges: [] },
		{ title: 'Blog: Eval Methods', url: 'https://example.com/blog/evals', favicon: '', snippet: 'Choosing the right evaluation metrics...', badges: [] },
		{ title: 'Chart Image', url: 'about:blank', favicon: '', snippet: 'Accuracy rose 8%.\nCost halved across runs.', badges: ['image'] },
		{ title: 'Audio Reminder', url: 'about:blank', favicon: '', snippet: 'Compare eval datasets.', badges: ['audio'] },
	];
	for (const s of samples) {
		await dbAddCard({ id: crypto.randomUUID(), createdAt: Date.now(), projectId: currentProjectId, deletedAt: null, tags: [], evidence: null, ...s });
	}
});

btnDraft.addEventListener('click', () => { draftModal.style.display = 'flex'; });
btnCloseDraft.addEventListener('click', () => draftModal.style.display = 'none');
btnGenDraft.addEventListener('click', async () => {
    const cards = allCardsCache.filter(c => c.projectId === currentProjectId && !c.deletedAt);
    const draft = await writeDraftFromCards(cards, { tone: 'neutral', length: 'medium' });
    draftOutput.value = draft;
});
btnCopyDraft.addEventListener('click', async () => { await navigator.clipboard.writeText(draftOutput.value || ''); });
btnExportDraftMd.addEventListener('click', async () => {
    const blob = new Blob([draftOutput.value || ''], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'tabscribe-draft.md';
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
});

btnExportMd.addEventListener('click', async () => {
    const cards = allCardsCache.filter(c => c.projectId === currentProjectId && !c.deletedAt);
    const md = exportMarkdown(cards, true);
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'tabscribe-export.md';
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
});
btnExportDocx.addEventListener('click', async () => {
    const cards = allCardsCache.filter(c => c.projectId === currentProjectId && !c.deletedAt);
    const blob = await exportDocx(cards);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'tabscribe-export.docx';
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
});
btnCopyAll.addEventListener('click', async () => {
	const cards = allCardsCache.filter(c => c.projectId === currentProjectId && !c.deletedAt);
	const text = cards.map(c => `> ${c.snippet}\n— ${c.title} (${c.url})`).join('\n\n');
	await navigator.clipboard.writeText(text);
	alert('Copied to clipboard');
});

projectSelect.addEventListener('change', async () => {
	currentProjectId = projectSelect.value;
	render();
});
btnNewProject.addEventListener('click', async () => {
	const name = prompt('Project name');
	if (!name) return;
	const id = `p_${Date.now()}`;
	await dbAddProject({ id, name });
	currentProjectId = id;
	await loadProjects();
	render();
});
btnTrash.addEventListener('click', () => { showTrash = !showTrash; btnTrash.textContent = showTrash ? 'Back' : 'Trash'; render(); });
btnOpenAll.addEventListener('click', async () => {
    const cards = allCardsCache.filter(c => c.projectId === currentProjectId && !c.deletedAt);
    for (const c of cards) {
        try { if (c.url && c.url.startsWith('http')) chrome.tabs.create({ url: c.url }); } catch {}
    }
});
searchInput.addEventListener('input', () => render());

render();
loadMode();
loadProjects();
initOnboarding();

chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'tabscribe:card_added') { render(); }
    if (msg?.type === 'tabscribe:mode_changed') { modeLabel.textContent = msg.mode === 'hybrid' ? 'Hybrid' : 'Offline'; }
    if (msg?.type === 'tabscribe:model_progress') { showToast(`${msg.api}: ${(msg.loaded * 100).toFixed(0)}%`); }
});

// Multimodal: image drop explain
document.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.style.display = 'block'; });
document.addEventListener('dragleave', (e) => { if (e.target === dropzone) dropzone.style.display = 'none'; });
document.addEventListener('drop', async (e) => {
    e.preventDefault(); dropzone.style.display = 'none';
    const file = e.dataTransfer?.files?.[0]; if (!file || !file.type.startsWith('image/')) return;
    const explanation = await promptMultimodal([
        { type: 'text', value: 'Explain this image in 2 concise bullets, plain English.' },
        { type: 'image', value: file }
    ], ['image']);
    await dbAddCard({ id: crypto.randomUUID(), createdAt: Date.now(), projectId: currentProjectId, deletedAt: null, title: 'Image Note', url: 'about:blank', favicon: '', snippet: explanation || 'Explanation unavailable.', badges: ['image'], tags: [], evidence: { type: 'image', content: await fileToDataUrl(file) } });
});

async function fileToDataUrl(file) {
    return new Promise((resolve) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.readAsDataURL(file); });
}

function initOnboarding() {
    const key = 'tabscribe_onboarding_dismissed';
    chrome.storage.local.get([key], (res) => { if (!res[key]) onboarding.style.display = 'block'; });
    dismissOnboarding?.addEventListener('click', () => { onboarding.style.display = 'none'; chrome.storage.local.set({ 'tabscribe_onboarding_dismissed': true }); });
}

btnJudge?.addEventListener('click', () => { chrome.tabs.create({ url: chrome.runtime.getURL('judge.html') }); });

// Audio note capture
btnAudio?.addEventListener('click', async () => {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const rec = new MediaRecorder(stream); const chunks = [];
        rec.ondataavailable = (e) => chunks.push(e.data);
        rec.onstop = async () => {
            const blob = new Blob(chunks, { type: 'audio/webm' });
            const transcript = await promptMultimodal([
                { type: 'text', value: 'Transcribe the audio as clear, concise notes.' },
                { type: 'audio', value: blob }
            ], ['audio']);
            await dbAddCard({ id: crypto.randomUUID(), createdAt: Date.now(), projectId: currentProjectId, deletedAt: null, title: 'Audio Note', url: 'about:blank', favicon: '', snippet: transcript || 'Transcription unavailable.', badges: ['audio'], tags: [], evidence: { type: 'audio', content: await blobToDataUrl(blob) } });
        };
        rec.start(); setTimeout(() => rec.stop(), 5000);
    } catch (e) { alert('Microphone permission denied.'); }
});

async function blobToDataUrl(blob) { return new Promise((resolve) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.readAsDataURL(blob); }); }

function showToast(text) {
    let el = document.getElementById('toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; el.style.position = 'fixed'; el.style.bottom = '16px'; el.style.right = '16px'; el.style.background = '#101522'; el.style.border = '1px solid #2a3142'; el.style.color = '#e6e6e6'; el.style.borderRadius = '8px'; el.style.padding = '8px 12px'; el.style.zIndex = '9999'; document.body.appendChild(el); }
    el.textContent = text; el.style.opacity = '1'; clearTimeout(showToast._t); showToast._t = setTimeout(() => { el.style.opacity = '0'; }, 1500);
}


