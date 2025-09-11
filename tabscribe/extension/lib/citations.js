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
	// Very lightweight APA: Authors (Year). Title. Venue. DOI/URL
	const authors = (meta.authors || []).map(a => `${a.last || a.family || a.name || ''}${a.first || a.given ? ', ' + (a.first || a.given)[0] + '.' : ''}`).join(', ');
	const year = meta.year || (meta.issued?.['date-parts']?.[0]?.[0]) || '';
	const parts = [authors, year ? `(${year}).` : '', meta.title ? `${meta.title}.` : '', meta.venue || meta.container || '', meta.doi ? `https://doi.org/${meta.doi}` : meta.url || ''].filter(Boolean);
	return parts.join(' ');
}

export function formatMLA(meta) {
	// Lightweight MLA: Authors. "Title." Venue, Year, URL/DOI
	const authors = (meta.authors || []).map(a => a.full || [a.family || a.last, a.given || a.first].filter(Boolean).join(', ')).join(', ');
	const year = meta.year || (meta.issued?.['date-parts']?.[0]?.[0]) || '';
	const url = meta.doi ? `https://doi.org/${meta.doi}` : meta.url || '';
	return [authors ? authors + '.', meta.title ? `"${meta.title}."` : '', meta.venue || meta.container || '', year, url].filter(Boolean).join(' ');
}

export function formatBibTeX(meta) {
	const key = (meta.firstAuthorLast || meta.authors?.[0]?.family || 'ref') + (meta.year || '');
	const authors = (meta.authors || []).map(a => `${a.family || a.last || ''}, ${a.given || a.first || ''}`).join(' and ');
	return `@article{${sanitizeKey(key)},\n  title={${escape(meta.title)}},\n  author={${escape(authors)}},\n  year={${escape(meta.year || '')}},\n  journal={${escape(meta.venue || meta.container || '')}},\n  doi={${escape(meta.doi || '')}},\n  url={${escape(meta.url || '')}}\n}`;
}

function sanitizeKey(s){return String(s).replace(/[^A-Za-z0-9_]/g,'');}
function escape(s){return String(s||'').replace(/[{}]/g,'');}


