// URL <-> citation helpers + simple formatters

export function makeCitations(urls, style = 'APA') {
	return urls.map((url, i) => ({ index: i + 1, label: `[${i + 1}]`, url, style }));
}

export function inlineCite(index) {
	return `[${index}]`;
}

export function detectDOI(textOrUrl) {
	const m = String(textOrUrl).match(/10\.\d{4,9}\/[^\s"<>]+/i);
	return m ? m[0].replace(/[\.,]$/,'') : '';
}

export function formatAPA(meta) {
	// APA-like: Author, A. A., Author, B. B. (Year). Title. Venue. https://doi.org/xxx
	const authors = (meta.authors || []).map(a => {
		const family = a.family || a.last || a.full?.split(' ').slice(-1)[0] || '';
		const givenInitials = (a.given || a.first || a.full?.split(' ').slice(0, -1).join(' ') || '')
			.split(/\s+/).filter(Boolean).map(s => s[0]?.toUpperCase() + '.').join('');
		return [family, givenInitials && (', ' + givenInitials)].filter(Boolean).join('');
	}).join(', ');
	const year = meta.year || (meta.issued?.['date-parts']?.[0]?.[0]) || '';
	const venue = meta.venue || meta.container || '';
	const url = meta.doi ? `https://doi.org/${meta.doi}` : (meta.url || '');
	return [authors, year ? `(${year}).` : '', meta.title ? `${meta.title}.` : '', venue ? `${venue}.` : '', url].filter(Boolean).join(' ');
}

export function formatMLA(meta) {
	// Lightweight MLA: Authors. "Title." Venue, Year, URL/DOI
	const authors = (meta.authors || []).map(a => a.full || [a.family || a.last, a.given || a.first].filter(Boolean).join(', ')).join(', ');
	const year = meta.year || (meta.issued?.['date-parts']?.[0]?.[0]) || '';
	const venue = meta.venue || meta.container || '';
	const url = meta.doi ? `https://doi.org/${meta.doi}` : (meta.url || '');
	const parts = [];
	if (authors) parts.push(authors + '.');
	if (meta.title) parts.push(`"${meta.title}."`);
	if (venue) parts.push(venue);
	if (year) parts.push(String(year));
	if (url) parts.push(url);
	return parts.join(' ');
}

export function formatHarvard(meta) {
	// Harvard-like: Author, A. A. (Year) Title. Venue. Available at: URL/DOI
	const authors = (meta.authors || []).map(a => {
		const family = a.family || a.last || a.full?.split(' ').slice(-1)[0] || '';
		const given = a.given || a.first || a.full?.split(' ').slice(0, -1).join(' ') || '';
		return [family, given && (', ' + given)].filter(Boolean).join('');
	}).join(', ');
	const year = meta.year || (meta.issued?.['date-parts']?.[0]?.[0]) || '';
	const venue = meta.venue || meta.container || '';
	const url = meta.doi ? `https://doi.org/${meta.doi}` : (meta.url || '');
	return [authors, year ? `(${year})` : '', meta.title ? meta.title + '.' : '', venue ? venue + '.' : '', url ? `Available at: ${url}` : ''].filter(Boolean).join(' ');
}

export function formatBibTeX(meta) {
	const key = (meta.firstAuthorLast || meta.authors?.[0]?.family || 'ref') + (meta.year || '');
	const authors = (meta.authors || []).map(a => `${a.family || a.last || ''}, ${a.given || a.first || ''}`).join(' and ');
	return `@article{${sanitizeKey(key)},\n  title={${escape(meta.title)}},\n  author={${escape(authors)}},\n  year={${escape(meta.year || '')}},\n  journal={${escape(meta.venue || meta.container || '')}},\n  doi={${escape(meta.doi || '')}},\n  url={${escape(meta.url || '')}}\n}`;
}

function sanitizeKey(s){return String(s).replace(/[^A-Za-z0-9_]/g,'');}
function escape(s){return String(s||'').replace(/[{}]/g,'');}


