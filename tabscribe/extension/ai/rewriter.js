// Rewriter API wrapper (stub)
export async function rewriteText(text, tone = 'Concise') {
	// TODO: use chrome.rewriter with tone presets when available
	if (tone === 'Academic') return text.replace(/\b(you|we)\b/gi, 'one');
	if (tone === 'Friendly') return '🙂 ' + text;
	if (tone === 'Executive') return text.toUpperCase();
	return text;
}


