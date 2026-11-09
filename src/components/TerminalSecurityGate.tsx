import React, { useState } from 'react';
import {
  Shield,
  Lock,
  KeyRound,
  Eye,
  EyeOff,
  Sun,
  Moon,
  AlertCircle,
  CheckCircle2,
  X
} from 'lucide-react';
import { EncryptedPortfolioVault } from '../types/quant';
import {
  ActiveVaultSession,
  createDefaultVaultForScope,
  createEncryptedVaultFromPassphrase,
  DEFAULT_TERMINAL_PASSPHRASE,
  unlockAndDecryptVault,
  VaultSensitivePayload
} from '../utils/securityVault';

interface TerminalSecurityGateProps {
  themeMode: 'dark' | 'light';
  onToggleTheme: () => void;
  existingVault: EncryptedPortfolioVault | null;
  repoScope?: string;
  initialSensitivePayload: VaultSensitivePayload;
  onUnlockSuccess: (
    decryptedPayload: VaultSensitivePayload,
    session: ActiveVaultSession,
    vault: EncryptedPortfolioVault
  ) => void;
}

export function TerminalSecurityGate({
  themeMode,
  onToggleTheme,
  existingVault,
  repoScope,
  initialSensitivePayload,
  onUnlockSuccess
}: TerminalSecurityGateProps) {
  const isDefaultPassphraseActive =
    !existingVault || existingVault.isDefaultPassphrase === true;

  const [passphrase, setPassphrase] = useState('');
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const trimmed = passphrase.trim();
    if (!trimmed) {
      setErrorMsg('Masukkan sandi terminal terlebih dahulu.');
      return;
    }

    setIsProcessing(true);
    try {
      // If a vault already exists for this scope (either default '12345' or custom passphrase), verify & decrypt it
      if (existingVault) {
        const { payload, session } = await unlockAndDecryptVault(trimmed, existingVault);
        onUnlockSuccess(payload, session, existingVault);
        return;
      }

      // If no vault is stored yet (fresh deployment or newly forked repository), only accept default '12345'
      if (trimmed !== DEFAULT_TERMINAL_PASSPHRASE) {
        throw new Error('INVALID_PASSPHRASE');
      }

      const { vault, session } = await createDefaultVaultForScope(
        initialSensitivePayload,
        repoScope
      );
      onUnlockSuccess(initialSensitivePayload, session, vault);
    } catch (err: unknown) {
      const code = err instanceof Error ? err.message : '';
      if (code === 'INVALID_PASSPHRASE' || code === 'DECRYPTION_FAILED') {
        setErrorMsg('Sandi Terminal tidak valid. Periksa kembali sandi yang Anda masukkan.');
      } else {
        setErrorMsg('Terjadi kesalahan saat memverifikasi kriptografi sandi.');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div
      className={
        themeMode === 'dark'
          ? 'theme-dark min-h-screen flex items-center justify-center bg-[#090C10] text-[#E5E7EB] px-4 py-8'
          : 'theme-light min-h-screen flex items-center justify-center bg-[#F4F5F7] text-[#111315] px-4 py-8'
      }
    >
      {/* Center Lock Card (No Header & No Footer) */}
      <div className="w-full max-w-md bg-[#FFFFFF] border border-[#E4E2DD] rounded-xs p-6 sm:p-7 shadow-sm space-y-5">
        <div className="flex items-start justify-between gap-3 border-b border-[#E4E2DD] pb-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[#D97706] bb-amber">
              <Shield className="w-4 h-4" />
              <span>Nostradamus Quant · Security Gate</span>
            </div>
            <h1 className="text-lg font-bold tracking-tight text-[#111315]">
              Terminal Terkunci (Privasi Portofolio)
            </h1>
            <p className="text-xs text-neutral-500 leading-relaxed">
              Masukkan sandi untuk mendekripsi brankas portofolio dan membuka matriks kuantitatif. Sesi otomatis dikunci kembali setiap kali halaman di-refresh.
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={onToggleTheme}
              title={themeMode === 'dark' ? 'Beralih ke Daylight Mode' : 'Beralih ke Dark Terminal'}
              className="p-2 rounded-xs bg-[#FAF9F6] border border-[#E4E2DD] hover:border-[#F59E0B] transition-colors cursor-pointer"
            >
              {themeMode === 'dark' ? (
                <Sun className="w-4 h-4 text-[#F59E0B]" />
              ) : (
                <Moon className="w-4 h-4 text-[#D97706]" />
              )}
            </button>
            <div className="p-2 rounded-xs bg-[#FAF9F6] border border-[#E4E2DD] text-[#D97706] bb-amber">
              <Lock className="w-4 h-4" />
            </div>
          </div>
        </div>

        {isDefaultPassphraseActive && (
          <div className="p-3 bg-[#FFFBEB] border border-[#F59E0B]/50 rounded-xs space-y-1 text-xs text-[#92400E]">
            <div className="font-bold flex items-center gap-1.5 text-[#B45309]">
              <KeyRound className="w-3.5 h-3.5 shrink-0" />
              <span>Notifikasi Akses Awal / Repo Hasil Fork</span>
            </div>
            <p className="leading-relaxed text-[11.5px]">
              Sandi default terminal saat ini adalah{' '}
              <code className="px-1.5 py-0.5 font-mono font-bold bg-[#FEF3C7] border border-[#F59E0B]/40 rounded-xs text-[#92400E]">
                12345
              </code>
              . Setelah berhasil login, segera ubah sandi Anda melalui tombol{' '}
              <strong>Ubah Sandi</strong> di dalam terminal. Setelah diubah, sandi tidak dapat direset dari luar dan hanya bisa diubah setelah berhasil login.
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-[#111315] mb-1.5">
              Sandi Terminal
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type={showPassphrase ? 'text' : 'password'}
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                autoFocus
                autoComplete="current-password"
                placeholder="Masukkan sandi untuk membuka kunci..."
                className="w-full pl-9 pr-10 py-2 text-xs font-semibold bg-[#FAF9F6] border border-[#E4E2DD] rounded-xs focus:outline-none focus:border-[#F59E0B]"
              />
              <button
                type="button"
                onClick={() => setShowPassphrase((prev) => !prev)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-[#D97706] cursor-pointer"
                title={showPassphrase ? 'Sembunyikan sandi' : 'Tampilkan sandi'}
              >
                {showPassphrase ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {errorMsg && (
            <div className="p-2.5 bg-[#E11D48]/10 border border-[#E11D48]/40 rounded-xs flex items-start gap-2 text-xs text-[#9E2A2B] font-semibold">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isProcessing}
            className="bb-btn-primary w-full py-2.5 px-4 bg-[#D97706] hover:bg-[#B45309] text-white text-xs font-bold rounded-xs transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>
              {isProcessing
                ? 'Memproses Kriptografi SHA-256 & AES-256...'
                : 'Verifikasi Sandi & Buka Terminal'}
            </span>
          </button>
        </form>

        <div className="pt-3 border-t border-[#E4E2DD] space-y-1.5 text-[11px] text-neutral-500">
          <div className="flex items-center gap-1.5 font-semibold text-[#0D5C46]">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            <span>Zero-Knowledge PBKDF2-SHA256 (100.000 Iterasi) + AES-256-GCM</span>
          </div>
          <p className="leading-relaxed">
            Sandi Anda tidak pernah disimpan dalam bentuk teks biasa di kode sumber maupun browser. Setiap kali halaman di-refresh atau tab ditutup, kunci sesi di memori otomatis dihapus.
          </p>
        </div>
      </div>
    </div>
  );
}

interface ChangePassphraseModalProps {
  isOpen: boolean;
  existingVault: EncryptedPortfolioVault | null;
  repoScope?: string;
  currentPayload: VaultSensitivePayload;
  onClose: () => void;
  onPassphraseUpdated: (
    newVault: EncryptedPortfolioVault,
    newSession: ActiveVaultSession
  ) => void;
}

export function ChangePassphraseModal({
  isOpen,
  existingVault,
  repoScope,
  currentPayload,
  onClose,
  onPassphraseUpdated
}: ChangePassphraseModalProps) {
  const [currentPassphrase, setCurrentPassphrase] = useState('');
  const [newPassphrase, setNewPassphrase] = useState('');
  const [confirmNewPassphrase, setConfirmNewPassphrase] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const trimmedCurrent = currentPassphrase.trim();
    const trimmedNew = newPassphrase.trim();

    if (!trimmedCurrent) {
      setErrorMsg('Masukkan sandi saat ini terlebih dahulu.');
      return;
    }
    if (trimmedNew.length < 4) {
      setErrorMsg('Sandi baru minimal terdiri dari 4 karakter atau angka PIN.');
      return;
    }
    if (trimmedNew !== confirmNewPassphrase.trim()) {
      setErrorMsg('Konfirmasi sandi baru tidak cocok.');
      return;
    }

    setIsSaving(true);
    try {
      if (existingVault) {
        await unlockAndDecryptVault(trimmedCurrent, existingVault);
      } else if (trimmedCurrent !== DEFAULT_TERMINAL_PASSPHRASE) {
        throw new Error('INVALID_PASSPHRASE');
      }

      // Explicitly set isDefaultPassphrase: false so the 12345 default notice disappears permanently on this domain/repo
      const { vault, session } = await createEncryptedVaultFromPassphrase(
        trimmedNew,
        currentPayload,
        repoScope,
        false
      );
      setCurrentPassphrase('');
      setNewPassphrase('');
      setConfirmNewPassphrase('');
      onPassphraseUpdated(vault, session);
    } catch {
      setErrorMsg('Sandi saat ini yang Anda masukkan tidak sesuai.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md bg-[#FFFFFF] border border-[#E4E2DD] rounded-xs p-5 space-y-4 shadow-xl">
        <div className="flex items-center justify-between border-b border-[#E4E2DD] pb-3">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-[#D97706] bb-amber" />
            <h3 className="text-sm font-bold text-[#111315]">
              Ubah Sandi Terminal &amp; Enkripsi Ulang AES-256
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-neutral-400 hover:text-[#111315] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleUpdate} className="space-y-3.5">
          <div>
            <label className="block text-xs font-bold text-[#111315] mb-1">
              Sandi Saat Ini
            </label>
            <input
              type={showPass ? 'text' : 'password'}
              value={currentPassphrase}
              onChange={(e) => setCurrentPassphrase(e.target.value)}
              required
              placeholder="Masukkan sandi saat ini (awal: 12345)..."
              className="w-full px-3 py-1.5 text-xs font-semibold bg-[#FAF9F6] border border-[#E4E2DD] rounded-xs focus:outline-none focus:border-[#F59E0B]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#111315] mb-1">
              Sandi Baru
            </label>
            <input
              type={showPass ? 'text' : 'password'}
              value={newPassphrase}
              onChange={(e) => setNewPassphrase(e.target.value)}
              required
              placeholder="Minimal 4 karakter / PIN..."
              className="w-full px-3 py-1.5 text-xs font-semibold bg-[#FAF9F6] border border-[#E4E2DD] rounded-xs focus:outline-none focus:border-[#F59E0B]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#111315] mb-1">
              Konfirmasi Sandi Baru
            </label>
            <input
              type={showPass ? 'text' : 'password'}
              value={confirmNewPassphrase}
              onChange={(e) => setConfirmNewPassphrase(e.target.value)}
              required
              placeholder="Ketik ulang sandi baru..."
              className="w-full px-3 py-1.5 text-xs font-semibold bg-[#FAF9F6] border border-[#E4E2DD] rounded-xs focus:outline-none focus:border-[#F59E0B]"
            />
          </div>

          <div className="flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={() => setShowPass((p) => !p)}
              className="text-neutral-500 hover:text-[#D97706] font-semibold cursor-pointer"
            >
              {showPass ? 'Sembunyikan Karakter' : 'Tampilkan Karakter'}
            </button>
          </div>

          {errorMsg && (
            <div className="p-2 bg-[#E11D48]/10 border border-[#E11D48]/40 rounded-xs text-xs text-[#9E2A2B] font-semibold">
              {errorMsg}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E4E2DD]">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-semibold text-neutral-500 hover:text-[#111315] cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="bb-btn-primary px-4 py-1.5 bg-[#D97706] hover:bg-[#B45309] text-white text-xs font-bold rounded-xs cursor-pointer disabled:opacity-50"
            >
              {isSaving ? 'Mengenkripsi Ulang...' : 'Simpan Sandi Baru'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
