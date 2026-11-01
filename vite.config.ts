import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

/** GitHub Pages project sites need `/RepoName/`; Netlify and local dev use `/`. */
const normalizeBase = (raw: string | undefined): string => {
  if (!raw || raw === '/') return '/';
  const withLeading = raw.startsWith('/') ? raw : `/${raw}`;
  return withLeading.endsWith('/') ? withLeading : `${withLeading}/`;
};

const base = normalizeBase(process.env.VITE_BASE_PATH);

export default defineConfig({
  base,
  test: {
    environment: 'node',
  },
  plugins: [
    react({
      babel: {
        plugins: ['babel-plugin-react-compiler'],
      },
    }),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-192.png', 'icon-512.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'Mind Maps',
        short_name: 'Mind Maps',
        description:
          'AI-assisted editable mind maps with iPad-friendly workspace and folders.',
        theme_color: '#101116',
        background_color: '#101116',
        display: 'standalone',
        orientation: 'any',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks(id): string | undefined {
          if (id.includes('node_modules/react-dom')) return 'react-dom';
          if (id.includes('node_modules/react/')) return 'react';
          if (id.includes('node_modules/react-router')) return 'router';
          if (id.includes('node_modules/@radix-ui')) return 'radix';
          if (id.includes('node_modules/@tanstack')) return 'query';
          if (id.includes('node_modules/jszip')) return 'jszip';
          if (id.includes('node_modules/lucide-react')) return 'icons';
          if (id.includes('node_modules/zod')) return 'zod';
          return undefined;
        },
      },
    },
  },
});
