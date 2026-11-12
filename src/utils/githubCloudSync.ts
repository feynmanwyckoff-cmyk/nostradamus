import { CloudStateBundle, GitHubCloudConfig } from '../types/quant';
import { formatFullIndonesianDateTime } from './liveMarketFetcher';

const GITHUB_CONFIG_STORAGE_KEY = 'nostradamus_github_pat_config_v1';

/**
 * Automatically detects GitHub owner and repository name when running on GitHub Pages
 * (e.g., https://<username>.github.io/<repo>/) and defaults repo to 'nostradamus'.
 * Leaves owner empty on non-github.io domains so any user who forks/clones the repo
 * can simply enter their own GitHub Username & PAT Token.
 */
export function detectDefaultGitHubRepoInfo(): { owner: string; repo: string } {
  let detectedOwner = '';
  let detectedRepo = 'nostradamus';

  if (typeof window !== 'undefined') {
    const host = window.location.hostname.toLowerCase();
    if (host.endsWith('.github.io')) {
      const sub = host.replace(/\.github\.io$/i, '').trim();
      if (sub && sub !== 'www') {
        detectedOwner = sub;
      }
    }
    const pathSegments = window.location.pathname
      .split('/')
      .map((s) => s.trim())
      .filter(Boolean);
    if (pathSegments.length > 0 && !pathSegments[0].endsWith('.html')) {
      detectedRepo = pathSegments[0];
    }
  }

  return {
    owner: detectedOwner,
    repo: detectedRepo || 'nostradamus'
  };
}

export const DEFAULT_GITHUB_CLOUD_CONFIG: GitHubCloudConfig = {
  owner: detectDefaultGitHubRepoInfo().owner,
  repo: detectDefaultGitHubRepoInfo().repo,
  branch: 'main',
  filePath: 'data/nostradamus_cloud_state.json',
  patToken: '',
  autoSyncOnEdit: true
};

export function loadGitHubCloudConfig(): GitHubCloudConfig {
  const defaults = detectDefaultGitHubRepoInfo();
  try {
    const raw = localStorage.getItem(GITHUB_CONFIG_STORAGE_KEY);
    if (!raw) {
      return {
        ...DEFAULT_GITHUB_CLOUD_CONFIG,
        owner: defaults.owner,
        repo: defaults.repo
      };
    }
    const parsed = JSON.parse(raw) as Partial<GitHubCloudConfig>;
    return {
      owner: parsed.owner?.trim() || defaults.owner || '',
      repo: parsed.repo?.trim() || defaults.repo || 'nostradamus',
      branch: parsed.branch?.trim() || 'main',
      filePath: parsed.filePath?.trim() || 'data/nostradamus_cloud_state.json',
      patToken: parsed.patToken?.trim() || '',
      autoSyncOnEdit: parsed.autoSyncOnEdit ?? true,
      lastSyncedSha: parsed.lastSyncedSha,
      lastSyncedAt: parsed.lastSyncedAt
    };
  } catch {
    return {
      ...DEFAULT_GITHUB_CLOUD_CONFIG,
      owner: defaults.owner,
      repo: defaults.repo
    };
  }
}

export function saveGitHubCloudConfig(config: GitHubCloudConfig): void {
  try {
    localStorage.setItem(GITHUB_CONFIG_STORAGE_KEY, JSON.stringify(config));
  } catch {
    // ignore storage errors
  }
}

export function isGitHubCloudConfigured(config: GitHubCloudConfig): boolean {
  return Boolean(
    config.owner.trim() &&
      config.repo.trim() &&
      config.filePath.trim() &&
      config.patToken.trim()
  );
}

function encodeUtf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function decodeBase64ToUtf8(base64Str: string): string {
  const clean = base64Str.replace(/\s/g, '');
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

/**
 * Computes the official Git Blob SHA-1 hash (`sha1("blob " + byteLength + "\0" + content)`)
 * so local content can be compared directly against GitHub REST API `sha` fields per file.
 */
export async function computeGitBlobSha(content: string | Uint8Array): Promise<string> {
  const bodyBytes =
    typeof content === 'string' ? new TextEncoder().encode(content) : content;
  const headerBytes = new TextEncoder().encode(`blob ${bodyBytes.byteLength}\0`);
  const combined = new Uint8Array(headerBytes.byteLength + bodyBytes.byteLength);
  combined.set(headerBytes, 0);
  combined.set(bodyBytes, headerBytes.byteLength);

  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const hashBuffer = await crypto.subtle.digest('SHA-1', combined);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  // Fallback deterministic hash if SubtleCrypto is unavailable
  let h1 = 0xdeadbeef ^ combined.byteLength;
  let h2 = 0x41c6ce57 ^ combined.byteLength;
  for (let i = 0; i < combined.byteLength; i++) {
    const ch = combined[i];
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  return (
    (h1 >>> 0).toString(16).padStart(8, '0') +
    (h2 >>> 0).toString(16).padStart(8, '0')
  );
}


/**
 * Verifies repository access and token permissions against GitHub REST API.
 */
export async function verifyGitHubRepoConnection(
  config: GitHubCloudConfig
): Promise<{
  ok: boolean;
  fullName: string;
  defaultBranch: string;
  canPush: boolean;
  message: string;
}> {
  if (!config.owner.trim() || !config.repo.trim() || !config.patToken.trim()) {
    throw new Error('Mohon lengkapi GitHub Username, Nama Repository (nostradamus), dan Token PAT.');
  }

  const owner = encodeURIComponent(config.owner.trim());
  const repo = encodeURIComponent(config.repo.trim());
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    method: 'GET',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${config.patToken.trim()}`,
      'X-GitHub-Api-Version': '2022-11-28'
    },
    cache: 'no-store'
  });

  if (!res.ok) {
    if (res.status === 401) {
      throw new Error('Token PAT tidak valid atau sudah kedaluwarsa (401 Unauthorized).');
    }
    if (res.status === 404) {
      throw new Error(
        `Repository "${config.owner.trim()}/${config.repo.trim()}" tidak ditemukan atau Token PAT belum diberi akses ke repo tersebut.`
      );
    }
    const errText = await res.text();
    throw new Error(`GitHub API Error (${res.status}): ${errText.slice(0, 120)}`);
  }

  const data = (await res.json()) as {
    full_name?: string;
    default_branch?: string;
    permissions?: { push?: boolean; admin?: boolean };
  };
  const canPush = Boolean(data.permissions?.push || data.permissions?.admin);

  return {
    ok: true,
    fullName: data.full_name || `${config.owner}/${config.repo}`,
    defaultBranch: data.default_branch || config.branch || 'main',
    canPush,
    message: canPush
      ? `Terhubung ke ${data.full_name} (Izin Read & Write Aktif)`
      : `Terhubung ke ${data.full_name} (Hanya Read — aktifkan izin Contents: Read & Write pada PAT untuk Push)`
  };
}

/**
 * Pulls the latest CloudStateBundle JSON from the user's GitHub repository via GitHub Contents REST API.
 * Works from any device (laptop, phone, tablet) in real time with zero cache staleness.
 */
export async function pullStateFromGitHubRepo(
  config: GitHubCloudConfig
): Promise<{ bundle: CloudStateBundle; sha: string }> {
  const owner = encodeURIComponent(config.owner.trim());
  const repo = encodeURIComponent(config.repo.trim());
  const branch = encodeURIComponent(config.branch.trim() || 'main');
  const cleanPath = config.filePath.trim().replace(/^\/+/, '');

  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${cleanPath}?ref=${branch}&t=${Date.now()}`;
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  };
  if (config.patToken.trim()) {
    headers.Authorization = `Bearer ${config.patToken.trim()}`;
  }

  const res = await fetch(url, {
    method: 'GET',
    headers,
    cache: 'no-store'
  });

  if (!res.ok) {
    if (res.status === 404) {
      const notFoundErr = new Error(
        `FILE_NOT_INITIALIZED: File ${cleanPath} belum ada di repo ${config.owner}/${config.repo}.`
      );
      (notFoundErr as any).status = 404;
      throw notFoundErr;
    }
    const errText = await res.text();
    throw new Error(`GitHub API Error (${res.status}): ${errText.slice(0, 140)}`);
  }

  const data = (await res.json()) as { content?: string; sha?: string };
  if (!data.content || !data.sha) {
    throw new Error('Respons GitHub Contents API tidak berisi content Base64 atau SHA.');
  }

  const jsonStr = decodeBase64ToUtf8(data.content);
  const bundle = JSON.parse(jsonStr) as CloudStateBundle;
  return { bundle, sha: data.sha };
}

/**
 * Pushes (commits) the current CloudStateBundle JSON directly to the user's GitHub repository.
 * Compares the Git Blob SHA-1 per file before committing so only actual content changes are pushed.
 */
export async function pushStateToGitHubRepo(
  config: GitHubCloudConfig,
  bundle: CloudStateBundle
): Promise<{ sha: string; syncedAt: string; unchanged?: boolean }> {
  if (!isGitHubCloudConfigured(config)) {
    throw new Error(
      'Lengkapi GitHub Username, Nama Repository (nostradamus), dan GitHub Personal Access Token (PAT) terlebih dahulu.'
    );
  }

  const owner = encodeURIComponent(config.owner.trim());
  const repo = encodeURIComponent(config.repo.trim());
  const branch = config.branch.trim() || 'main';
  const cleanPath = config.filePath.trim().replace(/^\/+/, '');
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${cleanPath}`;

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${config.patToken.trim()}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json'
  };

  // Fetch current SHA and remote content first to compare per-file Git Blob SHA
  let currentSha = config.lastSyncedSha;
  let remoteContentStr: string | null = null;
  try {
    const checkRes = await fetch(`${apiUrl}?ref=${encodeURIComponent(branch)}&t=${Date.now()}`, {
      method: 'GET',
      headers,
      cache: 'no-store'
    });
    if (checkRes.ok) {
      const existingData = (await checkRes.json()) as { sha?: string; content?: string };
      if (existingData.sha) {
        currentSha = existingData.sha;
      }
      if (existingData.content) {
        try {
          remoteContentStr = decodeBase64ToUtf8(existingData.content);
        } catch {
          remoteContentStr = null;
        }
      }
    } else if (checkRes.status === 404) {
      currentSha = undefined;
    }
  } catch {
    // proceed with known sha if any
  }

  const prettyJson = JSON.stringify(bundle, null, 2);
  const localBlobSha = await computeGitBlobSha(prettyJson);
  const syncedAt = formatFullIndonesianDateTime(new Date());

  // Compare exact Git Blob SHA or normalized payload SHA (ignoring volatile updatedAt field)
  if (currentSha && localBlobSha === currentSha) {
    return { sha: currentSha, syncedAt, unchanged: true };
  }

  if (currentSha && remoteContentStr) {
    try {
      const remoteObj = JSON.parse(remoteContentStr) as Record<string, unknown>;
      const localObj = JSON.parse(prettyJson) as Record<string, unknown>;
      const remoteNormalized = JSON.stringify({ ...remoteObj, updatedAt: '' });
      const localNormalized = JSON.stringify({ ...localObj, updatedAt: '' });
      const [remoteNormSha, localNormSha] = await Promise.all([
        computeGitBlobSha(remoteNormalized),
        computeGitBlobSha(localNormalized)
      ]);
      if (remoteNormSha === localNormSha) {
        return { sha: currentSha, syncedAt, unchanged: true };
      }
    } catch {
      // fallback to standard PUT commit
    }
  }

  const contentBase64 = encodeUtf8ToBase64(prettyJson);

  const bodyPayload: Record<string, unknown> = {
    message: `chore(quant): sync Nostradamus portfolio & screener cloud state [${new Date()
      .toISOString()
      .slice(0, 16)}]`,
    content: contentBase64,
    branch
  };
  if (currentSha) {
    bodyPayload.sha = currentSha;
  }

  const putRes = await fetch(apiUrl, {
    method: 'PUT',
    headers,
    body: JSON.stringify(bodyPayload)
  });

  if (!putRes.ok) {
    const errText = await putRes.text();
    throw new Error(`Gagal commit ke GitHub (${putRes.status}): ${errText.slice(0, 160)}`);
  }

  const putData = (await putRes.json()) as { content?: { sha?: string } };
  const newSha = putData.content?.sha || localBlobSha || currentSha || '';

  return { sha: newSha, syncedAt, unchanged: false };
}

/**
 * Pulls the latest `public/static-market-snapshot.json` and `data/nostradamus_cloud_state.json`
 * directly via GitHub REST API (`api.github.com`) with raw media type (`application/vnd.github.raw+json`)
 * to bypass GitHub Pages CDN cache completely and ensure `^JKSE` never reverts to a stale static quote.
 */
export async function pullLiveMarketSnapshotFromGitHubApi(
  customConfig?: GitHubCloudConfig
): Promise<any | null> {
  const cfg = customConfig ?? loadGitHubCloudConfig();
  const owner = cfg.owner.trim() || detectDefaultGitHubRepoInfo().owner;
  const repo = cfg.repo.trim() || detectDefaultGitHubRepoInfo().repo || 'nostradamus';
  const branch = cfg.branch.trim() || 'main';

  if (!owner || !repo) return null;

  const snapUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
    repo
  )}/contents/public/static-market-snapshot.json?ref=${encodeURIComponent(branch)}&t=${Date.now()}`;
  const statePath = (cfg.filePath || 'data/nostradamus_cloud_state.json').trim().replace(/^\/+/, '');
  const stateUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
    repo
  )}/contents/${statePath}?ref=${encodeURIComponent(branch)}&t=${Date.now()}`;

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.raw+json',
    'X-GitHub-Api-Version': '2022-11-28'
  };
  if (cfg.patToken.trim()) {
    headers.Authorization = `Bearer ${cfg.patToken.trim()}`;
  }

  const [snapPayload, cloudStatePayload] = await Promise.all([
    (async (): Promise<any> => {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 6500);
        const res = await fetch(snapUrl, {
          method: 'GET',
          headers,
          signal: controller.signal,
          cache: 'no-store'
        });
        clearTimeout(timer);
        if (res.ok) {
          return await res.json();
        }
      } catch {
        // ignore and fallback
      }
      return null;
    })(),
    (async (): Promise<Partial<CloudStateBundle> | null> => {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 6500);
        const res = await fetch(stateUrl, {
          method: 'GET',
          headers,
          signal: controller.signal,
          cache: 'no-store'
        });
        clearTimeout(timer);
        if (res.ok) {
          return (await res.json()) as Partial<CloudStateBundle>;
        }
      } catch {
        // ignore and fallback
      }
      return null;
    })()
  ]);

  if (!snapPayload && !cloudStatePayload) return null;

  const mergedSnapshot: Record<string, any> =
    snapPayload && typeof snapPayload === 'object'
      ? { ...snapPayload, data: { ...(snapPayload.data || {}) } }
      : { generatedAt: new Date().toISOString(), data: {} };

  // Merge fresher liveIhsgQuote / liveIhsgReturns from cloud state JSON if static snapshot still has old 5073.77
  if (cloudStatePayload?.liveIhsgQuote && cloudStatePayload.liveIhsgQuote.lastPrice > 0) {
    const cloudQuote = cloudStatePayload.liveIhsgQuote;
    const existingJkse = mergedSnapshot.data['^JKSE'];
    const isExistingStaleDefault =
      !existingJkse ||
      Math.abs(Number(existingJkse.lastPrice) - 5073.77) < 0.05 ||
      (cloudStatePayload.updatedAt &&
        mergedSnapshot.generatedAt &&
        new Date(cloudStatePayload.updatedAt).getTime() >
          new Date(mergedSnapshot.generatedAt).getTime());

    if (isExistingStaleDefault && Math.abs(cloudQuote.lastPrice - 5073.77) >= 0.05) {
      const baseCloses: number[] =
        existingJkse && Array.isArray(existingJkse.closes) && existingJkse.closes.length >= 2
          ? [...existingJkse.closes]
          : [];
      if (
        Array.isArray(cloudStatePayload.liveIhsgReturns) &&
        cloudStatePayload.liveIhsgReturns.length >= 15
      ) {
        // Reconstruct recent closes from cloudStatePayload.liveIhsgReturns ending at cloudQuote.lastPrice
        const rets = cloudStatePayload.liveIhsgReturns;
        const reconstructed: number[] = new Array(rets.length + 1);
        reconstructed[rets.length] = Number(cloudQuote.lastPrice.toFixed(2));
        for (let i = rets.length - 1; i >= 0; i--) {
          const rDec = Number(rets[i]) / 100;
          const prev = reconstructed[i + 1] / Math.max(0.5, 1 + rDec);
          reconstructed[i] = Number(prev.toFixed(2));
        }
        mergedSnapshot.data['^JKSE'] = {
          symbol: '^JKSE',
          lastPrice: Number(cloudQuote.lastPrice.toFixed(2)),
          change1D: Number(cloudQuote.change1D.toFixed(2)),
          closes: reconstructed,
          shortName: 'IDX Composite'
        };
      } else {
        if (baseCloses.length > 0) {
          baseCloses[baseCloses.length - 1] = Number(cloudQuote.lastPrice.toFixed(2));
        } else {
          baseCloses.push(Number(cloudQuote.lastPrice.toFixed(2)));
        }
        mergedSnapshot.data['^JKSE'] = {
          ...(existingJkse || {}),
          symbol: '^JKSE',
          lastPrice: Number(cloudQuote.lastPrice.toFixed(2)),
          change1D: Number(cloudQuote.change1D.toFixed(2)),
          closes: baseCloses,
          shortName: 'IDX Composite'
        };
      }
    }
  }

  // Merge fresher stock quotes and macro indicators from cloudStatePayload if available
  const cloudTimeMs =
    cloudStatePayload?.updatedAt
      ? new Date(cloudStatePayload.updatedAt).getTime()
      : (cloudStatePayload as any)?.savedAt
      ? new Date((cloudStatePayload as any).savedAt).getTime()
      : 0;
  const snapTimeMs = mergedSnapshot.generatedAt
    ? new Date(mergedSnapshot.generatedAt).getTime()
    : 0;
  const isCloudNewerOrEqual = !snapTimeMs || (cloudTimeMs > 0 && cloudTimeMs >= snapTimeMs);

  if (Array.isArray(cloudStatePayload?.stocks)) {
    for (const st of cloudStatePayload.stocks) {
      if (!st || !st.ticker || typeof st.lastPrice !== 'number' || st.lastPrice <= 0) {
        continue;
      }
      const cleanTicker = String(st.ticker).trim().toUpperCase().replace(/\.JK$/i, '');
      const yfSym = `${cleanTicker}.JK`;
      const existingItem = mergedSnapshot.data[yfSym];
      if (!existingItem || isCloudNewerOrEqual) {
        const lastPrice = Number(st.lastPrice);
        const change1D = typeof st.change1D === 'number' ? Number(st.change1D) : 0;
        const prevClose =
          change1D !== 0 && change1D > -99
            ? Number((lastPrice / (1 + change1D / 100)).toFixed(2))
            : lastPrice;
        const baseCloses: number[] =
          existingItem && Array.isArray(existingItem.closes) && existingItem.closes.length >= 2
            ? [...existingItem.closes]
            : Array(21).fill(prevClose).concat([lastPrice]);
        baseCloses[baseCloses.length - 1] = lastPrice;
        if (baseCloses.length >= 2 && change1D !== 0) {
          baseCloses[baseCloses.length - 2] = prevClose;
        }
        mergedSnapshot.data[yfSym] = {
          ...(existingItem || {}),
          symbol: yfSym,
          lastPrice,
          change1D,
          closes: baseCloses,
          shortName: st.name || existingItem?.shortName || cleanTicker
        };
      }
    }
  }

  if (Array.isArray(cloudStatePayload?.macroIndicators)) {
    for (const m of cloudStatePayload.macroIndicators) {
      if (!m || !m.symbol || typeof m.value !== 'number' || m.value <= 0) {
        continue;
      }
      const existingMacro = mergedSnapshot.data[m.symbol];
      if (!existingMacro || isCloudNewerOrEqual) {
        const lastPrice = Number(m.value);
        const change1D = typeof m.change1D === 'number' ? Number(m.change1D) : 0;
        const prevClose =
          change1D !== 0 && change1D > -99
            ? Number((lastPrice / (1 + change1D / 100)).toFixed(2))
            : lastPrice;
        const baseCloses: number[] =
          existingMacro && Array.isArray(existingMacro.closes) && existingMacro.closes.length >= 2
            ? [...existingMacro.closes]
            : [prevClose, lastPrice];
        baseCloses[baseCloses.length - 1] = lastPrice;
        mergedSnapshot.data[m.symbol] = {
          ...(existingMacro || {}),
          symbol: m.symbol,
          lastPrice,
          change1D,
          closes: baseCloses
        };
      }
    }
  }

  return mergedSnapshot;
}

export function getActiveRepoScope(config?: GitHubCloudConfig): string {
  const defaults = detectDefaultGitHubRepoInfo();
  const owner = (config?.owner?.trim() || defaults.owner || '').toLowerCase();
  const repo = (config?.repo?.trim() || defaults.repo || 'nostradamus').toLowerCase();
  if (owner) {
    return `${owner}/${repo}`;
  }
  if (typeof window !== 'undefined' && window.location.hostname) {
    return `${window.location.hostname.toLowerCase()}/${repo}`;
  }
  return `local/${repo}`;
}

export interface TriggerWorkflowResult {
  ok: boolean;
  message: string;
  actionsUrl: string;
  autoEnabledCount?: number;
  needsManualForkApproval?: boolean;
}

/**
 * Dynamically discovers, auto-enables (for forked repositories where state is 'disabled_fork'),
 * and triggers GitHub Actions workflows (`deploy-pages.yml` and `sync-idx-market.yml`)
 * via GitHub REST API (`workflow_dispatch`).
 */
export async function triggerGitHubActionsMarketSync(
  config: GitHubCloudConfig
): Promise<TriggerWorkflowResult> {
  const rawOwner = config.owner.trim();
  const rawRepo = config.repo.trim() || 'nostradamus';
  const actionsUrl = rawOwner
    ? `https://github.com/${rawOwner}/${rawRepo}/actions`
    : 'https://github.com';

  if (!isGitHubCloudConfigured(config)) {
    return {
      ok: false,
      actionsUrl,
      message: 'Konfigurasikan GitHub Username, Repo (nostradamus), dan Token PAT terlebih dahulu.'
    };
  }

  const owner = encodeURIComponent(rawOwner);
  const repo = encodeURIComponent(rawRepo);
  const branch = config.branch.trim() || 'main';
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${config.patToken.trim()}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json'
  };

  try {
    // 1. Proactively enable GitHub Actions & write workflow permissions on forked repositories
    try {
      await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/permissions`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ enabled: true, allowed_actions: 'all' })
      });
      await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/permissions/workflow`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          default_workflow_permissions: 'write',
          can_approve_pull_request_reviews: true
        })
      });
    } catch {
      // Ignore if Fine-Grained PAT does not include Administration scope
    }

    // Check repository default branch in case branch differs
    let repoDefaultBranch = branch;
    let isForkRepo = false;
    try {
      const repoRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
        method: 'GET',
        headers,
        cache: 'no-store'
      });
      if (repoRes.ok) {
        const repoData = (await repoRes.json()) as {
          default_branch?: string;
          fork?: boolean;
        };
        if (repoData.default_branch) {
          repoDefaultBranch = repoData.default_branch;
        }
        isForkRepo = Boolean(repoData.fork);
      }
    } catch {
      // continue
    }

    // 2. Discover ALL workflows in the repository (including 'disabled_fork', 'disabled_manually', 'disabled_inactivity')
    const listUrl = `https://api.github.com/repos/${owner}/${repo}/actions/workflows?t=${Date.now()}`;
    const listRes = await fetch(listUrl, {
      method: 'GET',
      headers,
      cache: 'no-store'
    });

    const triggeredNames: string[] = [];
    let autoEnabledCount = 0;
    let lastErrorStatus = 0;
    let lastErrorDetail = '';

    if (listRes.ok) {
      const listData = (await listRes.json()) as {
        workflows?: Array<{ id: number; name: string; path: string; state: string }>;
      };
      const workflows = Array.isArray(listData.workflows) ? listData.workflows : [];

      // Match sync-idx-market.yml and/or deploy-pages.yml REGARDLESS of state (critical for forked repos!)
      const targetWorkflows = workflows.filter(
        (w) =>
          w.path.endsWith('sync-idx-market.yml') ||
          w.path.endsWith('deploy-pages.yml') ||
          w.name.toLowerCase().includes('nostradamus') ||
          w.name.toLowerCase().includes('sync')
      );

      const candidates = targetWorkflows.length > 0 ? targetWorkflows : workflows.slice(0, 2);

      for (const wf of candidates) {
        const fileName = wf.path.split('/').pop() || wf.name;

        // If workflow is disabled (e.g. 'disabled_fork' on a newly forked repo), auto-enable it first!
        if (wf.state !== 'active') {
          try {
            const enableByIdRes = await fetch(
              `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${wf.id}/enable`,
              {
                method: 'PUT',
                headers
              }
            );
            if (enableByIdRes.ok || enableByIdRes.status === 204) {
              autoEnabledCount++;
            } else {
              const enableByFileRes = await fetch(
                `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${encodeURIComponent(
                  fileName
                )}/enable`,
                {
                  method: 'PUT',
                  headers
                }
              );
              if (enableByFileRes.ok || enableByFileRes.status === 204) {
                autoEnabledCount++;
              }
            }
          } catch {
            // continue to dispatch attempt
          }
        }

        // Dispatch workflow on configured branch (with fallback to repoDefaultBranch)
        try {
          let dispatchRes = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${wf.id}/dispatches`,
            {
              method: 'POST',
              headers,
              body: JSON.stringify({ ref: branch })
            }
          );

          if (!dispatchRes.ok && dispatchRes.status !== 204 && repoDefaultBranch !== branch) {
            dispatchRes = await fetch(
              `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${wf.id}/dispatches`,
              {
                method: 'POST',
                headers,
                body: JSON.stringify({ ref: repoDefaultBranch })
              }
            );
          }

          if (dispatchRes.status === 204 || dispatchRes.ok) {
            triggeredNames.push(fileName);
          } else {
            lastErrorStatus = dispatchRes.status;
            try {
              const errJson = (await dispatchRes.json()) as { message?: string };
              lastErrorDetail = errJson.message || '';
            } catch {
              // ignore
            }
          }
        } catch {
          // continue to next candidate
        }
      }
    } else {
      lastErrorStatus = listRes.status;
    }

    // 3. Direct filename fallback (in case newly forked repo hasn't indexed workflow list yet)
    if (triggeredNames.length === 0) {
      for (const wfFile of ['sync-idx-market.yml', 'deploy-pages.yml']) {
        try {
          await fetch(
            `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${wfFile}/enable`,
            {
              method: 'PUT',
              headers
            }
          );
          const directRes = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${wfFile}/dispatches`,
            {
              method: 'POST',
              headers,
              body: JSON.stringify({ ref: branch })
            }
          );
          if (directRes.status === 204 || directRes.ok) {
            triggeredNames.push(wfFile);
          } else {
            lastErrorStatus = directRes.status;
            try {
              const errJson = (await directRes.json()) as { message?: string };
              if (errJson.message) lastErrorDetail = errJson.message;
            } catch {
              // ignore
            }
          }
        } catch {
          // ignore
        }
      }
    }

    if (triggeredNames.length > 0) {
      const enabledNote =
        autoEnabledCount > 0
          ? ` (${autoEnabledCount} workflow repo fork otomatis diaktifkan via API)`
          : '';
      return {
        ok: true,
        actionsUrl,
        autoEnabledCount,
        message: `GitHub Actions (${triggeredNames.join(' & ')}) berhasil dipicu di ${rawOwner}/${rawRepo} (branch ${branch})${enabledNote}. Server GitHub sedang memperbarui 956+ saham JCI & membangun ulang halaman.`
      };
    }

    const isForkBlocked =
      isForkRepo ||
      lastErrorStatus === 422 ||
      lastErrorStatus === 404 ||
      lastErrorDetail.toLowerCase().includes('disabled') ||
      lastErrorDetail.toLowerCase().includes('not found');

    return {
      ok: false,
      actionsUrl,
      needsManualForkApproval: isForkBlocked,
      message: isForkBlocked
        ? `Pada repositori hasil Fork (${rawOwner}/${rawRepo}), GitHub menonaktifkan workflow secara default demi keamanan hingga Anda mengklik tombol hijau "I understand my workflows, go ahead and enable them" satu kali saja di tab Actions GitHub, serta pastikan Token PAT memiliki izin "workflow".`
        : `Pastikan Token PAT Anda memiliki izin "workflow" (Classic) atau "Actions: Read and write" (Fine-Grained), serta file workflow (.github/workflows/deploy-pages.yml & sync-idx-market.yml) tersedia di branch ${branch} pada ${rawOwner}/${rawRepo}. ${
            lastErrorDetail ? `(Detail API: ${lastErrorDetail})` : ''
          }`
    };
  } catch (err: unknown) {
    return {
      ok: false,
      actionsUrl,
      message:
        err instanceof Error
          ? err.message
          : 'Gagal menghubungi GitHub Actions API. Periksa koneksi atau izin Token PAT Anda.'
    };
  }
}

export interface SyncForkUpstreamResult {
  ok: boolean;
  isFork: boolean;
  parentFullName: string;
  merged: boolean;
  upToDate: boolean;
  conflictAutoResolved: boolean;
  workflowTriggered: boolean;
  actionsUrl: string;
  message: string;
}

/**
 * 1-Click Sync Fork Upstream & Rebuild UI:
 * 1. Syncs the forked repository's branch with the upstream parent repository (e.g. se-6108/nostradamus)
 *    using GitHub's `merge-upstream` endpoint.
 * 2. If `merge-upstream` encounters a 409 conflict (e.g. because `data/nostradamus_cloud_state.json`
 *    or `CNAME` was customized on the fork), automatically performs a conflict-free Git Tree merge
 *    that pulls 100% of the latest UI source code (`src/*`, `index.html`, workflows) from upstream
 *    while preserving the fork's own portfolio state JSON and custom domain `CNAME`.
 * 3. Automatically enables & dispatches `deploy-pages.yml` so GitHub Pages on the fork rebuilds
 *    with the latest Security Gate (`12345`), `Ubah Sandi`, `Kunci`, and collapsible Cloud Sync UI.
 */
export async function syncForkUpstreamAndRebuildPages(
  config: GitHubCloudConfig
): Promise<SyncForkUpstreamResult> {
  const rawOwner = config.owner.trim();
  const rawRepo = config.repo.trim() || 'nostradamus';
  const branch = config.branch.trim() || 'main';
  const actionsUrl = rawOwner
    ? `https://github.com/${rawOwner}/${rawRepo}/actions`
    : 'https://github.com';

  if (!isGitHubCloudConfigured(config)) {
    return {
      ok: false,
      isFork: false,
      parentFullName: 'se-6108/nostradamus',
      merged: false,
      upToDate: false,
      conflictAutoResolved: false,
      workflowTriggered: false,
      actionsUrl,
      message:
        'Mohon lengkapi GitHub Username, Nama Repository (nostradamus), dan Token PAT terlebih dahulu.'
    };
  }

  const owner = encodeURIComponent(rawOwner);
  const repo = encodeURIComponent(rawRepo);
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${config.patToken.trim()}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json'
  };

  let isFork = false;
  let parentFullName = 'se-6108/nostradamus';
  let parentBranch = 'main';
  let targetBranch = branch;
  let merged = false;
  let upToDate = false;
  let conflictAutoResolved = false;
  let syncSummaryNote = '';

  try {
    // 1. Inspect repository metadata to detect fork status and upstream parent
    const repoRes = await fetch(`https://api.github.com/repos/${owner}/${repo}?t=${Date.now()}`, {
      method: 'GET',
      headers,
      cache: 'no-store'
    });

    if (!repoRes.ok) {
      throw new Error(
        `Gagal mengakses repository ${rawOwner}/${rawRepo} (HTTP ${repoRes.status}). Periksa kembali Username & Token PAT Anda.`
      );
    }

    const repoData = (await repoRes.json()) as {
      fork?: boolean;
      default_branch?: string;
      parent?: { full_name?: string; default_branch?: string };
      source?: { full_name?: string; default_branch?: string };
    };

    isFork = Boolean(repoData.fork);
    if (repoData.default_branch) {
      targetBranch = repoData.default_branch;
    }
    if (repoData.parent?.full_name) {
      parentFullName = repoData.parent.full_name;
      parentBranch = repoData.parent.default_branch || 'main';
    } else if (repoData.source?.full_name) {
      parentFullName = repoData.source.full_name;
      parentBranch = repoData.source.default_branch || 'main';
    }

    const isDifferentFromParent =
      `${rawOwner}/${rawRepo}`.toLowerCase() !== parentFullName.toLowerCase();

    // 2. If this is a fork (or a secondary repo different from upstream), sync upstream code
    if (isFork || isDifferentFromParent) {
      const mergeRes = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/merge-upstream`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ branch: targetBranch })
        }
      );

      if (mergeRes.ok) {
        const mergeJson = (await mergeRes.json()) as {
          merge_type?: string;
          message?: string;
        };
        if (mergeJson.merge_type === 'none') {
          upToDate = true;
          syncSummaryNote = `Kode sumber pada ${rawOwner}/${rawRepo} (${targetBranch}) sudah sinkron dengan repo utama (${parentFullName}).`;
        } else {
          merged = true;
          syncSummaryNote = `Kode UI terbaru dari repo utama (${parentFullName}) berhasil digabungkan ke ${rawOwner}/${rawRepo} (${mergeJson.merge_type || 'fast-forward'}).`;
        }
      } else {
        // Fallback: Conflict-free Git Tree sync (resolves 409 Conflict when data/nostradamus_cloud_state.json diverged)
        const [upOwner, upRepo] = parentFullName.split('/');
        const upRefRes = await fetch(
          `https://api.github.com/repos/${encodeURIComponent(upOwner)}/${encodeURIComponent(
            upRepo
          )}/git/ref/heads/${encodeURIComponent(parentBranch)}?t=${Date.now()}`,
          { method: 'GET', headers, cache: 'no-store' }
        );
        const forkRefRes = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(
            targetBranch
          )}?t=${Date.now()}`,
          { method: 'GET', headers, cache: 'no-store' }
        );

        if (upRefRes.ok && forkRefRes.ok) {
          const upRefData = (await upRefRes.json()) as { object?: { sha?: string } };
          const forkRefData = (await forkRefRes.json()) as { object?: { sha?: string } };
          const upstreamCommitSha = upRefData.object?.sha;
          const forkCommitSha = forkRefData.object?.sha;

          if (upstreamCommitSha && forkCommitSha) {
            if (upstreamCommitSha === forkCommitSha) {
              upToDate = true;
              syncSummaryNote = `Branch ${targetBranch} sudah berada pada commit terbaru yang sama dengan ${parentFullName}.`;
            } else {
              const upTreeRes = await fetch(
                `https://api.github.com/repos/${encodeURIComponent(upOwner)}/${encodeURIComponent(
                  upRepo
                )}/git/trees/${upstreamCommitSha}?recursive=1`,
                { method: 'GET', headers, cache: 'no-store' }
              );
              const forkTreeRes = await fetch(
                `https://api.github.com/repos/${owner}/${repo}/git/trees/${forkCommitSha}?recursive=1`,
                { method: 'GET', headers, cache: 'no-store' }
              );

              if (upTreeRes.ok && forkTreeRes.ok) {
                const upTreeData = (await upTreeRes.json()) as {
                  sha?: string;
                  tree?: Array<{ path?: string; mode?: string; type?: string; sha?: string }>;
                };
                const forkTreeData = (await forkTreeRes.json()) as {
                  sha?: string;
                  tree?: Array<{ path?: string; mode?: string; type?: string; sha?: string }>;
                };

                // Preserve fork's own portfolio state JSON and custom domain CNAME
                const preservedPaths = new Set([
                  config.filePath.trim().replace(/^\/+/, ''),
                  'data/nostradamus_cloud_state.json',
                  'CNAME',
                  'public/CNAME'
                ]);

                const forkBlobShaByPath = new Map<string, string>();
                for (const item of forkTreeData.tree || []) {
                  if (item.path && item.sha && item.type === 'blob') {
                    forkBlobShaByPath.set(item.path, item.sha);
                  }
                }

                // Compare per-file Git Blob SHA: only include upstream blobs whose SHA differs from the fork's blob SHA
                const changedUpstreamBlobs = (upTreeData.tree || [])
                  .filter(
                    (item) =>
                      item.path &&
                      item.sha &&
                      item.type === 'blob' &&
                      !preservedPaths.has(item.path) &&
                      forkBlobShaByPath.get(item.path) !== item.sha
                  )
                  .map((item) => ({
                    path: item.path!,
                    mode: (item.mode || '100644') as '100644',
                    type: 'blob' as const,
                    sha: item.sha!
                  }));

                if (changedUpstreamBlobs.length === 0) {
                  upToDate = true;
                  syncSummaryNote = ` Seluruh file kode sumber pada ${rawOwner}/${rawRepo} memiliki hash SHA yang identik dengan ${parentFullName}.`;
                } else if (forkTreeData.sha) {
                  const createTreeRes = await fetch(
                    `https://api.github.com/repos/${owner}/${repo}/git/trees`,
                    {
                      method: 'POST',
                      headers,
                      body: JSON.stringify({
                        base_tree: forkTreeData.sha,
                        tree: changedUpstreamBlobs
                      })
                    }
                  );

                  if (createTreeRes.ok) {
                    const createdTree = (await createTreeRes.json()) as { sha?: string };
                    if (createdTree.sha) {
                      let createCommitRes = await fetch(
                        `https://api.github.com/repos/${owner}/${repo}/git/commits`,
                        {
                          method: 'POST',
                          headers,
                          body: JSON.stringify({
                            message: `chore(fork-sync): update ${changedUpstreamBlobs.length} changed files by SHA from ${parentFullName}`,
                            tree: createdTree.sha,
                            parents: [forkCommitSha, upstreamCommitSha]
                          })
                        }
                      );

                      if (!createCommitRes.ok) {
                        createCommitRes = await fetch(
                          `https://api.github.com/repos/${owner}/${repo}/git/commits`,
                          {
                            method: 'POST',
                            headers,
                            body: JSON.stringify({
                              message: `chore(fork-sync): update ${changedUpstreamBlobs.length} changed files by SHA from ${parentFullName}`,
                              tree: createdTree.sha,
                              parents: [forkCommitSha]
                            })
                          }
                        );
                      }

                      if (createCommitRes.ok) {
                        const createdCommit = (await createCommitRes.json()) as { sha?: string };
                        if (createdCommit.sha) {
                          const updateRefRes = await fetch(
                            `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(
                              targetBranch
                            )}`,
                            {
                              method: 'PATCH',
                              headers,
                              body: JSON.stringify({
                                sha: createdCommit.sha,
                                force: false
                              })
                            }
                          );
                          if (updateRefRes.ok) {
                            merged = true;
                            conflictAutoResolved = true;
                            syncSummaryNote = `${changedUpstreamBlobs.length} file kode yang berubah dari ${parentFullName} berhasil di-commit berdasarkan komparasi SHA tanpa menimpa data portofolio milik ${rawOwner}/${rawRepo}.`;
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    } else {
      upToDate = true;
      syncSummaryNote = `Repo ${rawOwner}/${rawRepo} adalah repository utama (upstream).`;
    }

    // 2B. Sync latest prebuilt static bundle (/docs/assets/app.js, /docs/assets/index.css, /docs/index.html, and static-market-snapshot.json) if running from a newer build
    try {
      const bundleAssets: Array<{ fetchUrl: string; targetPaths: string[] }> = [
        { fetchUrl: '/docs/assets/app.js', targetPaths: ['docs/assets/app.js'] },
        { fetchUrl: '/docs/assets/index.css', targetPaths: ['docs/assets/index.css'] },
        { fetchUrl: '/docs/index.html', targetPaths: ['docs/index.html'] },
        {
          fetchUrl: '/static-market-snapshot.json',
          targetPaths: [
            'public/static-market-snapshot.json',
            'static-market-snapshot.json',
            'src/data/staticMarketSnapshot.json',
            'docs/static-market-snapshot.json'
          ]
        }
      ];

      const headRefRes = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(
          targetBranch
        )}?t=${Date.now()}`,
        { method: 'GET', headers, cache: 'no-store' }
      );

      if (headRefRes.ok) {
        const headRefData = (await headRefRes.json()) as { object?: { sha?: string } };
        const headCommitSha = headRefData.object?.sha;
        if (headCommitSha) {
          const headTreeRes = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/git/trees/${headCommitSha}?recursive=1`,
            { method: 'GET', headers, cache: 'no-store' }
          );
          if (headTreeRes.ok) {
            const headTreeData = (await headTreeRes.json()) as {
              sha?: string;
              tree?: Array<{ path?: string; sha?: string; type?: string }>;
            };
            const existingBlobSha = new Map<string, string>();
            for (const entry of headTreeData.tree || []) {
              if (entry.path && entry.sha && entry.type === 'blob') {
                existingBlobSha.set(entry.path, entry.sha);
              }
            }

            const newTreeEntries: Array<{
              path: string;
              mode: '100644';
              type: 'blob';
              content: string;
            }> = [];

            for (const asset of bundleAssets) {
              try {
                const res = await fetch(`${asset.fetchUrl}?t=${Date.now()}`, { cache: 'no-store' });
                if (!res.ok) continue;
                const text = await res.text();
                if (!text || text.length < 60) continue;
                // Avoid pushing Vite dev index.html if /docs/assets/app.js fell back to HTML
                if (
                  asset.fetchUrl.endsWith('.js') &&
                  text.trimStart().startsWith('<!DOCTYPE html>')
                ) {
                  continue;
                }
                const localSha = await computeGitBlobSha(text);
                for (const repoPath of asset.targetPaths) {
                  if (existingBlobSha.get(repoPath) !== localSha) {
                    newTreeEntries.push({
                      path: repoPath,
                      mode: '100644',
                      type: 'blob',
                      content: text
                    });
                  }
                }
              } catch {
                // skip unavailable local asset
              }
            }

            if (newTreeEntries.length > 0 && headTreeData.sha) {
              const createBundleTreeRes = await fetch(
                `https://api.github.com/repos/${owner}/${repo}/git/trees`,
                {
                  method: 'POST',
                  headers,
                  body: JSON.stringify({
                    base_tree: headTreeData.sha,
                    tree: newTreeEntries
                  })
                }
              );
              if (createBundleTreeRes.ok) {
                const createdBundleTree = (await createBundleTreeRes.json()) as { sha?: string };
                if (createdBundleTree.sha) {
                  const bundleCommitRes = await fetch(
                    `https://api.github.com/repos/${owner}/${repo}/git/commits`,
                    {
                      method: 'POST',
                      headers,
                      body: JSON.stringify({
                        message: `chore(pages-bundle): sync latest lightweight on-demand inspect & AI committee bundle (${newTreeEntries.length} files)`,
                        tree: createdBundleTree.sha,
                        parents: [headCommitSha]
                      })
                    }
                  );
                  if (bundleCommitRes.ok) {
                    const bundleCommitData = (await bundleCommitRes.json()) as { sha?: string };
                    if (bundleCommitData.sha) {
                      const patchHeadRes = await fetch(
                        `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(
                          targetBranch
                        )}`,
                        {
                          method: 'PATCH',
                          headers,
                          body: JSON.stringify({
                            sha: bundleCommitData.sha,
                            force: false
                          })
                        }
                      );
                      if (patchHeadRes.ok) {
                        merged = true;
                        syncSummaryNote = `${syncSummaryNote} Bundle produksi terbaru (${newTreeEntries
                          .map((e) => e.path)
                          .join(', ')}) berhasil di-push langsung ke ${rawOwner}/${rawRepo}.`.trim();
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    } catch {
      // Non-fatal if static bundle push is skipped
    }

    // 3. Trigger GitHub Actions (deploy-pages.yml & sync-idx-market.yml) so GitHub Pages rebuilds the UI
    const wfResult = await triggerGitHubActionsMarketSync({
      ...config,
      branch: targetBranch
    });

    return {
      ok: merged || upToDate || wfResult.ok,
      isFork,
      parentFullName,
      merged,
      upToDate,
      conflictAutoResolved,
      workflowTriggered: wfResult.ok,
      actionsUrl: wfResult.actionsUrl,
      message: `${syncSummaryNote} ${wfResult.message}`.trim()
    };
  } catch (err: unknown) {
    return {
      ok: false,
      isFork,
      parentFullName,
      merged: false,
      upToDate: false,
      conflictAutoResolved: false,
      workflowTriggered: false,
      actionsUrl,
      message:
        err instanceof Error
          ? err.message
          : 'Gagal melakukan sinkronisasi fork upstream dengan GitHub API.'
    };
  }
}

