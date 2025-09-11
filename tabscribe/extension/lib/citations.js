// Simple URL <-> citation helpers

export function makeCitations(urls, style = 'APA') {
	return urls.map((url, i) => ({ index: i + 1, label: `[${i + 1}]`, url, style }));
}

export function inlineCite(index) {
	return `[${index}]`;
}


