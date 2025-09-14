import { getMode } from './settings.js';

const OPENALEX = 'https://api.openalex.org';
const CROSSREF = 'https://api.crossref.org';

export function extractDoiFromText(text) {
	const m = String(text || '').match(/10\.\d{4,9}\/[^\s"<>]+/i);
	return m ? m[0].replace(/[\.,]$/, '') : '';
}

export async function fetchMetadata({ doi, title }) {
	if ((await getMode()) !== 'hybrid') return null;
	// Prefer OpenAlex
	let meta = null;
	if (doi) meta = await fetchOpenAlexByDoi(doi).catch(() => null);
	if (!meta && title) meta = await searchOpenAlexByTitle(title).catch(() => null);
	// Fallback to Crossref
	if (!meta && doi) meta = await fetchCrossrefByDoi(doi).catch(() => null);
	if (!meta && title) meta = await searchCrossrefByTitle(title).catch(() => null);
	return meta;
}

async function fetchOpenAlexByDoi(doi) {
	const res = await fetch(`${OPENALEX}/works/doi:${encodeURIComponent(doi)}`);
	if (!res.ok) throw new Error('openalex');
	const w = await res.json();
	return normalizeOpenAlexWork(w);
}

async function searchOpenAlexByTitle(title) {
	const res = await fetch(`${OPENALEX}/works?search=${encodeURIComponent(title)}&per-page=1`);
	if (!res.ok) throw new Error('openalex');
	const data = await res.json();
	const w = data?.results?.[0];
	return w ? normalizeOpenAlexWork(w) : null;
}

function normalizeOpenAlexWork(w) {
	const authors = (w?.authorships || []).map(a => ({
		full: a.author?.display_name,
		family: a.author?.last_name,
		given: a.author?.first_name,
	}));
	return {
		title: w?.title,
		url: w?.primary_location?.source?.host_venue?.url || w?.primary_location?.landing_page_url || w?.ids?.doi,
		doi: (w?.ids?.doi || '').replace(/^https?:\/\/doi\.org\//, ''),
		authors,
		year: w?.publication_year,
		venue: w?.host_venue?.display_name || w?.primary_location?.source?.display_name,
		openalex_id: w?.id,
	};
}

async function fetchCrossrefByDoi(doi) {
	const res = await fetch(`${CROSSREF}/works/${encodeURIComponent(doi)}`);
	if (!res.ok) throw new Error('crossref');
	const w = (await res.json())?.message;
	return normalizeCrossrefWork(w);
}

async function searchCrossrefByTitle(title) {
	const res = await fetch(`${CROSSREF}/works?query.title=${encodeURIComponent(title)}&rows=1`);
	if (!res.ok) throw new Error('crossref');
	const w = (await res.json())?.message?.items?.[0];
	return w ? normalizeCrossrefWork(w) : null;
}

function normalizeCrossrefWork(w) {
	const authors = (w?.author || []).map(a => ({ full: `${a.given || ''} ${a.family || ''}`.trim(), family: a.family, given: a.given }));
	return {
		title: Array.isArray(w?.title) ? w.title[0] : w?.title,
		url: w?.URL,
		doi: w?.DOI,
		authors,
		year: w?.issued?.['date-parts']?.[0]?.[0],
		venue: Array.isArray(w?.container_title) ? w.container_title[0] : w?.container_title,
	};
}

export async function findSimilar({ doi, title }, { provider = 'openalex', limit = 5 } = {}) {
	if ((await getMode()) !== 'hybrid') return [];
	try {
		if (provider === 'openalex') {
			if (doi) {
				const base = await fetchOpenAlexByDoi(doi);
				if (base?.openalex_id) {
					const id = base.openalex_id.split('/').pop();
					const res = await fetch(`${OPENALEX}/works?filter=related_to:${id}&per-page=${limit}`);
					if (res.ok) {
						const data = await res.json();
						return (data?.results || []).map(normalizeOpenAlexWork);
					}
				}
			}
			// fallback by title search
			if (title) {
				const res = await fetch(`${OPENALEX}/works?search=${encodeURIComponent(title)}&per-page=${limit}`);
				if (res.ok) {
					const data = await res.json();
					return (data?.results || []).map(normalizeOpenAlexWork);
				}
			}
		}
		// Crossref fallback
		if (doi) {
			const base = await fetchCrossrefByDoi(doi);
			if (base?.title) {
				const res = await fetch(`${CROSSREF}/works?query=${encodeURIComponent(base.title)}&rows=${limit}`);
				if (res.ok) {
					const items = (await res.json())?.message?.items || [];
					return items.map(normalizeCrossrefWork);
				}
			}
		}
		if (title) {
			const res = await fetch(`${CROSSREF}/works?query.title=${encodeURIComponent(title)}&rows=${limit}`);
			if (res.ok) {
				const items = (await res.json())?.message?.items || [];
				return items.map(normalizeCrossrefWork);
			}
		}
	} catch {}
	return [];
}


// ===== Literature Lens helpers (OpenAlex-only, no auth required) =====

export async function resolveOpenAlex({ doi, title }) {
    let base = null;
    if (doi) base = await fetchOpenAlexWork(`doi:${encodeURIComponent(doi)}`).catch(() => null);
    if (!base && title) base = await searchOpenAlexByTitle(title).catch(() => null);
    return base;
}

export async function getReferences(openalexId, limit = 20) {
    const work = await fetchOpenAlexById(openalexId);
    const ids = (work?.referenced_works || []).slice(0, limit);
    return hydrateOpenAlexIds(ids);
}

export async function getCitedBy(openalexId, limit = 20) {
    const res = await fetch(`${OPENALEX}/works?filter=cites:${openalexId}&per-page=${limit}&sort=year:desc,cited_by_count:desc`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data?.results || []).map(normalizeOpenAlexWorkRich);
}

export function scoreSimilar(center, candidates, nowYear = (new Date()).getFullYear()) {
    const centerConcepts = new Set((center.concepts || []).map(c => c.id));
    const centerTokens = buildTokens(center);
    return candidates.map(c => {
        const candConcepts = new Set((c.concepts || []).map(x => x.id));
        const jacc = jaccard(centerConcepts, candConcepts);
        const tf = termOverlap(centerTokens, buildTokens(c));
        const freshness = c.year ? Math.max(0, Math.min(1, (c.year - (nowYear - 10)) / 10)) : 0;
        const score = 0.6 * jacc + 0.4 * tf + 0.05 * freshness;
        return { ...c, score };
    }).sort((a, b) => b.score - a.score);
}

function buildTokens(w) {
    const text = `${w.title || ''} ${(w.abstract || '')}`.toLowerCase();
    return new Set(text.split(/[^a-z0-9]+/).filter(t => t && t.length > 3).slice(0, 200));
}

function termOverlap(aSet, bSet) {
    if (!aSet.size || !bSet.size) return 0;
    let inter = 0;
    for (const t of aSet) if (bSet.has(t)) inter++;
    return inter / Math.min(aSet.size, bSet.size);
}

function jaccard(a, b) {
    if (!a.size && !b.size) return 0;
    let inter = 0;
    for (const x of a) if (b.has(x)) inter++;
    return inter / (a.size + b.size - inter || 1);
}

async function fetchOpenAlexById(idOrUrl) {
    const id = String(idOrUrl).split('/').pop();
    const res = await fetch(`${OPENALEX}/works/${id}`);
    if (!res.ok) throw new Error('openalex');
    return await res.json();
}

async function fetchOpenAlexWork(path) {
    const res = await fetch(`${OPENALEX}/works/${path}`);
    if (!res.ok) throw new Error('openalex');
    const w = await res.json();
    return normalizeOpenAlexWorkRich(w);
}

async function hydrateOpenAlexIds(ids = []) {
    const limited = ids.slice(0, 20);
    const out = [];
    for (const id of limited) {
        try {
            const w = await fetchOpenAlexById(id);
            out.push(normalizeOpenAlexWorkRich(w));
        } catch {}
    }
    return out;
}

function normalizeOpenAlexWorkRich(w) {
    const base = normalizeOpenAlexWork(w);
    return {
        ...base,
        cited_by_count: w?.cited_by_count,
        concepts: (w?.concepts || []).map(c => ({ id: c.id, name: c.display_name })),
        abstract: reconstructAbstract(w?.abstract_inverted_index)
    };
}

function reconstructAbstract(inv) {
    if (!inv) return '';
    const arr = [];
    for (const [word, positions] of Object.entries(inv)) {
        positions.forEach(p => { arr[p] = word; });
    }
    return arr.join(' ');
}
