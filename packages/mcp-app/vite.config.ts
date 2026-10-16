import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
export default defineConfig({
	plugins: [react(), viteSingleFile()],
	resolve: { alias: [
		{ find: "react-dom/client", replacement: "preact/compat/client" },
		{ find: "react-dom", replacement: "preact/compat" },
		{ find: "react/jsx-runtime", replacement: "preact/jsx-runtime" },
		{ find: "react", replacement: "preact/compat" },
	] },
	build: { outDir: "dist", target: "es2022", modulePreload: { polyfill: false }, minify: "terser", terserOptions: { compress: { passes: 5, drop_console: true, pure_getters: true, unsafe_arrows: true, toplevel: true }, mangle: { toplevel: true }, format: { comments: false } }, assetsInlineLimit: 1_000_000 },
});
