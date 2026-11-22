import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Inlines bundled JS and CSS into dist/index.html during production builds
 * so `dist/index.html` also works as a single self-contained HTML file.
 */
function inlineSingleHtmlPlugin(): Plugin {
  return {
    name: 'vellum-singlefile-inline',
    apply: 'build',
    enforce: 'post',
    closeBundle() {
      const distDir = path.resolve(__dirname, 'dist');
      const indexPath = path.join(distDir, 'index.html');
      if (!fs.existsSync(indexPath)) return;

      let html = fs.readFileSync(indexPath, 'utf-8');

      html = html.replace(
        /<link\s+[^>]*rel=["']stylesheet["'][^>]*href=["'](\.?\/assets\/[^"']+\.css)["'][^>]*>/gi,
        (match, href: string) => {
          const clean = href.replace(/^\.?\//, '');
          const cssPath = path.join(distDir, clean);
          if (!fs.existsSync(cssPath)) return match;
          const css = fs.readFileSync(cssPath, 'utf-8');
          return `<style>\n${css}\n</style>`;
        }
      );

      html = html.replace(
        /<script\s+[^>]*type=["']module["'][^>]*src=["'](\.?\/assets\/[^"']+\.js)["'][^>]*><\/script>/gi,
        (match, src: string) => {
          const clean = src.replace(/^\.?\//, '');
          const jsPath = path.join(distDir, clean);
          if (!fs.existsSync(jsPath)) return match;
          const js = fs.readFileSync(jsPath, 'utf-8').replace(/<\/script>/gi, '<\\/script>');
          return `<script type="module">\n${js}\n</script>`;
        }
      );

      fs.writeFileSync(indexPath, html, 'utf-8');
    },
  };
}

export default defineConfig(() => {
  return {
    base: '/',
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: [
          'icon.svg',
          'apple-touch-icon.png',
          'pwa-192x192.png',
          'pwa-512x512.png',
          'pwa-maskable-512x512.png',
        ],
        manifest: {
          id: '/',
          name: 'Vellum — Infinite Canvas Studio',
          short_name: 'Vellum',
          description:
            'A personal infinite-canvas workspace for sketching, writing, diagramming, charting, and planning offline.',
          theme_color: '#F7F8FA',
          background_color: '#F7F8FA',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2,webmanifest}'],
          navigateFallback: '/index.html',
        },
        devOptions: {
          enabled: true,
          type: 'module',
        },
      }),
      inlineSingleHtmlPlugin(),
      {
        name: 'copy-unbundled-src-assets',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) return;
          const distDir = path.resolve(__dirname, 'dist');
          const srcAssets = path.resolve(__dirname, 'src/assets');
          const distAssets = path.resolve(distDir, 'src/assets');
          if (fs.existsSync(distDir) && fs.existsSync(srcAssets)) {
            fs.cpSync(srcAssets, distAssets, { recursive: true, force: true });
          }
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      cssCodeSplit: false,
      assetsInlineLimit: 100_000_000,
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
