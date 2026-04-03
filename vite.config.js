import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/',
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor': [
            'react',
            'react-dom',
            '@supabase/supabase-js'
          ],
          'charts': [
            'chart.js',
            'react-chartjs-2'
          ],
          'utils': [
            'xlsx'
          ]
        }
      }
    },
    chunkSizeWarningLimit: 600
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'pwa-icon.png'],
      manifest: {
        name: 'Kanal Doluluk Analizi',
        short_name: 'Doluluk',
        description: 'Kanal doluluk oranı görselleştirme',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        icons: [
          {
            src: 'pwa-icon.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-icon.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
})
