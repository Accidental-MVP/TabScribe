// Export helpers: Markdown and Docx (basic)

export function exportMarkdown(cards, citations) {
	const body = cards.map((c, i) => `> ${c.snippet}\n\n— ${c.title} ${citations ? `[${i+1}]` : ''}\n`).join('\n');
	const refs = citations ? ('\n\n## Sources\n' + cards.map((c, i) => `[${i+1}] ${c.title} — ${c.url}`).join('\n')) : '';
	return `# TabScribe Export\n\n${body}${refs}`;
}

export async function exportDocx(cards) {
	// To keep client-only: generate a simple text Blob with .docx name (placeholder)
	const content = cards.map(c => `${c.title}\n${c.url}\n${c.snippet}\n\n`).join('');
	return new Blob([content], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}


