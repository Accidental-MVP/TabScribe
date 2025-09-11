import { getApiKey } from './settings.js';

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

export async function geminiCall(prompt) {
	const key = await getApiKey();
	if (!key) throw new Error('Missing Gemini API key');
	const res = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(key)}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			contents: [{ parts: [{ text: prompt }]}]
		})
	});
	if (!res.ok) throw new Error('Gemini API error');
	const data = await res.json();
	const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
	return text;
}


