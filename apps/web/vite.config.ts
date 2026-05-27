import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
  // recharts v3 内部 import decimal.js-light 的 default，在 Vite 8 + Rolldown 下
  // 默认 esbuild interop 会把 CJS 主入口当成 ESM module 处理，导致
  // `import_decimal.default is not a constructor`。
  // 显式把它们 include 进 optimizeDeps，让 Vite 用 esbuild 统一预打包并修正 interop。
  optimizeDeps: {
    include: [
      'recharts',
      'decimal.js-light',
      'react-redux',
      '@reduxjs/toolkit',
      'reselect',
      'immer',
      'es-toolkit',
      'es-toolkit/compat',
      'eventemitter3',
      'tiny-invariant',
      'use-sync-external-store/shim/with-selector.js',
      'victory-vendor/d3-scale',
      'victory-vendor/d3-shape',
    ],
  },
  build: {
    chunkSizeWarningLimit: 1024,
    rolldownOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/monaco-editor') || id.includes('node_modules/@monaco-editor')) {
            return 'vendor-monaco'
          }
          if (id.includes('node_modules/recharts') || id.includes('node_modules/d3-')) {
            return 'vendor-charts'
          }
          if (id.includes('node_modules/react-diff-view') || id.includes('node_modules/gitdiff-parser') || id.includes('node_modules/diff-match-patch')) {
            return 'vendor-diff'
          }
          if (id.includes('node_modules/react-router') || id.includes('node_modules/zustand')) {
            return 'vendor-app'
          }
        },
      },
    },
  },
})
