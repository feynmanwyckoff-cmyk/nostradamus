import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {defineConfig} from 'vite';

function computeGitBlobShaSync(buf: Buffer): string {
  const header = Buffer.from(`blob ${buf.byteLength}\0`, 'utf8');
  return crypto.createHash('sha1').update(header).update(buf).digest('hex');
}

function writeFileIfGitShaChanged(targetPath: string, nextBuf: Buffer): boolean {
  const nextSha = computeGitBlobShaSync(nextBuf);
  if (fs.existsSync(targetPath)) {
    const prevBuf = fs.readFileSync(targetPath);
    const prevSha = computeGitBlobShaSync(prevBuf);
    if (prevSha === nextSha) {
      return false;
    }
  }
  fs.mkdirSync(path.dirname(targetPath), {recursive: true});
  fs.writeFileSync(targetPath, nextBuf);
  return true;
}

export default defineConfig(() => {
  return {
    base: './',
    plugins: [
      {
        name: 'github-pages-hybrid-entry',
        transformIndexHtml: {
          order: 'pre',
          handler(html) {
            return html.replace(
              /<!-- VITE_ENTRY_START -->[\s\S]*?<!-- VITE_ENTRY_END -->/,
              '<script type="module" src="/src/main.tsx"></script>'
            );
          },
        },
      },
      react(),
      tailwindcss(),
      {
        name: 'sync-docs-and-git-sha-stamp',
        closeBundle() {
          try {
            const distAssetsDir = path.resolve(__dirname, 'dist/assets');
            const docsAssetsDir = path.resolve(__dirname, 'docs/assets');
            const appJsDist = path.join(distAssetsDir, 'app.js');
            const indexCssDist = path.join(distAssetsDir, 'index.css');

            if (!fs.existsSync(appJsDist) || !fs.existsSync(indexCssDist)) {
              return;
            }

            const appJsBuf = fs.readFileSync(appJsDist);
            const indexCssBuf = fs.readFileSync(indexCssDist);

            // Sync compiled bundle into tracked docs/assets/ only when Git Blob SHA differs
            writeFileIfGitShaChanged(path.join(docsAssetsDir, 'app.js'), appJsBuf);
            writeFileIfGitShaChanged(path.join(docsAssetsDir, 'index.css'), indexCssBuf);

            // Compute deterministic 8-char content SHA from current bundle
            const bundleVersionHash = crypto
              .createHash('sha1')
              .update(appJsBuf)
              .update(indexCssBuf)
              .digest('hex')
              .slice(0, 8);

            // Update root index.html version query string if bundle SHA changed
            const rootIndexPath = path.resolve(__dirname, 'index.html');
            if (fs.existsSync(rootIndexPath)) {
              const rawRootHtml = fs.readFileSync(rootIndexPath, 'utf8');
              const updatedRootHtml = rawRootHtml.replace(
                /<!-- VITE_ENTRY_START -->[\s\S]*?<!-- VITE_ENTRY_END -->/,
                `<!-- VITE_ENTRY_START -->\n    <link rel="stylesheet" crossorigin href="./docs/assets/index.css?v=${bundleVersionHash}" />\n    <script type="module" crossorigin src="./docs/assets/app.js?v=${bundleVersionHash}"></script>\n    <!-- VITE_ENTRY_END -->`
              );
              writeFileIfGitShaChanged(
                rootIndexPath,
                Buffer.from(updatedRootHtml, 'utf8')
              );
            }

            // Update docs/index.html version query string if bundle SHA changed
            const docsIndexPath = path.resolve(__dirname, 'docs/index.html');
            if (fs.existsSync(docsIndexPath)) {
              const rawDocsHtml = fs.readFileSync(docsIndexPath, 'utf8');
              const updatedDocsHtml = rawDocsHtml
                .replace(
                  /src="\.\/assets\/app\.js(\?v=[^"]*)?"/,
                  `src="./assets/app.js?v=${bundleVersionHash}"`
                )
                .replace(
                  /href="\.\/assets\/index\.css(\?v=[^"]*)?"/,
                  `href="./assets/index.css?v=${bundleVersionHash}"`
                );
              writeFileIfGitShaChanged(
                docsIndexPath,
                Buffer.from(updatedDocsHtml, 'utf8')
              );
            }
          } catch (err) {
            console.warn('Post-build docs sync warning:', err);
          }
        },
      },
    ],
    build: {
      rollupOptions: {
        output: {
          entryFileNames: 'assets/app.js',
          chunkFileNames: 'assets/[name].js',
          assetFileNames: 'assets/[name].[ext]',
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});

