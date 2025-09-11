// Content script: listens for runtime messages if needed.
// Placeholder for future in-page overlays / multimodal inputs.

(() => {
	chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
		if (msg?.type === 'tabscribe:get_selection') {
			const sel = window.getSelection?.();
			sendResponse({ selection: sel ? sel.toString() : '' });
			return true;
		}
	});
})();


