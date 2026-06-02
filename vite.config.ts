import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    // Allow ngrok / tunneled hosts to reach the dev server.
    allowedHosts: ['.ngrok.app', '.ngrok-free.app', '.ngrok.io'],
  },
})
