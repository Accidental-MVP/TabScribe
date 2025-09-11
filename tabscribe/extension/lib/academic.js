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


