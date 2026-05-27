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
