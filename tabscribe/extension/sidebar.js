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
const btnPurge = document.getElementById('btn-purge');
const btnOpenAll = document.getElementById('btn-open-all');
const searchInput = document.getElementById('search');

let currentProjectId = 'default';
let showTrash = false;
let allCardsCache = [];

// Purge button only visible in Trash view; Open All hidden in Trash
if (btnPurge) btnPurge.style.display = 'none';
if (btnOpenAll) btnOpenAll.style.display = '';

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
import { fetchMetadata } from './lib/academic.js';
import { formatAPA, formatMLA, formatHarvard, formatBibTeX } from './lib/citations.js';
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
			<div style="margin-left:auto; display:flex; gap:6px; position:relative;">
				<button data-act="cite">Cite ▾</button>
				<button data-act="more">⋮</button>
				<div class="menu" data-menu="cite">
					<button data-cite="bibtex">Copy BibTeX</button>
					<button data-cite="apa">Copy APA</button>
					<button data-cite="mla">Copy MLA</button>
					<button data-cite="harvard">Copy Harvard</button>
				</div>
				<div class="menu" data-menu="more">
					<button data-more="move">Move to… ▸</button>
					<button data-more="delete">Delete</button>
					<button data-more="restore">Restore</button>
				</div>
				<div class="menu" data-menu="move"></div>
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
	// Menus
	const menuMore = el.querySelector('[data-menu="more"]');
	const menuCite = el.querySelector('[data-menu="cite"]');
	const menuMove = el.querySelector('[data-menu="move"]');

	function toggleMenu(menu, show) {
		menu.style.display = show ? 'block' : 'none';
	}

	el.querySelector('[data-act="more"]').addEventListener('click', (e) => {
		e.stopPropagation();
		toggleMenu(menuCite, false);
		toggleMenu(menuMove, false);
		toggleMenu(menuMore, menuMore.style.display !== 'block');
	});
	el.querySelector('[data-act="cite"]').addEventListener('click', (e) => {
		e.stopPropagation();
		toggleMenu(menuMore, false);
		toggleMenu(menuMove, false);
		toggleMenu(menuCite, menuCite.style.display !== 'block');
	});

	document.addEventListener('click', () => { toggleMenu(menuMore, false); toggleMenu(menuCite, false); toggleMenu(menuMove, false); }, { once: true });

	menuMore.querySelector('[data-more="delete"]').addEventListener('click', async () => {
		if (showTrash) {
			try {
				await new Promise(resolve => {
					try { chrome.runtime.sendMessage({ type: 'tabscribe:purge_card', id: card.id }, () => resolve()); }
					catch { resolve(); }
				});
				render();
			} catch {}
		} else {
			await dbSoftDeleteCard(card.id);
		}
	});
	const restoreBtn = menuMore.querySelector('[data-more="restore"]');
	restoreBtn.style.display = showTrash ? '' : 'none';
	restoreBtn.addEventListener('click', async () => { await dbRestoreCard(card.id); });
	menuMore.querySelector('[data-more="move"]').addEventListener('click', async (e) => {
		e.stopPropagation();
		// Cache rects BEFORE awaiting
		const anchor = e.currentTarget;
		const container = menuMore.parentElement;
		const anchorRect = anchor.getBoundingClientRect();
		const containerRect = container.getBoundingClientRect();
		// Populate list of projects
		const projects = await dbGetProjects();
		if (!projects.length) { menuMove.innerHTML = '<button disabled>No projects</button>'; }
		else { menuMove.innerHTML = projects.map(p => `<button data-target="${p.id}">${p.name}</button>`).join(''); }
		// Attach listeners
		menuMove.querySelectorAll('button').forEach(btn => {
			btn.addEventListener('click', async (ev) => {
				ev.stopPropagation();
				const pid = btn.getAttribute('data-target');
				if (pid && pid !== card.projectId) { await dbUpdateCard(card.id, { projectId: pid }); render(); }
				toggleMenu(menuMove, false);
				toggleMenu(menuMore, false);
			});
		});
		// Position relative to the "Move to…" button; flip if overflowing right
		const approxWidth = 240;
		const willOverflowRight = (anchorRect.right + 6 + approxWidth) > (window.innerWidth - 8);
		const topOffset = Math.max(0, anchorRect.top - containerRect.top - 4);
		menuMove.style.top = topOffset + 'px';
		if (willOverflowRight) {
			menuMove.style.left = 'auto';
			menuMove.style.right = (containerRect.right - anchorRect.left + 6) + 'px';
		} else {
			menuMove.style.right = 'auto';
			menuMove.style.left = (anchorRect.right - containerRect.left + 6) + 'px';
		}
		toggleMenu(menuMove, true);
	});

	async function copyCitation(style) {
		let meta = { title: card.title, url: card.url, doi: card.doi, authors: [], year: '', venue: '' };
		try { const fetched = await fetchMetadata({ doi: card.doi, title: card.title }); if (fetched) meta = { ...meta, ...fetched }; } catch {}
		let txt = '';
		if (style === 'bibtex') txt = formatBibTeX(meta);
		else if (style === 'apa') txt = formatAPA(meta);
		else if (style === 'mla') txt = formatMLA(meta);
		else if (style === 'harvard') txt = formatHarvard(meta);
		else txt = formatAPA(meta);
		await navigator.clipboard.writeText(txt);
		try { showToast?.(`Copied ${style.toUpperCase()} citation`); } catch {}
	}
	menuCite.querySelector('[data-cite="bibtex"]').addEventListener('click', () => copyCitation('bibtex'));
	menuCite.querySelector('[data-cite="apa"]').addEventListener('click', () => copyCitation('apa'));
	menuCite.querySelector('[data-cite="mla"]').addEventListener('click', () => copyCitation('mla'));
	menuCite.querySelector('[data-cite="harvard"]').addEventListener('click', () => copyCitation('harvard'));
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
	const sampleId = 'sample-project';
	const projects = await dbGetProjects();
	if (!projects.find(p => p.id === sampleId)) {
		await dbAddProject({ id: sampleId, name: 'Sample Project' });
	}
	currentProjectId = sampleId;
	await loadProjects();

	const samples = [
		{ title: 'arXiv: LLM Hallucinations', url: 'https://arxiv.org/pdf/2401.00001.pdf', favicon: '', snippet: 'We study hallucination taxonomy...', badges: ['pdf'] },
		{ title: 'Nature News: AI Policy', url: 'https://www.nature.com/articles/ai-policy', favicon: '', snippet: 'Regulators push new guidelines...', badges: [] },
		{ title: 'Blog: Eval Methods', url: 'https://example.com/blog/evals', favicon: '', snippet: 'Choosing the right evaluation metrics...', badges: [] },
		{ title: 'Chart Image', url: 'about:blank', favicon: '', snippet: 'Accuracy rose 8%.\\nCost halved across runs.', badges: ['image'] },
		{ title: 'Audio Reminder', url: 'about:blank', favicon: '', snippet: 'Compare eval datasets.', badges: ['audio'] },
	];
	for (const s of samples) {
		await dbAddCard({ id: crypto.randomUUID(), createdAt: Date.now(), projectId: sampleId, deletedAt: null, tags: [], evidence: null, ...s });
	}
	render();
});

btnDraft.addEventListener('click', () => { draftModal.style.display = 'flex'; });
btnCloseDraft.addEventListener('click', () => draftModal.style.display = 'none');
btnGenDraft.addEventListener('click', async () => {
    const cards = allCardsCache.filter(c => c.projectId === currentProjectId && !c.deletedAt);
    const style = citeStyleSel?.value || 'APA';
    // Prepare metadata for each card (Hybrid only fetches real metadata; otherwise fallback minimal)
    const metas = [];
    for (const c of cards) {
        let meta = { title: c.title, url: c.url, doi: c.doi, authors: [], year: '', venue: '' };
        try {
            const fetched = await fetchMetadata({ doi: c.doi, title: c.title });
            if (fetched) meta = { ...meta, ...fetched };
        } catch {}
        metas.push(meta);
    }

    // Build references by selected style
    const fmt = (m) => {
        if (style === 'APA') return formatAPA(m);
        if (style === 'MLA') return formatMLA(m);
        if (style === 'Harvard') return formatHarvard(m);
        if (style === 'BibTeX') return formatBibTeX(m);
        return formatAPA(m);
    };
    const refs = metas.map((m, i) => `[${i+1}] ${fmt(m)}`).join('\n');

    // Ask Writer to compose using inline numeric citations
    const bullets = cards.map(c => c.snippet.split(/[.!?]/)[0]).slice(0, 12).join('\n- ');
    const prompt = `Write a concise research draft with:\n- Intro (1 short paragraph)\n- Key Points as bullets\n- Open Questions\n- References section using the numeric mapping below\n\nKey Points:\n- ${bullets}\n\nMapping (keep [n] inline):\n${refs}`;
    const draft = await writeDraftFromCards(cards, { tone: 'neutral', length: 'medium', promptOverride: prompt });
    // If Writer fallback used raw cards, append references explicitly
    const finalDraft = draft.includes('## Sources') || draft.includes('## References') ? draft : `${draft}\n\n## References\n${refs}`;
    draftOutput.value = finalDraft;
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
    // Inline numeric refs; basic export keeps [n] markers
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
btnTrash.addEventListener('click', () => { 
    showTrash = !showTrash; 
    btnTrash.textContent = showTrash ? 'Back' : 'Trash'; 
    if (btnPurge) btnPurge.style.display = showTrash ? '' : 'none';
    if (btnOpenAll) btnOpenAll.style.display = showTrash ? 'none' : '';
    render(); 
});
btnPurge.addEventListener('click', async () => {
    if (!showTrash) { alert('Open Trash view first.'); return; }
    if (!confirm('Permanently delete all items in Trash? This cannot be undone.')) return;
    const cards = allCardsCache.filter(c => c.projectId === currentProjectId && !!c.deletedAt);
    for (const c of cards) {
        try {
            await chrome.runtime.sendMessage({ type: 'tabscribe:purge_card', id: c.id });
        } catch {}
    }
    setTimeout(() => render(), 300);
});
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


