import JSZip from 'jszip';
import {
  STANDALONE_GITHUB_PAGES_HTML,
  GITHUB_ACTIONS_YML,
  NODE_SCRAPER_SCRIPT,
  INITIAL_MARKET_SNAPSHOT_JSON,
  GITHUB_REPO_README_MD
} from '../data/backendTemplates';

/**
 * Generates and downloads a complete, ready-to-upload GitHub Pages repository .zip archive
 * containing:
 * - index.html (Full Nostradamus Quant Terminal SPA)
 * - .nojekyll
 * - README.md
 * - public/market-snapshot.json
 * - scripts/update-nostradamus-data.mjs
 * - .github/workflows/nostradamus-cron.yml
 */
export async function downloadGitHubRepoZip(): Promise<void> {
  const zip = new JSZip();

  // Root files
  zip.file('index.html', STANDALONE_GITHUB_PAGES_HTML);
  zip.file('.nojekyll', '');
  zip.file('README.md', GITHUB_REPO_README_MD);

  // Pre-seeded initial snapshot so the repo works immediately upon GitHub Pages activation
  zip.file('public/market-snapshot.json', INITIAL_MARKET_SNAPSHOT_JSON);

  // Node.js 20 zero-dependency scraper & quant calculator
  zip.file('scripts/update-nostradamus-data.mjs', NODE_SCRAPER_SCRIPT);

  // Scheduled GitHub Actions workflow
  zip.file('.github/workflows/nostradamus-cron.yml', GITHUB_ACTIONS_YML);

  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'nostradamus-quant-terminal-github-pages.zip';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
