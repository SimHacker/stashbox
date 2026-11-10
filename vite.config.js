import { sveltekit } from '@sveltejs/kit/vite';
import string from 'vite-plugin-string';

/** @type {import('vite').UserConfig} */
const config = {
	plugins: [
		sveltekit(),
		string({
			include: /\.wgsl$/,
		}),
	],
	test: {
		include: ['src/**/*.{test,spec}.{js,ts}']
	}
};

export default config;
