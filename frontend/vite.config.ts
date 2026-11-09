import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@solana-program/system': fileURLToPath(new URL('./src/shims/solana-program-system.ts', import.meta.url)),
    },
  },
  build: {
    // Hashed build output gets its own folder, separate from the unhashed
    // images in public/assets, so vercel.json can cache it for a year.
    assetsDir: 'static',
    rollupOptions: {
      output: {
        // React rarely changes between deploys; a separate chunk stays cached
        // in the browser when only app code changes.
        manualChunks(id) {
          if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)) {
            return 'react-vendor';
          }
        },
      },
    },
  },
  server: {
    allowedHosts: ['barmaid-anaconda-blinked.ngrok-free.dev']
  }
});
