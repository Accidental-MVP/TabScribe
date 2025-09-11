// Proofreader API wrapper (stub)
export async function proofreadText(text) {
	// TODO: integrate chrome.proofreader when available
	return text.replace(/\s+/g, ' ').replace(/\s,/, ',');
}


