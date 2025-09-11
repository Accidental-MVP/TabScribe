// Summarizer API wrapper (stub)
export async function summarizeText(text) {
	// TODO: replace with chrome.summarizer API when available in preview
	// Placeholder: simple heuristic summary
	const first = text.split(/\n|\.\s/).slice(0, 3).join('. ') + '.';
	const bullets = Array.from(new Set(text.split(/[.!?]\s+/).slice(0, 5)))
		.map(s => `- ${s.trim()}`)
		.join('\n');
	return `${first}\n\n${bullets}`;
}


