import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  worker: { format: 'es' },
  server: {
    port: 5173,
    allowedHosts: ['.trycloudflare.com'], // tunel rapido do cloudflared
    proxy: { '/api': process.env.VITE_API_PROXY ?? 'http://localhost:8000' },
  },
})
