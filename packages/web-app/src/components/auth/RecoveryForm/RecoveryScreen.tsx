import React, { useState, useEffect } from "react";
import styles from "../RegisterForm/RegistrationScreen.module.scss";
import * as bip39 from "bip39";
import { deriveKeyPairFromMnemonic } from "../../../lib/crypto/account";
import { Buffer } from "buffer";

const API_BASE_URL = import.meta.env.VITE_API_URL || "https://0.0.0.0:11401";

interface RecoveryScreenProps {
  onBack: () => void;
  onRecovered: (userData: {
    handle: string;
    privateKey: string;
    publicKey: string;
  }) => void;
}

const RecoveryScreen: React.FC<RecoveryScreenProps> = ({ onBack, onRecovered }): React.ReactElement => {
  const [recoveryWords, setRecoveryWords] = useState<string[]>(Array(12).fill(""));
  const [toggleChecked, setToggleChecked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rateLimited, setRateLimited] = useState(false);
  const [pasting, setPasting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Rate-limit constants (client fallback)
  const MAX_ATTEMPTS_PER_HOUR = 3;
  const RATE_LIMIT_WINDOW = 60 * 60 * 1000;

  // Load attempts from localStorage
  useEffect(() => {
    const stored = localStorage.getItem("secmes_recovery_attempts");
    if (stored) {
      try {
        const attempts: number[] = JSON.parse(stored);
        const now = Date.now();
        const recent = attempts.filter((t) => now - t < RATE_LIMIT_WINDOW);
        if (recent.length >= MAX_ATTEMPTS_PER_HOUR) {
          setRateLimited(true);
          setError("Zu viele Wiederherstellungsversuche. Bitte versuchen Sie es später erneut.");
        }
      } catch {
        localStorage.removeItem("secmes_recovery_attempts");
      }
    }
  }, []);

  const recordAttempt = (success: boolean) => {
    const stored = localStorage.getItem("secmes_recovery_attempts");
    let attempts: number[] = [];
    if (stored) {
      try {
        attempts = JSON.parse(stored);
      } catch {
        attempts = [];
      }
    }
    if (!success) {
      attempts.push(Date.now());
      localStorage.setItem("secmes_recovery_attempts", JSON.stringify(attempts));
    }
  };

  const handleWordChange = (index: number, value: string) => {
    const words = [...recoveryWords];
    words[index] = value.toLowerCase().trim();
    setRecoveryWords(words);
    setError(null);
  };

  // Handle paste event on input fields
  const handleInputPaste = async (e: React.ClipboardEvent<HTMLInputElement>) => {
    if (loading || rateLimited) return;

    try {
      const pastedText = e.clipboardData.getData('text');
      if (!pastedText) return;

      const words = pastedText.trim().toLowerCase().split(/\s+/);

      // If it looks like a full recovery phrase (12 words), process it
      if (words.length === 12) {
        e.preventDefault(); // Prevent normal paste behavior
        
        if (!bip39.validateMnemonic(words.join(" "))) {
          setError("Ungültige Wiederherstellungsphrase.");
          return;
        }

        setRecoveryWords(words);
        setError(null);
      }
      // Otherwise, let normal paste behavior happen for single words
    } catch (err) {
      console.error("Fehlgeschlagen, Wiederherstellungsphrase automatisch einzufügen:", err);
      // Don't show error for failed auto-paste, let user try manual paste button
    }
  };

  // Paste entire recovery phrase from clipboard
  const handlePaste = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (loading || rateLimited || pasting) return;

    setPasting(true);
    try {
      const text = await navigator.clipboard.readText();
      if (!text) {
        setError("Keine Wiederherstellungsphrase in der Zwischenablage gefunden.");
        return;
      }

      const words = text.trim().toLowerCase().split(/\s+/);

      if (words.length !== 12) {
        setError("Wiederherstellungsphrase muss genau 12 Wörter enthalten.");
        return;
      }

      if (!bip39.validateMnemonic(words.join(" "))) {
        setError("Ungültige Wiederherstellungsphrase.");
        return;
      }

      setRecoveryWords(words);
      setError(null);
    } catch (err) {
      console.error("Fehlgeschlagen, Wiederherstellungsphrase einzufügen:", err);
      setError("Fehlgeschlagen, Wiederherstellungsphrase einzufügen. Stellen Sie sicher, dass Sie eine 12-Wort-Phrase kopiert haben.");
    } finally {
      setPasting(false);
    }
  };

  const validateWords = (): boolean => {
    if (recoveryWords.some((w) => !w)) {
      setError("Bitte füllen Sie alle 12 Wörter ein.");
      return false;
    }
    const mnemonic = recoveryWords.join(" ");
    if (!bip39.validateMnemonic(mnemonic)) {
      setError("Ungültige Wiederherstellungsphrase.");
      return false;
    }
    return true;
  };

  const handleToggle = () => setToggleChecked((v) => !v);

  const handleRecover = async () => {
    if (!toggleChecked) return;
    if (!validateWords()) return;

    setLoading(true);
    setError(null);

    try {
      const mnemonic = recoveryWords.join(" ");
      const keyPair = await deriveKeyPairFromMnemonic(mnemonic);
      const publicKeyBase64 = Buffer.from(keyPair.pubKey, "hex").toString("base64");

      // Look up account by public key
      const res = await fetch(`${API_BASE_URL}/api/auth/lookup-by-key`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicKey: publicKeyBase64 }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Konto nicht gefunden");
      }
      const data = await res.json();

      onRecovered({
        handle: data.account.handle,
        privateKey: keyPair.privKey,
        publicKey: keyPair.pubKey,
      });
    } catch (e) {
      console.error("Recovery failed", e);
      setError(e instanceof Error ? e.message : "Fehlgeschlagen, Konto wiederherzustellen");
      recordAttempt(false);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!validateWords()) return;

    setDeleting(true);
    setError(null);

    try {
      const mnemonic = recoveryWords.join(" ");
      const keyPair = await deriveKeyPairFromMnemonic(mnemonic);
      const publicKeyBase64 = Buffer.from(keyPair.pubKey, "hex").toString("base64");

      // Delete account using recovery phrase
      const res = await fetch(`${API_BASE_URL}/api/auth/delete-with-recovery`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicKey: publicKeyBase64 }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Konto konnte nicht gelöscht werden");
      }

      const data = await res.json();
      alert(`Konto erfolgreich gelöscht: ${data.deletedHandle}`);
      
      // Clear form and go back
      setRecoveryWords(Array(12).fill(""));
      setToggleChecked(false);
      setShowDeleteConfirm(false);
      onBack();

    } catch (e) {
      console.error("Account deletion failed", e);
      setError(e instanceof Error ? e.message : "Fehlgeschlagen, Konto zu löschen");
    } finally {
      setDeleting(false);
    }
  };

  const allWordsFilled = recoveryWords.every((w) => w);

  return (
    <div className={styles["registration-root"]}>
      <div className={styles["recovery-label"]}>
        Wiederherstellungsphrase eingeben
        <div style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.5rem' }}>
          Tipp: Kopieren Sie Ihre 12-Wort-Phrase und drücken Sie Strg+V in einem beliebigen Feld
        </div>
      </div>
      <div className={styles["recovery-grid"]}>
        {recoveryWords.map((word, idx) => (
          <input
            key={idx}
            type="text"
            value={word}
            onChange={(e) => handleWordChange(idx, e.target.value)}
            className={styles["recovery-word"]}
            placeholder={`${idx + 1}`}
            disabled={loading || rateLimited}
            autoComplete="off"
            autoFocus={idx === 0}
            onPaste={handleInputPaste}
          />
        ))}
      </div>
      <button
        className={styles["copy-btn"]}
        onClick={handlePaste}
        type="button"
        style={{ 
          marginTop: "1rem",
          opacity: pasting ? 0.7 : 1,
          cursor: (loading || rateLimited || pasting) ? 'not-allowed' : 'pointer'
        }}
        disabled={loading || rateLimited || pasting}
      >
        {pasting ? 'FÜGE EIN...' : 'EINFÜGEN'}
      </button>
      {error && (
        <p className="text-red-500 text-center mb-4 max-w-xl mx-auto">{error}</p>
      )}
      <div className={styles["toggle-row"]}>
        <div
          className={
            styles["toggle-switch"] + (toggleChecked ? " " + styles["checked"] : "")
          }
          onClick={handleToggle}
          role="checkbox"
          aria-checked={toggleChecked}
          tabIndex={0}
        >
          <div className={styles["toggle-knob"]} />
        </div>
        <span className={styles["toggle-label"]}>Ich habe die Phrase korrekt eingegeben</span>
      </div>
      <button
        className={styles["fortfahren-btn"]}
        disabled={!toggleChecked || !allWordsFilled || loading || rateLimited}
        onClick={handleRecover}
      >
        {loading ? "Wird überprüft..." : "Wiederherstellen"}
      </button>
      <button className={styles["back-btn"]} onClick={onBack} type="button">
        Zurück
      </button>

      {/* Fixed Delete Button - Bottom Right */}
      <button 
        onClick={() => setShowDeleteConfirm(true)}
        disabled={!allWordsFilled || loading || rateLimited || deleting}
        style={{
          position: 'fixed',
          bottom: '2rem',
          right: '2rem',
          background: 'rgba(220, 38, 38, 0.1)',
          border: '2px solid #dc2626',
          color: '#dc2626',
          padding: '0.75rem 1.5rem',
          borderRadius: '1rem',
          fontSize: '0.875rem',
          fontWeight: 600,
          cursor: !allWordsFilled || loading || rateLimited || deleting ? 'not-allowed' : 'pointer',
          opacity: !allWordsFilled || loading || rateLimited || deleting ? 0.4 : 1,
          transition: 'all 0.3s ease',
          zIndex: 1000,
          backdropFilter: 'blur(8px)',
          boxShadow: '0 4px 12px rgba(220, 38, 38, 0.2)'
        }}
        onMouseEnter={(e) => {
          if (!(!allWordsFilled || loading || rateLimited || deleting)) {
            e.currentTarget.style.background = '#dc2626';
            e.currentTarget.style.color = 'white';
            e.currentTarget.style.transform = 'scale(1.05)';
            e.currentTarget.style.boxShadow = '0 6px 16px rgba(220, 38, 38, 0.4)';
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(220, 38, 38, 0.1)';
          e.currentTarget.style.color = '#dc2626';
          e.currentTarget.style.transform = 'scale(1)';
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(220, 38, 38, 0.2)';
        }}
        title="Konto unwiderruflich löschen"
      >
        Konto löschen
      </button>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: '#1f1f1f',
            border: '1px solid #333',
            borderRadius: '0.75rem',
            padding: '1.5rem',
            maxWidth: '20rem',
            width: '90%',
            color: '#ffffff'
          }}>
            <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.25rem', fontWeight: 600, color: '#dc2626' }}>
              Konto löschen
            </h3>
            <p style={{ margin: '0 0 1.5rem 0', color: '#cccccc', lineHeight: 1.5 }}>
              Sind Sie sicher, dass Sie Ihr Konto unwiderruflich löschen möchten? 
              Diese Aktion kann nicht rückgängig gemacht werden.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                style={{
                  padding: '0.5rem 1rem',
                  background: 'transparent',
                  border: '1px solid #555',
                  color: '#ffffff',
                  borderRadius: '0.5rem',
                  cursor: deleting ? 'not-allowed' : 'pointer',
                  opacity: deleting ? 0.5 : 1
                }}
              >
                Abbrechen
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleting}
                style={{
                  padding: '0.5rem 1rem',
                  background: '#dc2626',
                  border: '1px solid #dc2626',
                  color: '#ffffff',
                  borderRadius: '0.5rem',
                  cursor: deleting ? 'not-allowed' : 'pointer',
                  opacity: deleting ? 0.5 : 1
                }}
              >
                {deleting ? 'Löschen...' : 'Konto löschen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RecoveryScreen; 