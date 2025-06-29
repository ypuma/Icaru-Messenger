import React from "react";
import styles from "./RegistrationScreen.module.scss";
import { 
  generateMnemonic, 
  deriveKeyPairFromMnemonic, 
  deriveHandleFromPublicKey 
} from "../../../lib/crypto/account";
import { Buffer } from 'buffer';

const BASE_URL = import.meta.env.VITE_API_URL || 'https://0.0.0.0:11401';

interface RegistrationScreenProps {
  onBack: () => void;
  onContinue: (userData: { handle: string; publicKey: string; privateKey: string; }) => void;
}

const RegistrationScreen: React.FC<RegistrationScreenProps> = ({ onBack, onContinue }) => {
  const [toggleChecked, setToggleChecked] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [isAnimating, setIsAnimating] = React.useState(false);
  
  // Account data state
  const [handle, setHandle] = React.useState<string>("");
  const [recoveryPhrase, setRecoveryPhrase] = React.useState<string>("");
  const [keyPair, setKeyPair] = React.useState<{pubKey: string; privKey: string} | null>(null);

  // Ref to prevent double generation due to StrictMode
  const generationInProgress = React.useRef(false);
  const hasGenerated = React.useRef(false);

  // Generate account data on component mount
  React.useEffect(() => {
    // Prevent double execution in StrictMode
    if (generationInProgress.current || hasGenerated.current) {
      console.log('Konto-Generierung übersprungen - bereits in Arbeit oder bereits abgeschlossen');
      return;
    }
    generateAccountData();
  }, []);

  const generateAccountData = async () => {
    // Double check to prevent race conditions
    if (generationInProgress.current || (hasGenerated.current && handle)) {
      console.log('Konto-Generierung verhindert - bereits in Arbeit oder bereits abgeschlossen');
      return;
    }

    generationInProgress.current = true;
    setLoading(true);
    setError(null);
    
    console.log('=== STARTING ACCOUNT GENERATION ===');
    
    try {
      // 1. Generate mnemonic
      const mnemonic = generateMnemonic();
      console.log('Generated mnemonic:', mnemonic);
      setRecoveryPhrase(mnemonic);

      // 2. Derive key pair from mnemonic
      const generatedKeyPair = await deriveKeyPairFromMnemonic(mnemonic);
      console.log('Generated key pair:', { pubKeyLength: generatedKeyPair.pubKey.length });
      setKeyPair(generatedKeyPair);

      // 3. Derive handle from public key
      const derivedHandle = deriveHandleFromPublicKey(generatedKeyPair.pubKey);
      console.log('Generated handle:', derivedHandle);
      setHandle(derivedHandle);
      
      hasGenerated.current = true;
      console.log('=== ACCOUNT GENERATION COMPLETE ===');
      
    } catch (err) {
      console.error('Fehlgeschlagen, Konto-Generierung:', err);
      setError(err instanceof Error ? err.message : 'Fehlgeschlagen, Konto-Generierung');
    } finally {
      setLoading(false);
      generationInProgress.current = false;
    }
  };

  const handleCopy = async () => {
    if (!recoveryPhrase) return;

    // Try modern Clipboard API first
    try {
      await navigator.clipboard.writeText(recoveryPhrase);
    } catch (err) {
      // Fallback for browsers/contexts where Clipboard API is unavailable
      try {
        const textarea = document.createElement("textarea");
        textarea.value = recoveryPhrase;
        textarea.style.position = "fixed"; // Prevent scrolling to bottom of page in MS Edge
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      } catch (fallbackErr) {
        console.error("Copy to clipboard failed:", fallbackErr);
        alert("Fehlgeschlagen, Wiederherstellungsphrase zu kopieren. Bitte kopieren Sie es manuell.");
        return;
      }
    }

    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleToggle = () => setToggleChecked((v) => !v);

  const handleRegenerate = async () => {
    // Start fade out animation
    setIsAnimating(true);
    setToggleChecked(false); // Reset the toggle since they need to confirm the new phrase
    
    // Wait for fade out animation to complete
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Reset flags and generate new account data
    hasGenerated.current = false;
    generationInProgress.current = false;
    await generateAccountData();
    
    // Wait a bit then fade back in
    await new Promise(resolve => setTimeout(resolve, 100));
    setIsAnimating(false);
  };

  const handleContinue = async () => {
    if (!toggleChecked || !keyPair || !handle) return;

    console.log('=== STARTING REGISTRATION ===');
    console.log('Using handle:', handle);
    console.log('Using public key (hex):', keyPair.pubKey);

    try {
      // Convert hex public key to base64 for backend compatibility
      const publicKeyBase64 = Buffer.from(keyPair.pubKey, 'hex').toString('base64');
      console.log('Public key (base64):', publicKeyBase64);
      
      const registrationData = { 
        handle: handle, 
        publicKey: publicKeyBase64 
      };
      
      console.log('Sending to backend:', registrationData);
      
      const res = await fetch(`${BASE_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(registrationData)
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Registration failed' }));
        throw new Error(err.message);
      }

      const data = await res.json();
      console.log('Backend response:', data);
      
      // Verify the handle matches what we sent
      if (data.handle && data.handle !== handle) {
        console.warn('Handle-Fehler! Gesendet:', handle, 'Empfangen:', data.handle);
      }
      
      // Use our original handle, not the backend response
      const finalHandle = handle; // Always use the handle we generated and displayed
      
      console.log('Final handle for continuation:', finalHandle);
      
      // Pass real account data to parent component
      onContinue({
        handle: finalHandle,
        publicKey: keyPair.pubKey,
        privateKey: keyPair.privKey
      });
      
      console.log('=== REGISTRATION COMPLETE ===');
    } catch (e) {
      console.error('Fehlgeschlagen, Registrierung:', e);
      alert((e as Error).message);
    }
  };

  // Show loading state while generating account data
  if (loading) {
    return (
      <div className={styles["registration-root"]}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p>Generating your secure account...</p>
        </div>
      </div>
    );
  }

  // Show error state if generation failed
  if (error) {
    return (
      <div className={styles["registration-root"]}>
        <div className="text-center">
          <p className="text-red-500 mb-4">{error}</p>
          <button 
            onClick={() => {
              // Reset flags when manually regenerating
              hasGenerated.current = false;
              generateAccountData();
            }} 
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
          >
            Erneut versuchen
          </button>
          <button className={styles["back-btn"]} onClick={onBack} type="button" aria-label="Zurück zum Start" style={{marginTop: '1.5rem'}}>
            Zurück
          </button>
        </div>
      </div>
    );
  }

  const recoveryWords = recoveryPhrase.split(' ');

  return (
    <div className={styles["registration-root"]}>
      <div className={styles["code-label"]}>Deine ID:</div>
      <div className={styles["code-badge"]}>
        <span
          style={{
            opacity: isAnimating ? 0 : 1,
            transform: isAnimating ? 'translateY(-10px)' : 'translateY(0)',
            transition: 'opacity 0.3s ease-in-out, transform 0.3s ease-in-out',
            display: 'inline-block'
          }}
        >
          {handle}
        </span>
      </div>
      <button 
        className={styles["copy-btn"]} 
        onClick={handleRegenerate} 
        type="button" 
        aria-label="Regenerate Handle and Recovery Phrase"
        style={{marginTop: '0.5rem', marginBottom: '1rem'}}
        disabled={loading || isAnimating}
      >
        {loading || isAnimating ? "GENERIERT..." : "REGENERIEREN"}
      </button>
      <div className={styles["recovery-label"]}>Ihre Wiederherstellungsphrase</div>
      <div className={styles["recovery-grid"]}>
        {recoveryWords.map((word, i) => (
          <div className={styles["recovery-word"]} key={i}>
            <span
              style={{
                opacity: isAnimating ? 0 : 1,
                transform: isAnimating ? 'translateY(-10px)' : 'translateY(0)',
                transition: 'opacity 0.3s ease-in-out, transform 0.3s ease-in-out',
                display: 'inline-block'
              }}
            >
              {word}
            </span>
          </div>
        ))}
      </div>
      <button className={styles["copy-btn"]} onClick={handleCopy} type="button" aria-label="Copy Recovery Phrase">
        {copied ? "KOPIERT" : "KOPIEREN"}
      </button>
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
        <span className={styles["toggle-label"]}>
          Ich habe meine Wiederherstellungsphrase gesichert
        </span>
      </div>
      <button
        className={styles["fortfahren-btn"]}
        type="button"
        disabled={!toggleChecked}
        onClick={handleContinue}
        aria-disabled={!toggleChecked}
      >
        Fortfahren
      </button>
      <button className={styles["back-btn"]} onClick={onBack} type="button" aria-label="Zurück zum Start" style={{marginTop: '1.5rem'}}>
        Zurück
      </button>
    </div>
  );
};

export default RegistrationScreen; 