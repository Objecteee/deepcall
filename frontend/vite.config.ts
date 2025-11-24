import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  server: {
    proxy: {
      '/session': 'http://localhost:3000',
      '/logs': 'http://localhost:3000',
      '/chat': 'http://localhost:3000',
      // Enable WS proxying to backend realtime endpoint
      '/realtime': {
        target: 'http://localhost:3000',
        ws: true,
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      '@components': path.resolve(__dirname, 'src/components'),
      '@store': path.resolve(__dirname, 'src/store'),
      '@rtc': path.resolve(__dirname, 'src/rtc'),
      '@utils': path.resolve(__dirname, 'src/utils'),
      '@hooks': path.resolve(__dirname, 'src/hooks'),
    },
  },
});


