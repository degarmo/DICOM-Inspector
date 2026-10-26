import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'electron-vite'
import type { Plugin } from 'vite'

import { contentSecurityPolicy } from './src/shared/csp'

/** Inject the Content-Security-Policy meta tag: strict for builds, HMR-compatible for dev. */
function cspPlugin(): Plugin {
  let isDev = false
  return {
    name: 'dicom-inspector-csp',
    configResolved(config) {
      isDev = config.command === 'serve'
    },
    transformIndexHtml() {
      return [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: contentSecurityPolicy(isDev) },
          injectTo: 'head-prepend',
        },
      ]
    },
  }
}

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    plugins: [react(), tailwindcss(), cspPlugin()],
    build: {
      // Keep every asset a separate local file; nothing is inlined or fetched.
      assetsInlineLimit: 0,
    },
  },
})
