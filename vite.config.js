import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Vercelでは / 、GitHub Pagesでは /stampiko-stamp-studio/
const base = process.env.VERCEL ? '/' : '/stampiko-stamp-studio/'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base,
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
    include: ['src/**/*.test.{js,jsx}'],
    exclude: ['node_modules/**'],
  },
})
