import nodeAdapter from '@sveltejs/adapter-node';

import { vitePreprocess } from '@sveltejs/kit/vite';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://kit.svelte.dev/docs/integrations#preprocessors
	// for more information about preprocessors
	preprocess: vitePreprocess(),

	kit: {
		adapter: nodeAdapter({
			out: 'build'  // The output directory
		})
	}
};

export default config;
