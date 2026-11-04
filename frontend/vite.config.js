import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  base: '/studio/',
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  build: { outDir: '../public/studio', emptyOutDir: true },
  server: {
    port: 5173,
    strictPort: true,
    // Docker Desktop trên Windows không luôn phát sự kiện file-system vào container.
    // Polling giữ HMR hoạt động khi source được mount từ máy chủ.
    watch: { usePolling: true, interval: 1000 },
    // Frontend dev server chạy cùng container với Express (cổng 5000).
    // Nhờ vậy vẫn dùng được API/session khi mở giao diện qua cổng 5173.
    proxy: {
      '/api': 'http://127.0.0.1:5000',
      '/uploads': 'http://127.0.0.1:5000',
    },
  },
})
