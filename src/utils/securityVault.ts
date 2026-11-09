import { EncryptedPortfolioVault, PortfolioHolding } from '../types/quant';
import embeddedSnapshotRaw from '../data/staticMarketSnapshot.json';

const VAULT_STORAGE_KEY = 'nostradamus_aes256_security_vault_v1';
const PBKDF2_ITERATIONS = 100000;
export const DEFAULT_TERMINAL_PASSPHRASE = '12345';

export interface VaultSensitivePayload {
  holdings: PortfolioHolding[];
  cashReserveIdr: number;
  capitalIdr: number;
}

export interface ActiveVaultSession {
  aesKey: CryptoKey;
  saltBase64: string;
  verifierHashBase64: string;
  isDefaultPassphrase: boolean;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(base64Str: string): Uint8Array {
  const clean = base64Str.replace(/\s/g, '');
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Pure synchronous FIPS 180-4 SHA-256 implementation returning a 64-character hex digest.
 * Used to bind EncryptedPortfolioVault to a one-way cryptographic fingerprint of the active
 * repository/domain scope without ever storing repository names or domains in plaintext.
 */
const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);

function rotr(n: number, x: number): number {
  return (x >>> n) | (x << (32 - n));
}

export function sha256HexSync(asciiOrUtf8: string): string {
  const bytes = new TextEncoder().encode(asciiOrUtf8);
  const bitLen = bytes.length * 8;
  const totalBytes = (((bytes.length + 8) >> 6) + 1) << 6;
  const padded = new Uint8Array(totalBytes);
  padded.set(bytes);
  padded[bytes.length] = 0x80;

  const view = new DataView(padded.buffer);
  view.setUint32(totalBytes - 8, Math.floor(bitLen / 0x100000000), false);
  view.setUint32(totalBytes - 4, bitLen >>> 0, false);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const w = new Uint32Array(64);

  for (let offset = 0; offset < totalBytes; offset += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(7, w[i - 15]) ^ rotr(18, w[i - 15]) ^ (w[i - 15] >>> 3);
      const s1 = rotr(17, w[i - 2]) ^ rotr(19, w[i - 2]) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i++) {
      const S1 = rotr(6, e) ^ rotr(11, e) ^ rotr(25, e);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const S0 = rotr(2, a) ^ rotr(13, a) ^ rotr(22, a);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((v) => v.toString(16).padStart(8, '0'))
    .join('');
}

/**
 * Derives a 256-bit AES-GCM key and a separate 256-bit SHA-256 verification hash
 * from a user passphrase and 128-bit salt using Web Crypto PBKDF2-SHA256 (100,000 iterations).
 * Plaintext passphrase is never stored anywhere.
 */
export async function deriveVaultKeyAndVerifier(
  passphrase: string,
  saltBytes: Uint8Array
): Promise<{ aesKey: CryptoKey; verifierHashBase64: string }> {
  const enc = new TextEncoder();
  const baseKey = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );

  // Derive 512 bits (64 bytes): first 32 bytes for AES-256-GCM key, next 32 bytes for SHA-256 verifier
  const derivedBits = await window.crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes as unknown as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256'
    },
    baseKey,
    512
  );

  const allBytes = new Uint8Array(derivedBits);
  const aesKeyBytes = allBytes.slice(0, 32);
  const verifierRawBytes = allBytes.slice(32, 64);

  const aesKey = await window.crypto.subtle.importKey(
    'raw',
    aesKeyBytes,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  const verifierDigest = await window.crypto.subtle.digest('SHA-256', verifierRawBytes);
  const verifierHashBase64 = bytesToBase64(new Uint8Array(verifierDigest));

  return { aesKey, verifierHashBase64 };
}

export function getBrowserOriginScope(): string {
  if (typeof window !== 'undefined' && window.location.hostname) {
    const host = window.location.hostname.toLowerCase();
    const pathSeg = window.location.pathname
      .split('/')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)[0];
    if (host.endsWith('.github.io') && pathSeg && !pathSeg.endsWith('.html')) {
      return `${host}/${pathSeg}`;
    }
    return host;
  }
  return 'local-origin';
}

export function normalizeRepoScope(repoScope?: string): string {
  const cleaned = (repoScope || '').trim().toLowerCase().replace(/^\/+|\/+$/g, '');
  if (cleaned && cleaned !== '/' && !cleaned.startsWith('local/')) {
    return cleaned;
  }
  return getBrowserOriginScope();
}

export function computeScopeHash(repoScope?: string): string {
  return sha256HexSync(`nostradamus-vault-scope-v2::${normalizeRepoScope(repoScope)}`);
}

export function computeOriginScopeHash(): string {
  return sha256HexSync(`nostradamus-vault-origin-v2::${getBrowserOriginScope()}`);
}

function getScopedVaultKey(repoScope?: string): string {
  return `${VAULT_STORAGE_KEY}::${computeScopeHash(repoScope).slice(0, 24)}`;
}

/**
 * Checks whether an EncryptedPortfolioVault belongs to the currently active repository/domain scope.
 * Returns false if the vault was inherited from a parent/original repository before forking,
 * allowing forked repositories to automatically fall back to the default '12345' passphrase.
 */
export function isVaultMatchingRepoScope(
  vault: EncryptedPortfolioVault | null | undefined,
  activeRepoScope?: string
): boolean {
  if (
    !vault ||
    vault.version !== 1 ||
    typeof vault.saltBase64 !== 'string' ||
    typeof vault.verifierHashBase64 !== 'string' ||
    typeof vault.ivBase64 !== 'string' ||
    typeof vault.cipherTextBase64 !== 'string'
  ) {
    return false;
  }

  const effectiveVaultScopeHash =
    vault.scopeHash || (vault.repoScope ? computeScopeHash(vault.repoScope) : undefined);

  // Reject vaults without any cryptographic scopeHash, originHash, or explicit repoScope
  if (!effectiveVaultScopeHash && !vault.originHash) {
    return false;
  }

  // If the vault explicitly declares a repoScope (e.g. "se-6108/nostradamus") and the active
  // configured repo is a different owner/repo (e.g. a fork "feynmanwyckoff-cmyk/nostradamus"),
  // strictly isolate the fork so it defaults to '12345'.
  if (vault.repoScope && activeRepoScope && activeRepoScope.includes('/')) {
    const normalizedVaultRepo = normalizeRepoScope(vault.repoScope);
    const normalizedActiveRepo = normalizeRepoScope(activeRepoScope);
    if (
      normalizedVaultRepo.includes('/') &&
      normalizedActiveRepo.includes('/') &&
      !normalizedActiveRepo.endsWith('.github.io/nostradamus') &&
      normalizedVaultRepo !== normalizedActiveRepo
    ) {
      return false;
    }
  }

  const targetScopeHash = computeScopeHash(activeRepoScope);
  if (effectiveVaultScopeHash && effectiveVaultScopeHash === targetScopeHash) {
    return true;
  }

  // On a custom domain where the visitor's browser doesn't have GitHub owner in localStorage,
  // match by the one-way SHA-256 originHash so the owner's custom domain stays locked for all visitors,
  // while any fork on a different domain/username.github.io will have a different originHash and reset to '12345'.
  const originScope = getBrowserOriginScope();
  const isLocalhost =
    originScope.startsWith('localhost') ||
    originScope.startsWith('127.0.0.1') ||
    originScope === 'local-origin';

  const normalizedActive = normalizeRepoScope(activeRepoScope);
  const activeMatchesOrigin =
    normalizedActive === originScope || normalizedActive.startsWith(`${originScope}/`);

  if (!isLocalhost && activeMatchesOrigin && vault.originHash) {
    return vault.originHash === computeOriginScopeHash();
  }

  return false;
}

/**
 * Encrypts sensitive portfolio data using an already derived in-memory AES-256-GCM key.
 */
export async function encryptPortfolioWithSession(
  session: ActiveVaultSession,
  payload: VaultSensitivePayload,
  repoScope?: string
): Promise<EncryptedPortfolioVault> {
  const ivBytes = window.crypto.getRandomValues(new Uint8Array(12));
  const encodedPayload = new TextEncoder().encode(JSON.stringify(payload));

  const cipherBuffer = await window.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: ivBytes
    },
    session.aesKey,
    encodedPayload
  );

  const normalizedScope = normalizeRepoScope(repoScope);

  return {
    version: 1,
    saltBase64: session.saltBase64,
    verifierHashBase64: session.verifierHashBase64,
    ivBase64: bytesToBase64(ivBytes),
    cipherTextBase64: bytesToBase64(new Uint8Array(cipherBuffer)),
    updatedAt: new Date().toISOString(),
    scopeHash: computeScopeHash(repoScope),
    originHash: computeOriginScopeHash(),
    repoScope: normalizedScope,
    isDefaultPassphrase: session.isDefaultPassphrase
  };
}

/**
 * Creates an encrypted portfolio vault from a passphrase.
 * When called from ChangePassphraseModal inside the terminal, isDefaultPassphrase is false.
 */
export async function createEncryptedVaultFromPassphrase(
  passphrase: string,
  payload: VaultSensitivePayload,
  repoScope?: string,
  isDefaultPassphrase: boolean = false
): Promise<{ vault: EncryptedPortfolioVault; session: ActiveVaultSession }> {
  const saltBytes = window.crypto.getRandomValues(new Uint8Array(16));
  const saltBase64 = bytesToBase64(saltBytes);
  const { aesKey, verifierHashBase64 } = await deriveVaultKeyAndVerifier(passphrase, saltBytes);

  const session: ActiveVaultSession = {
    aesKey,
    saltBase64,
    verifierHashBase64,
    isDefaultPassphrase
  };

  const vault = await encryptPortfolioWithSession(session, payload, repoScope);
  return { vault, session };
}

/**
 * Creates a default encrypted vault ('12345') for a fresh deployment or newly forked repository.
 */
export async function createDefaultVaultForScope(
  payload: VaultSensitivePayload,
  repoScope?: string
): Promise<{ vault: EncryptedPortfolioVault; session: ActiveVaultSession }> {
  return createEncryptedVaultFromPassphrase(
    DEFAULT_TERMINAL_PASSPHRASE,
    payload,
    repoScope,
    true
  );
}

/**
 * Verifies the passphrase against the salted SHA-256 verifier and decrypts the AES-256-GCM portfolio payload.
 */
export async function unlockAndDecryptVault(
  passphrase: string,
  vault: EncryptedPortfolioVault
): Promise<{ payload: VaultSensitivePayload; session: ActiveVaultSession }> {
  const saltBytes = base64ToBytes(vault.saltBase64);
  const { aesKey, verifierHashBase64 } = await deriveVaultKeyAndVerifier(passphrase, saltBytes);

  if (verifierHashBase64 !== vault.verifierHashBase64) {
    throw new Error('INVALID_PASSPHRASE');
  }

  const ivBytes = base64ToBytes(vault.ivBase64);
  const cipherBytes = base64ToBytes(vault.cipherTextBase64);

  try {
    const plainBuffer = await window.crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: ivBytes as unknown as BufferSource
      },
      aesKey,
      cipherBytes as unknown as BufferSource
    );

    const decodedStr = new TextDecoder().decode(plainBuffer);
    const parsed = JSON.parse(decodedStr) as VaultSensitivePayload;

    return {
      payload: {
        holdings: Array.isArray(parsed.holdings) ? parsed.holdings : [],
        cashReserveIdr: typeof parsed.cashReserveIdr === 'number' ? parsed.cashReserveIdr : 0,
        capitalIdr: typeof parsed.capitalIdr === 'number' ? parsed.capitalIdr : 100000000
      },
      session: {
        aesKey,
        saltBase64: vault.saltBase64,
        verifierHashBase64: vault.verifierHashBase64,
        isDefaultPassphrase: vault.isDefaultPassphrase === true
      }
    };
  } catch {
    throw new Error('DECRYPTION_FAILED');
  }
}

export function loadLocalSecurityVault(repoScope?: string): EncryptedPortfolioVault | null {
  try {
    const candidateKeys = [
      getScopedVaultKey(repoScope),
      getScopedVaultKey(undefined),
      VAULT_STORAGE_KEY
    ];
    for (const key of candidateKeys) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as EncryptedPortfolioVault;
      if (isVaultMatchingRepoScope(parsed, repoScope)) {
        return parsed;
      }
    }

    // Check if the static market bundle contains a build-verified encryptedVault for this exact domain/repo scope
    const embeddedVault = (embeddedSnapshotRaw as { encryptedVault?: EncryptedPortfolioVault })
      ?.encryptedVault;
    if (embeddedVault && isVaultMatchingRepoScope(embeddedVault, repoScope)) {
      return embeddedVault;
    }

    return null;
  } catch {
    return null;
  }
}

export function saveLocalSecurityVault(
  vault: EncryptedPortfolioVault,
  repoScope?: string
): void {
  try {
    const stampedVault: EncryptedPortfolioVault = {
      version: 1,
      saltBase64: vault.saltBase64,
      verifierHashBase64: vault.verifierHashBase64,
      ivBase64: vault.ivBase64,
      cipherTextBase64: vault.cipherTextBase64,
      updatedAt: vault.updatedAt || new Date().toISOString(),
      scopeHash: vault.scopeHash || computeScopeHash(repoScope),
      originHash: vault.originHash || computeOriginScopeHash(),
      repoScope: vault.repoScope || normalizeRepoScope(repoScope),
      isDefaultPassphrase: vault.isDefaultPassphrase === true
    };
    const jsonStr = JSON.stringify(stampedVault);
    localStorage.setItem(getScopedVaultKey(repoScope), jsonStr);
    localStorage.setItem(getScopedVaultKey(undefined), jsonStr);
  } catch {
    // ignore storage errors
  }
}

export function clearLocalSecurityVault(repoScope?: string): void {
  try {
    localStorage.removeItem(VAULT_STORAGE_KEY);
    localStorage.removeItem(getScopedVaultKey(repoScope));
    localStorage.removeItem(getScopedVaultKey(undefined));
  } catch {
    // ignore storage errors
  }
}
