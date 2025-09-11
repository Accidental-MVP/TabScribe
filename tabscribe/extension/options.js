import { getApiKey, setApiKey } from './lib/settings.js';

const input = document.getElementById('api');
const saveBtn = document.getElementById('save');

(async () => {
	input.value = await getApiKey();
})();

saveBtn.addEventListener('click', async () => {
	await setApiKey(input.value.trim());
	alert('Saved.');
});


