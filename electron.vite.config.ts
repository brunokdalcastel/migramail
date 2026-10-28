import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const alias = {
  '@shared': resolve(__dirname, 'src/shared'),
  '@main': resolve(__dirname, 'src/main'),
  '@renderer': resolve(__dirname, 'src/renderer'),
}

// A CSP de produção vai no <meta> do index.html e no cabeçalho (windows.ts). Em dev, o HMR do
// Vite precisa de WebSocket e do preâmbulo inline do React Refresh, então só aqui ela é afrouxada.
function devCsp(): Plugin {
  return {
    name: 'migramail:dev-csp',
    apply: 'serve',
    transformIndexHtml(html) {
      return html
        .replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")
        .replace("connect-src 'self'", "connect-src 'self' ws://localhost:* http://localhost:*")
    },
  }
}

export default defineConfig({
  main: {
    resolve: { alias },
    build: {
      rollupOptions: { input: { index: resolve(__dirname, 'src/main/index.ts') } },
    },
  },
  preload: {
    resolve: { alias },
    build: {
      // Preload roda em sandbox: não pode dar require em node_modules, então o zod
      // (usado por src/shared/ipc.ts) vai embutido no bundle.
      externalizeDeps: { exclude: ['zod'] },
      rollupOptions: { input: { index: resolve(__dirname, 'src/preload/index.ts') } },
    },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    resolve: { alias },
    plugins: [react(), tailwindcss(), devCsp()],
    build: {
      // o electron-vite não minifica por padrão no renderer
      minify: true,
      rollupOptions: { input: { index: resolve(__dirname, 'src/renderer/index.html') } },
    },
  },
})
