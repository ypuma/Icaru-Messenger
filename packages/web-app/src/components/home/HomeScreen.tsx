import React from "react";
import { motion } from "framer-motion";
import styles from "./HomeScreen.module.scss";
import { useState, useEffect } from "react";

interface HomeScreenProps {
  handle: string;
  onContactSelect: (handle: string) => void;
  onAddContact: (handle: string) => Promise<void> | void;
  onLogout: () => void;
}

const HomeScreen: React.FC<HomeScreenProps> = ({ handle, onContactSelect, onAddContact, onLogout }) => {
  const [showPanel, setShowPanel] = useState(false);
  const [handleInput, setHandleInput] = useState("");
  const [contacts, setContacts] = useState<{handle:string}[]>([]);

  // Fetch contacts on mount
  useEffect(() => {
    const fetchContacts = async () => {
      try {
        const sessionData = localStorage.getItem('secmes_current_session');
        if (!sessionData) return;
        const { token } = JSON.parse(sessionData);
        const response = await fetch(`http://localhost:3001/api/contacts`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        if (!response.ok) return;
        const data = await response.json();
        setContacts(data.contacts || []);
      } catch (err) {
        console.error('Failed to fetch contacts', err);
      }
    };
    fetchContacts();
  }, []);

  const submitHandle = async () => {
    const trimmed = handleInput.trim().toUpperCase();
    if (!trimmed) return;

    try {
      // Await in case the parent function returns a promise
      await onAddContact(trimmed);

      // Optimistically update local contact list if it doesn't already include the handle
      setContacts((prev) => {
        if (prev.some((c) => c.handle === trimmed)) return prev;
        return [...prev, { handle: trimmed }];
      });

      // Reset input and close panel on success
      setHandleInput("");
      setShowPanel(false);
    } catch (err) {
      // Parent should already surface any error, but keep a fallback here
      console.error('Failed to add contact:', err);
    }
  };

  return (
    <div className={styles["home-root"]}>
      {/* Header bar */}
      <header className={styles.headerBar}>
        <h1 className={styles.brand}>Icaru</h1>
        <div className={styles.handleBadge}>@{handle}</div>
        <button
          type="button"
          onClick={onLogout}
          aria-label="Logout"
          className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-lg shadow transition-transform active:scale-95 focus:outline-none focus:ring-2 focus:ring-red-400"
        >
          Logout
        </button>
      </header>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className={`${styles.card} w-full max-w-xs`}
      >
        {/* Contacts list */}
        <h2 className="text-white font-semibold mb-2 self-start">Contacts</h2>
        <div className="w-full max-h-60 overflow-y-auto flex flex-col gap-2">
          {contacts.length === 0 ? (
            <p className="text-gray-400 text-sm text-center w-full">No contacts yet</p>
          ) : (
            contacts.map((c:any) => (
              <div
                key={c.handle}
                className="w-full px-3 py-2 bg-white/90 rounded-lg text-black font-medium cursor-pointer hover:bg-white"
                onClick={() => onContactSelect(c.handle)}
              >
                @{c.handle}
              </div>
            ))
          )}
        </div>
      </motion.div>

      {/* Floating Action Button */}
      <div
        className={styles.fab}
        onClick={() => setShowPanel(!showPanel)}
        role="button"
        tabIndex={0}
      >
      
      <svg viewBox="0 0 100 100" className={styles.plus}>
            <line x1="32.5" y1="50" x2="67.5" y2="50" ></line>
            <line x1="50" y1="32.5" x2="50" y2="67.5"></line>
          </svg> 
      </div>

      {showPanel && (
        <div className={styles.inputPanel}>
          <input
            type="text"
            placeholder="Enter handle"
            value={handleInput}
            onChange={(e) => setHandleInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitHandle();
            }}
            className={styles.inputField}
            autoFocus
          />
          <button
            type="button"
            onClick={submitHandle}
            className="w-full h-10 bg-white text-black font-semibold rounded-lg shadow-md hover:bg-gray-100 active:scale-95 transition-transform focus:outline-none focus:ring-2 focus:ring-gray-300"
          >
            Add
          </button>
        </div>
      )}
    </div>
  );
};

export default HomeScreen; 