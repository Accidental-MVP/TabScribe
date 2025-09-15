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
const newProjectForm = document.getElementById('new-project-form');
const newProjectName = document.getElementById('new-project-name');
const btnCreateProject = document.getElementById('btn-create-project');
const btnCancelProject = document.getElementById('btn-cancel-project');
const btnDeleteProject = document.getElementById('btn-delete-project');
const deleteProjectConfirm = document.getElementById('delete-project-confirm');
const deleteProjectName = document.getElementById('delete-project-name');
const btnConfirmDelete = document.getElementById('btn-confirm-delete');
const btnCancelDelete = document.getElementById('btn-cancel-delete');

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
    
    // Show/hide delete button based on selected project
    updateDeleteButtonVisibility();
}

function updateDeleteButtonVisibility() {
    const selectedProject = projectSelect.options[projectSelect.selectedIndex];
    if (selectedProject && selectedProject.value !== 'default') {
        btnDeleteProject.style.display = '';
    } else {
        btnDeleteProject.style.display = 'none';
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
    if (next === 'hybrid') {
        const key = await getApiKey();
        hybridBanner.style.display = key ? 'none' : 'block';
    } else {
        hybridBanner.style.display = 'none';
    }
});
const btnExportMd = document.getElementById('btn-export-md');
const btnExportDocx = document.getElementById('btn-export-docx');
const btnCopyAll = document.getElementById('btn-copy-all');
const btnJudge = document.getElementById('btn-judge');
const btnAudio = document.getElementById('btn-audio');
const draftModal = document.getElementById('draft-modal');
const similarModal = document.getElementById('similar-modal');
const lensList = document.getElementById('lens-list');
const lensGraph = document.getElementById('lens-graph');
const refreshLens = document.getElementById('refresh-lens');
const filterOA = document.getElementById('filter-oa');
const filterRecent = document.getElementById('filter-recent');
const lensPagination = document.getElementById('lens-pagination');
const lensPrev = document.getElementById('lens-prev');
const lensNext = document.getElementById('lens-next');
const lensPageInfo = document.getElementById('lens-page-info');
const graphMaximize = document.getElementById('graph-maximize');
const graphReset = document.getElementById('graph-reset');
const graphToggleLabels = document.getElementById('graph-toggle-labels');
const graphStats = document.getElementById('graph-stats');
const closeSimilar = document.getElementById('close-similar');
const btnGenDraft = document.getElementById('btn-generate-draft');
const btnCloseDraft = document.getElementById('btn-close-draft');
const draftOutput = document.getElementById('draft-output');
const citeStyleSel = document.getElementById('cite-style');
const btnCopyDraft = document.getElementById('btn-copy-draft');
const btnExportDraftMd = document.getElementById('btn-export-draft-md');
import { writeDraftFromCards } from './ai/writer.js';
import { fetchMetadata, resolveOpenAlex, getReferences, getCitedBy, scoreSimilar } from './lib/academic.js';
import { formatAPA, formatMLA, formatHarvard, formatBibTeX } from './lib/citations.js';
import { getApiKey } from './lib/settings.js';
import { promptMultimodal } from './ai/prompt.js';
const dropzone = document.getElementById('dropzone');
const onboarding = document.getElementById('onboarding');
const dismissOnboarding = document.getElementById('dismiss-onboarding');
const hybridBanner = document.getElementById('hybrid-banner');
const openOptionsBtn = document.getElementById('open-options');

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
					<button data-more="similar">Find similar</button>
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

	(function setupOutsideClose(){
		const handler = (ev) => {
			const t = ev.target;
			const clickedInsideMenus = menuMore.contains(t) || menuCite.contains(t) || menuMove.contains(t);
			const clickedOnToggles = !!(t.closest('[data-act="more"]') || t.closest('[data-act="cite"]'));
			if (!clickedInsideMenus && !clickedOnToggles) {
				toggleMenu(menuMore, false);
				toggleMenu(menuCite, false);
				toggleMenu(menuMove, false);
			}
		};
		document.addEventListener('click', handler);
	})();

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
	menuMore.querySelector('[data-more="similar"]').addEventListener('click', async () => {
		similarModal.style.display = 'flex';
		lensList.textContent = 'Searching…';
		try {
			const key = await getApiKey();
			if (!key) { lensList.textContent = 'Enable Hybrid and set an API key in Options.'; return; }
			await openLiteratureLens(card);
		} catch { lensList.textContent = 'Search failed.'; }
	});
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
	try { chrome.storage.local.set({ 'tabscribe_current_project': currentProjectId }); } catch {}
	updateDeleteButtonVisibility();
	render();
});
btnNewProject.addEventListener('click', () => {
	newProjectForm.style.display = 'block';
	newProjectName.focus();
});

btnCreateProject.addEventListener('click', async () => {
	const name = newProjectName.value.trim();
	if (!name) return;
	
	const id = `p_${Date.now()}`;
	await dbAddProject({ id, name });
	currentProjectId = id;
	await loadProjects();
	
	// Hide form and clear input
	newProjectForm.style.display = 'none';
	newProjectName.value = '';
	
	render();
});

btnCancelProject.addEventListener('click', () => {
	newProjectForm.style.display = 'none';
	newProjectName.value = '';
});

// Handle Enter key in project name input
newProjectName.addEventListener('keypress', (e) => {
	if (e.key === 'Enter') {
		btnCreateProject.click();
	}
});

// Project deletion functionality
btnDeleteProject.addEventListener('click', () => {
	const selectedProject = projectSelect.options[projectSelect.selectedIndex];
	if (!selectedProject) return;
	
	// Don't allow deletion of default project
	if (selectedProject.value === 'default') {
		showToast('Cannot delete the default project');
		return;
	}
	
	deleteProjectName.textContent = selectedProject.textContent;
	deleteProjectConfirm.style.display = 'block';
});

btnConfirmDelete.addEventListener('click', async () => {
	const selectedProject = projectSelect.options[projectSelect.selectedIndex];
	if (!selectedProject) return;
	
	const projectId = selectedProject.value;
	
	try {
		// Delete all cards in this project first
		const cards = await dbGetCardsByProject(projectId);
		for (const card of cards) {
			await dbDeleteCard(card.id);
		}
		
		// Delete the project
		await dbDeleteProject(projectId);
		
		// Switch to default project
		currentProjectId = 'default';
		await loadProjects();
		
		// Hide confirmation and show success
		deleteProjectConfirm.style.display = 'none';
		showToast(`Project "${selectedProject.textContent}" deleted`);
		
		render();
	} catch (error) {
		console.error('Error deleting project:', error);
		showToast('Error deleting project');
	}
});

btnCancelDelete.addEventListener('click', () => {
	deleteProjectConfirm.style.display = 'none';
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
openOptionsBtn?.addEventListener('click', () => { try { chrome.runtime.openOptionsPage(); } catch {} });

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

function renderSimilar(items = []) {
    if (!Array.isArray(items) || items.length === 0) { lensList.textContent = 'No results.'; return; }
    lensList.innerHTML = items.map((m, i) => `
        <div style="display:flex; gap:8px; align-items:center; margin:8px 0;">
            <div style="flex:1;">
                <div style="font-weight:600;">${escapeHtml(m.title || 'Untitled')}</div>
                <div style="opacity:0.8; font-size:12px;">${escapeHtml((m.venue || '') + (m.year ? ' · ' + m.year : ''))}</div>
            </div>
            <button data-sim-act="open" data-url="${m.url || (m.doi ? 'https://doi.org/' + m.doi : '')}">Open</button>
            <button data-sim-act="add" data-title="${escapeHtml(m.title || '')}" data-url="${m.url || ''}" data-doi="${m.doi || ''}">Add</button>
            <button data-sim-act="cite" data-title="${escapeHtml(m.title || '')}" data-url="${m.url || ''}" data-doi="${m.doi || ''}">Cite</button>
        </div>
    `).join('');
    // Wire actions
    lensList.querySelectorAll('button[data-sim-act="open"]').forEach(b => b.addEventListener('click', () => {
        const url = b.getAttribute('data-url');
        if (url && url.startsWith('http')) chrome.tabs.create({ url });
    }));
    lensList.querySelectorAll('button[data-sim-act="add"]').forEach(b => b.addEventListener('click', async () => {
        const title = b.getAttribute('data-title');
        const url = b.getAttribute('data-url');
        const doi = b.getAttribute('data-doi');
        await dbAddCard({ id: crypto.randomUUID(), createdAt: Date.now(), projectId: currentProjectId, deletedAt: null, title, url, favicon: '', snippet: 'Added from Similar Papers', badges: [], tags: [], doi });
        showToast('Added to project');
    }));
    lensList.querySelectorAll('button[data-sim-act="cite"]').forEach(b => b.addEventListener('click', async () => {
        const meta = { title: b.getAttribute('data-title'), url: b.getAttribute('data-url'), doi: b.getAttribute('data-doi'), authors: [], year: '', venue: '' };
        await navigator.clipboard.writeText(formatAPA(meta));
        showToast('Copied citation');
    }));
}

closeSimilar?.addEventListener('click', () => { similarModal.style.display = 'none'; });

async function openLiteratureLens(card) {
    // Cache by DOI or URL, TTL 7 days
    const cacheKey = `lens_${card.doi || card.url}`;
    chrome.storage.local.get([cacheKey], async (res) => {
        const cached = res?.[cacheKey];
        if (cached && (Date.now() - (cached.savedAt || 0)) < 7*24*60*60*1000) {
            renderLens(card, cached.payload);
            return;
        }
        // Resolve base work
        const base = await resolveOpenAlex({ doi: card.doi, title: card.title }).catch(() => null);
        if (!base?.openalex_id) { lensList.textContent = 'Could not resolve paper in OpenAlex.'; return; }
        // Fetch refs and cited-by
        const [refs, cited] = await Promise.all([
            getReferences(base.openalex_id),
            getCitedBy(base.openalex_id)
        ]);
        // Compute similar from union pool
        const pool = [...refs, ...cited];
        const similar = scoreSimilar(base, pool).slice(0, 30);
        const payload = { base, refs, cited, similar };
        chrome.storage.local.set({ [cacheKey]: { savedAt: Date.now(), payload } });
        renderLens(card, payload);
    });
}

// Lightweight D3-like implementation for Chrome extensions
class MiniD3 {
    constructor(container) {
        this.container = container;
        this.svg = null;
        this.width = 0;
        this.height = 0;
        this.transform = { x: 0, y: 0, k: 1 };
        this.isMaximized = false;
        this.showLabels = true;
    }
    
    select(selector) {
        return new MiniD3Selection(this.container.querySelector(selector));
    }
    
    createSVG(width, height) {
        this.width = width;
        this.height = height;
        this.container.innerHTML = '';
        
        this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        this.svg.setAttribute('width', width);
        this.svg.setAttribute('height', height);
        this.svg.style.background = '#1a1d29';
        this.svg.style.borderRadius = '8px';
        this.svg.style.cursor = 'grab';
        
        // Add zoom/pan functionality
        this.setupZoomPan();
        
        this.container.appendChild(this.svg);
        return new MiniD3Selection(this.svg);
    }
    
    setupZoomPan() {
        let isDragging = false;
        let startX, startY;
        
        this.svg.addEventListener('mousedown', (e) => {
            if (e.target.tagName === 'circle') return; // Don't pan when clicking nodes
            isDragging = true;
            startX = e.clientX - this.transform.x;
            startY = e.clientY - this.transform.y;
            this.svg.style.cursor = 'grabbing';
        });
        
        this.svg.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            this.transform.x = e.clientX - startX;
            this.transform.y = e.clientY - startY;
            this.updateTransform();
        });
        
        this.svg.addEventListener('mouseup', () => {
            isDragging = false;
            this.svg.style.cursor = 'grab';
        });
        
        this.svg.addEventListener('wheel', (e) => {
            e.preventDefault();
            const rect = this.svg.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            
            const scaleFactor = e.deltaY > 0 ? 0.9 : 1.1;
            const newK = Math.max(0.1, Math.min(3, this.transform.k * scaleFactor));
            
            this.transform.x = mouseX - (mouseX - this.transform.x) * (newK / this.transform.k);
            this.transform.y = mouseY - (mouseY - this.transform.y) * (newK / this.transform.k);
            this.transform.k = newK;
            
            this.updateTransform();
        });
    }
    
    updateTransform() {
        const g = this.svg.querySelector('g.zoom-group');
        if (g) {
            g.setAttribute('transform', `translate(${this.transform.x}, ${this.transform.y}) scale(${this.transform.k})`);
        }
    }
    
    resetZoom() {
        this.transform = { x: 0, y: 0, k: 1 };
        this.updateTransform();
    }
    
    maximize() {
        this.isMaximized = !this.isMaximized;
        if (this.isMaximized) {
            this.container.style.position = 'fixed';
            this.container.style.top = '0';
            this.container.style.left = '0';
            this.container.style.width = '100vw';
            this.container.style.height = '100vh';
            this.container.style.zIndex = '10000';
            this.container.style.background = '#0f1419';
            this.svg.setAttribute('width', window.innerWidth);
            this.svg.setAttribute('height', window.innerHeight);
            this.width = window.innerWidth;
            this.height = window.innerHeight;
        } else {
            this.container.style.position = 'relative';
            this.container.style.top = '';
            this.container.style.left = '';
            this.container.style.width = '';
            this.container.style.height = '280px';
            this.container.style.zIndex = '';
            this.container.style.background = '';
            this.svg.setAttribute('width', 500);
            this.svg.setAttribute('height', 280);
            this.width = 500;
            this.height = 280;
        }
        this.resetZoom();
    }
    
    toggleLabels() {
        this.showLabels = !this.showLabels;
        const labels = this.svg.querySelectorAll('.node-label');
        labels.forEach(label => {
            label.style.display = this.showLabels ? 'block' : 'none';
        });
    }
}

class MiniD3Selection {
    constructor(element) {
        this.element = element;
    }
    
    append(tagName) {
        const element = document.createElementNS('http://www.w3.org/2000/svg', tagName);
        this.element.appendChild(element);
        return new MiniD3Selection(element);
    }
    
    attr(name, value) {
        if (value !== undefined) {
            this.element.setAttribute(name, value);
            return this;
        }
        return this.element.getAttribute(name);
    }
    
    style(name, value) {
        if (value !== undefined) {
            this.element.style[name] = value;
            return this;
        }
        return this.element.style[name];
    }
    
    text(content) {
        if (content !== undefined) {
            this.element.textContent = content;
            return this;
        }
        return this.element.textContent;
    }
    
    on(event, handler) {
        this.element.addEventListener(event, handler);
        return this;
    }
    
    selectAll(selector) {
        const elements = this.element.querySelectorAll(selector);
        return new MiniD3SelectionAll(Array.from(elements));
    }
    
    data(dataArray) {
        return new MiniD3DataSelection(this.element, dataArray);
    }
}

class MiniD3SelectionAll {
    constructor(elements) {
        this.elements = elements;
    }
    
    data(dataArray) {
        return new MiniD3DataSelectionAll(this.elements, dataArray);
    }
}

class MiniD3DataSelection {
    constructor(element, dataArray) {
        this.element = element;
        this.dataArray = dataArray;
    }
    
    enter() {
        return new MiniD3EnterSelection(this.element, this.dataArray);
    }
}

class MiniD3DataSelectionAll {
    constructor(elements, dataArray) {
        this.elements = elements;
        this.dataArray = dataArray;
    }
    
    enter() {
        return new MiniD3EnterSelectionAll(this.elements, this.dataArray);
    }
}

class MiniD3EnterSelection {
    constructor(element, dataArray) {
        this.element = element;
        this.dataArray = dataArray;
    }
    
    append(tagName) {
        const elements = this.dataArray.map(() => {
            const el = document.createElementNS('http://www.w3.org/2000/svg', tagName);
            this.element.appendChild(el);
            return el;
        });
        return new MiniD3SelectionAll(elements);
    }
}

class MiniD3EnterSelectionAll {
    constructor(elements, dataArray) {
        this.elements = elements;
        this.dataArray = dataArray;
    }
    
    append(tagName) {
        const newElements = this.dataArray.map(() => {
            const el = document.createElementNS('http://www.w3.org/2000/svg', tagName);
            // Append to the first element's parent
            if (this.elements.length > 0) {
                this.elements[0].parentNode.appendChild(el);
            }
            return el;
        });
        return new MiniD3SelectionAll(newElements);
    }
}

// Global d3-like object
window.d3 = {
    select: (selector) => new MiniD3Selection(document.querySelector(selector))
};

// Capture last payload for tab switch re-renders
function renderLens(card, payload) {
    window.__lens_last_payload = payload;
    window.__lens_current_page = 1;
    window.__lens_page_size = 10;
    
    const tab = document.querySelector('[data-lens-tab].active')?.getAttribute('data-lens-tab') || 'similar';
    const list = tab === 'refs' ? payload.refs : tab === 'cited' ? payload.cited : payload.similar;
    
    renderSimilarPaginated(list);
    updatePagination(list.length);
    
    // Render D3 graph
    renderLiteratureGraph(payload);
}

function renderLiteratureGraph(payload) {
    const miniD3 = new MiniD3(lensGraph);
    const svg = miniD3.createSVG(450, 250); // Adjusted for modal constraints
    
    // Create zoom group
    const g = svg.append('g').attr('class', 'zoom-group');
    
    const centerX = 225; // Centered in adjusted space
    const centerY = 125;
    
    // Update stats
    graphStats.textContent = `${payload.refs.length} refs • ${payload.cited.length} cited • ${payload.similar.length} similar`;
    
    // Center node (current paper) - much larger and more prominent
    const centerNode = g.append('circle')
        .attr('cx', centerX)
        .attr('cy', centerY)
        .attr('r', 20)
        .attr('fill', '#22d3ee')
        .attr('stroke', '#1f2937')
        .attr('stroke-width', 3)
        .attr('title', payload.base?.title || 'Current Paper')
        .style('cursor', 'pointer');
    
    // Add center node text with better styling
    g.append('text')
        .attr('x', centerX)
        .attr('y', centerY + 6)
        .attr('text-anchor', 'middle')
        .attr('font-size', '12px')
        .attr('font-weight', 'bold')
        .attr('fill', '#fff')
        .text('CURRENT');
    
    // Add center node subtitle
    g.append('text')
        .attr('x', centerX)
        .attr('y', centerY + 20)
        .attr('text-anchor', 'middle')
        .attr('font-size', '8px')
        .attr('fill', '#9ca3af')
        .text(payload.base?.title?.substring(0, 30) + (payload.base?.title?.length > 30 ? '...' : '') || 'Paper');
    
    // Reference nodes (inner ring) - more nodes, better spacing
    const refNodes = payload.refs.slice(0, 14).map((ref, i) => {
        const angle = (i / Math.min(payload.refs.length, 14)) * 2 * Math.PI;
        const radius = 55;
        return {
            x: centerX + Math.cos(angle) * radius,
            y: centerY + Math.sin(angle) * radius,
            data: ref,
            angle: angle,
            index: i
        };
    });
    
    // Cited-by nodes (outer ring) - more nodes, better spacing
    const citedNodes = payload.cited.slice(0, 20).map((cited, i) => {
        const angle = (i / Math.min(payload.cited.length, 20)) * 2 * Math.PI;
        const radius = 90;
        return {
            x: centerX + Math.cos(angle) * radius,
            y: centerY + Math.sin(angle) * radius,
            data: cited,
            angle: angle,
            index: i
        };
    });
    
    // Draw links for references with better styling
    refNodes.forEach(node => {
        g.append('line')
            .attr('x1', centerX)
            .attr('y1', centerY)
            .attr('x2', node.x)
            .attr('y2', node.y)
            .attr('stroke', '#5eead4')
            .attr('stroke-width', 1.5)
            .attr('opacity', 0.7);
    });
    
    // Draw links for cited-by with better styling
    citedNodes.forEach(node => {
        g.append('line')
            .attr('x1', centerX)
            .attr('y1', centerY)
            .attr('x2', node.x)
            .attr('y2', node.y)
            .attr('stroke', '#fbbf24')
            .attr('stroke-width', 1.5)
            .attr('opacity', 0.7);
    });
    
    // Draw reference nodes with labels
    refNodes.forEach(node => {
        const group = g.append('g').attr('class', 'ref-node');
        
        const circle = group.append('circle')
            .attr('cx', node.x)
            .attr('cy', node.y)
            .attr('r', 6)
            .attr('fill', '#5eead4')
            .attr('stroke', '#1f2937')
            .attr('stroke-width', 1.5)
            .attr('title', node.data?.title || 'Reference')
            .style('cursor', 'pointer');
        
        // Add label
        const label = group.append('text')
            .attr('class', 'node-label')
            .attr('x', node.x)
            .attr('y', node.y - 10)
            .attr('text-anchor', 'middle')
            .attr('font-size', '8px')
            .attr('fill', '#5eead4')
            .attr('font-weight', 'bold')
            .text(`R${node.index + 1}`);
        
        // Add hover effects
        circle.on('mouseenter', function() {
            this.setAttribute('r', 8);
            this.setAttribute('fill', '#7dd3fc');
            label.attr('font-size', '10px');
        });
        
        circle.on('mouseleave', function() {
            this.setAttribute('r', 6);
            this.setAttribute('fill', '#5eead4');
            label.attr('font-size', '8px');
        });
        
        circle.on('click', () => {
            if (node.data) {
                dbAddCard({
                    id: crypto.randomUUID(),
                    createdAt: Date.now(),
                    projectId: currentProjectId,
                    deletedAt: null,
                    title: node.data.title || '',
                    url: node.data.url || '',
                    favicon: '',
                    snippet: 'Added from Literature Lens (reference)',
                    badges: [],
                    tags: [],
                    doi: node.data.doi || ''
                });
                showToast(`Added ${node.data.title || 'reference'} to project`);
            }
        });
    });
    
    // Draw cited-by nodes with labels
    citedNodes.forEach(node => {
        const group = g.append('g').attr('class', 'cited-node');
        
        const circle = group.append('circle')
            .attr('cx', node.x)
            .attr('cy', node.y)
            .attr('r', 5)
            .attr('fill', '#fbbf24')
            .attr('stroke', '#1f2937')
            .attr('stroke-width', 1.5)
            .attr('title', node.data?.title || 'Citation')
            .style('cursor', 'pointer');
        
        // Add label
        const label = group.append('text')
            .attr('class', 'node-label')
            .attr('x', node.x)
            .attr('y', node.y - 8)
            .attr('text-anchor', 'middle')
            .attr('font-size', '7px')
            .attr('fill', '#fbbf24')
            .attr('font-weight', 'bold')
            .text(`C${node.index + 1}`);
        
        // Add hover effects
        circle.on('mouseenter', function() {
            this.setAttribute('r', 7);
            this.setAttribute('fill', '#fcd34d');
            label.attr('font-size', '9px');
        });
        
        circle.on('mouseleave', function() {
            this.setAttribute('r', 5);
            this.setAttribute('fill', '#fbbf24');
            label.attr('font-size', '7px');
        });
        
        circle.on('click', () => {
            if (node.data) {
                dbAddCard({
                    id: crypto.randomUUID(),
                    createdAt: Date.now(),
                    projectId: currentProjectId,
                    deletedAt: null,
                    title: node.data.title || '',
                    url: node.data.url || '',
                    favicon: '',
                    snippet: 'Added from Literature Lens (cited)',
                    badges: [],
                    tags: [],
                    doi: node.data.doi || ''
                });
                showToast(`Added ${node.data.title || 'citation'} to project`);
            }
        });
    });
    
    // Enhanced legend with better positioning
    const legendItems = [
        { color: '#22d3ee', label: 'Current Paper', x: 15, y: 230 },
        { color: '#5eead4', label: `References (${payload.refs.length})`, x: 130, y: 230 },
        { color: '#fbbf24', label: `Cited By (${payload.cited.length})`, x: 280, y: 230 }
    ];
    
    legendItems.forEach(item => {
        g.append('circle')
            .attr('cx', item.x)
            .attr('cy', item.y)
            .attr('r', 5)
            .attr('fill', item.color);
        
        g.append('text')
            .attr('x', item.x + 8)
            .attr('y', item.y + 3)
            .attr('font-size', '11px')
            .attr('fill', '#9ca3af')
            .text(item.label);
    });
    
    // Store reference for controls
    window.__miniD3 = miniD3;
}

// Graph control event listeners
graphMaximize?.addEventListener('click', () => {
    if (window.__miniD3) {
        window.__miniD3.maximize();
        graphMaximize.textContent = window.__miniD3.isMaximized ? '⊡' : '⛶';
    }
});

graphReset?.addEventListener('click', () => {
    if (window.__miniD3) {
        window.__miniD3.resetZoom();
    }
});

graphToggleLabels?.addEventListener('click', () => {
    if (window.__miniD3) {
        window.__miniD3.toggleLabels();
        graphToggleLabels.textContent = window.__miniD3.showLabels ? '🏷️' : '🏷️';
        graphToggleLabels.style.opacity = window.__miniD3.showLabels ? '1' : '0.5';
    }
});

function renderSimilarPaginated(items = []) {
    if (!Array.isArray(items) || items.length === 0) { 
        lensList.textContent = 'No results.'; 
        lensPagination.style.display = 'none';
        return; 
    }
    
    const pageSize = window.__lens_page_size || 10;
    const currentPage = window.__lens_current_page || 1;
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const pageItems = items.slice(startIndex, endIndex);
    
    lensList.innerHTML = pageItems.map((m, i) => `
        <div style="display:flex; gap:8px; align-items:center; margin:8px 0;">
            <div style="flex:1;">
                <div style="font-weight:600;">${escapeHtml(m.title || 'Untitled')}</div>
                <div style="opacity:0.8; font-size:12px;">${escapeHtml((m.venue || '') + (m.year ? ' · ' + m.year : ''))}</div>
            </div>
            <button data-sim-act="open" data-url="${m.url || (m.doi ? 'https://doi.org/' + m.doi : '')}">Open</button>
            <button data-sim-act="add" data-title="${escapeHtml(m.title || '')}" data-url="${m.url || ''}" data-doi="${m.doi || ''}">Add</button>
            <button data-sim-act="cite" data-title="${escapeHtml(m.title || '')}" data-url="${m.url || ''}" data-doi="${m.doi || ''}">Cite</button>
        </div>
    `).join('');
    
    // Wire actions
    lensList.querySelectorAll('button[data-sim-act="open"]').forEach(b => b.addEventListener('click', () => {
        const url = b.getAttribute('data-url');
        if (url && url.startsWith('http')) chrome.tabs.create({ url });
    }));
    lensList.querySelectorAll('button[data-sim-act="add"]').forEach(b => b.addEventListener('click', async () => {
        const title = b.getAttribute('data-title');
        const url = b.getAttribute('data-url');
        const doi = b.getAttribute('data-doi');
        await dbAddCard({ id: crypto.randomUUID(), createdAt: Date.now(), projectId: currentProjectId, deletedAt: null, title, url, favicon: '', snippet: 'Added from Literature Lens', badges: [], tags: [], doi });
        showToast('Added to project');
    }));
    lensList.querySelectorAll('button[data-sim-act="cite"]').forEach(b => b.addEventListener('click', async () => {
        const meta = { title: b.getAttribute('data-title'), url: b.getAttribute('data-url'), doi: b.getAttribute('data-doi'), authors: [], year: '', venue: '' };
        await navigator.clipboard.writeText(formatAPA(meta));
        showToast('Copied citation');
    }));
}

function updatePagination(totalItems) {
    const pageSize = window.__lens_page_size || 10;
    const currentPage = window.__lens_current_page || 1;
    const totalPages = Math.ceil(totalItems / pageSize);
    
    if (totalPages <= 1) {
        lensPagination.style.display = 'none';
        return;
    }
    
    lensPagination.style.display = 'flex';
    lensPrev.disabled = currentPage <= 1;
    lensNext.disabled = currentPage >= totalPages;
    lensPageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
}

// Pagination event listeners
lensPrev?.addEventListener('click', () => {
    if (window.__lens_current_page > 1) {
        window.__lens_current_page--;
        const last = window.__lens_last_payload;
        if (last) {
            const tab = document.querySelector('[data-lens-tab].active')?.getAttribute('data-lens-tab') || 'similar';
            const list = tab === 'refs' ? last.refs : tab === 'cited' ? last.cited : last.similar;
            renderSimilarPaginated(list);
            updatePagination(list.length);
        }
    }
});

lensNext?.addEventListener('click', () => {
    const last = window.__lens_last_payload;
    if (last) {
        const tab = document.querySelector('[data-lens-tab].active')?.getAttribute('data-lens-tab') || 'similar';
        const list = tab === 'refs' ? last.refs : tab === 'cited' ? last.cited : last.similar;
        const totalPages = Math.ceil(list.length / (window.__lens_page_size || 10));
        if (window.__lens_current_page < totalPages) {
            window.__lens_current_page++;
            renderSimilarPaginated(list);
            updatePagination(list.length);
        }
    }
});

// Filter event listeners
filterOA?.addEventListener('change', () => {
    const last = window.__lens_last_payload;
    if (last) {
        window.__lens_current_page = 1;
        const tab = document.querySelector('[data-lens-tab].active')?.getAttribute('data-lens-tab') || 'similar';
        const list = tab === 'refs' ? last.refs : tab === 'cited' ? last.cited : last.similar;
        const filtered = applyFilters(list);
        renderSimilarPaginated(filtered);
        updatePagination(filtered.length);
    }
});

filterRecent?.addEventListener('change', () => {
    const last = window.__lens_last_payload;
    if (last) {
        window.__lens_current_page = 1;
        const tab = document.querySelector('[data-lens-tab].active')?.getAttribute('data-lens-tab') || 'similar';
        const list = tab === 'refs' ? last.refs : tab === 'cited' ? last.cited : last.similar;
        const filtered = applyFilters(list);
        renderSimilarPaginated(filtered);
        updatePagination(filtered.length);
    }
});

refreshLens?.addEventListener('click', async () => {
    const last = window.__lens_last_payload;
    if (last?.base?.openalex_id) {
        lensList.textContent = 'Refreshing…';
        try {
            const [refs, cited] = await Promise.all([
                getReferences(last.base.openalex_id),
                getCitedBy(last.base.openalex_id)
            ]);
            const pool = [...refs, ...cited];
            const similar = scoreSimilar(last.base, pool).slice(0, 20);
            const payload = { base: last.base, refs, cited, similar };
            chrome.storage.local.set({ [`lens_${last.base.doi || last.base.url}`]: { savedAt: Date.now(), payload } });
            renderLens(null, payload);
            showToast('Literature Lens refreshed');
        } catch {
            lensList.textContent = 'Refresh failed';
        }
    }
});

function applyFilters(items) {
    let filtered = [...items];
    
    if (filterOA?.checked) {
        filtered = filtered.filter(item => item.open_access || item.oa_url);
    }
    
    if (filterRecent?.checked) {
        const currentYear = new Date().getFullYear();
        filtered = filtered.filter(item => item.year && item.year >= (currentYear - 5));
    }
    
    return filtered;
}

// Lens tab switching
document.querySelectorAll('[data-lens-tab]')?.forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('[data-lens-tab]')?.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        // Re-render last payload if available
        const last = window.__lens_last_payload;
        if (last) {
            window.__lens_current_page = 1; // Reset to page 1 when switching tabs
            const tab = btn.getAttribute('data-lens-tab');
            const list = tab === 'refs' ? last.refs : tab === 'cited' ? last.cited : last.similar;
            const filtered = applyFilters(list);
            renderSimilarPaginated(filtered);
            updatePagination(filtered.length);
        }
    });
});


