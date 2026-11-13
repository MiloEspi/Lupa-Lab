import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// La API va por el mismo origen (proxy): la cookie de sesión es "same-site" y no hace
// falta CORS con credenciales. En producción se replica con un rewrite.
const api = process.env.API_URL ?? 'http://127.0.0.1:8000'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': api, '/admin': api, '/static': api },
  },
})
