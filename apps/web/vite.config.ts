import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Pages builds set BASE_PATH=/policy-pilot/. In server mode (VITE_ENGINE=server) /api is proxied to the Express server.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react(), tailwindcss()],
  optimizeDeps: { exclude: ['@huggingface/transformers'] },
  server: { port: 5173, proxy: { '/api': 'http://localhost:4100' } },
  build: { target: 'esnext', chunkSizeWarningLimit: 2500 },
  worker: { format: 'es' },
})
