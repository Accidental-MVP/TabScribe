// Writer API wrapper (stub)
export async function writeDraft(intro, bullets, openQuestions, sources) {
	const introSection = intro || 'This report synthesizes captured snippets.';
	const bulletsSection = (bullets && bullets.length ? bullets : ['Point A','Point B']).map(b => `- ${b}`).join('\n');
	const questionsSection = (openQuestions && openQuestions.length ? openQuestions : ['What are the trade-offs?']).map(q => `- ${q}`).join('\n');
	const sourcesSection = (sources || []).map((s, i) => `[${i+1}] ${s.title} — ${s.url}`).join('\n');
	return `${introSection}\n\n## Key Points\n${bulletsSection}\n\n## Open Questions\n${questionsSection}\n\n## Sources\n${sourcesSection}`;
}


