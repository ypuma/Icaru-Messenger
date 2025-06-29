import React, { useState, useEffect } from "react";
import styles from "../RegisterForm/RegistrationScreen.module.scss";
import * as bip39 from "bip39";
import { deriveKeyPairFromMnemonic } from "../../../lib/crypto/account";
import { Buffer } from "buffer";

const API_BASE_URL = "http://79.255.198.124:3001";

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
          setError("Too many recovery attempts. Please try again later.");
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

  // Paste entire recovery phrase from clipboard
  const handlePaste = async () => {
    if (loading || rateLimited) return;

    try {
      const text = await navigator.clipboard.readText();
      if (!text) {
        setError("Clipboard is empty or unreadable.");
        return;
      }

      const words = text.trim().toLowerCase().split(/\s+/);

      if (words.length !== 12) {
        setError("Recovery phrase must contain exactly 12 words.");
        return;
      }

      if (!bip39.validateMnemonic(words.join(" "))) {
        setError("Invalid recovery phrase.");
        return;
      }

      setRecoveryWords(words);
      setError(null);
    } catch (err) {
      console.error("Failed to paste recovery phrase:", err);
      setError("Failed to read from clipboard. Please paste manually.");
    }
  };

  const validateWords = (): boolean => {
    if (recoveryWords.some((w) => !w)) {
      setError("Please fill in all 12 words.");
      return false;
    }
    const mnemonic = recoveryWords.join(" ");
    if (!bip39.validateMnemonic(mnemonic)) {
      setError("Invalid recovery phrase.");
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
        throw new Error(data.error || "Account not found");
      }
      const data = await res.json();

      onRecovered({
        handle: data.account.handle,
        privateKey: keyPair.privKey,
        publicKey: keyPair.pubKey,
      });
    } catch (e) {
      console.error("Recovery failed", e);
      setError(e instanceof Error ? e.message : "Recovery failed");
      recordAttempt(false);
    } finally {
      setLoading(false);
    }
  };

  const allWordsFilled = recoveryWords.every((w) => w);

  return (
    <div className={styles["registration-root"]}>
      <div className={styles["recovery-label"]}>Recovery Phrase eingeben</div>
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
          />
        ))}
      </div>
      <button
        className={styles["copy-btn"]}
        onClick={handlePaste}
        type="button"
        aria-label="Paste Recovery Phrase"
        style={{ marginTop: "1rem" }}
        disabled={loading || rateLimited}
      >
        PASTE
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
    </div>
  );
};

export default RecoveryScreen; 