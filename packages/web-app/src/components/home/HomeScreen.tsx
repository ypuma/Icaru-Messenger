import React from "react";
import { motion } from "framer-motion";
import styles from "./HomeScreen.module.scss";
import { useState, useEffect } from "react";
import { updateContactNickname } from "../../lib/api/contactApi";

interface Contact {
  id: string;
  handle: string;
  nickname?: string;
  publicKey: string;
  isVerified: boolean;
  isBlocked: boolean;
  addedAt: string;
}

interface HomeScreenProps {
  handle: string;
  onContactSelect: (handle: string) => void;
  onAddContact: (handle: string, nickname?: string) => Promise<void> | void;
  onLogout: () => void;
}

const HomeScreen: React.FC<HomeScreenProps> = ({ handle, onContactSelect, onAddContact, onLogout }) => {
  const [showPanel, setShowPanel] = useState(false);
  const [handleInput, setHandleInput] = useState("");
  const [nicknameInput, setNicknameInput] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [editingNickname, setEditingNickname] = useState<string | null>(null);
  const [editNicknameValue, setEditNicknameValue] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fetch contacts on mount
  useEffect(() => {
    fetchContacts();
  }, []);

  const fetchContacts = async () => {
    try {
      const sessionData = localStorage.getItem('secmes_current_session');
      if (!sessionData) return;
      const { token } = JSON.parse(sessionData);
      const response = await fetch(`http://0.0.0.0:11401/api/contacts`, {
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

  const submitHandle = async () => {
    const trimmed = handleInput.trim().toUpperCase();
    const trimmedNickname = nicknameInput.trim();
    if (!trimmed) return;

    // Clear any previous error messages
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      // Wait for the API call to complete
      await onAddContact(trimmed, trimmedNickname || undefined);

      // Refresh contacts list from server instead of optimistic update
      await fetchContacts();

      // Reset input and close panel on success
      setHandleInput("");
      setNicknameInput("");
      setShowPanel(false);

    } catch (err) {
      // Show user-friendly error message
      const errorMsg = (err as Error).message || 'Failed to add contact';
      setErrorMessage(errorMsg);
      console.error('Failed to add contact:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const startEditingNickname = (contact: Contact) => {
    setEditingNickname(contact.id);
    setEditNicknameValue(contact.nickname || "");
  };

  const saveNickname = async (contact: Contact) => {
    try {
      const sessionData = localStorage.getItem('secmes_current_session');
      if (!sessionData) return;
      const { token } = JSON.parse(sessionData);
      
      await updateContactNickname(contact.id, editNicknameValue.trim(), token);
      
      // Update local state
      setContacts(prev => prev.map(c => 
        c.id === contact.id 
          ? { ...c, nickname: editNicknameValue.trim() || undefined }
          : c
      ));
      
      setEditingNickname(null);
      setEditNicknameValue("");
    } catch (err) {
      console.error('Failed to update nickname:', err);
      alert('Failed to update nickname');
    }
  };

  const cancelEditingNickname = () => {
    setEditingNickname(null);
    setEditNicknameValue("");
  };

  const getDisplayName = (contact: Contact) => {
    return contact.nickname || `@${contact.handle}`;
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
            contacts.map((contact) => (
              <div key={contact.id} className="w-full">
                {editingNickname === contact.id ? (
                  <div className={styles.editingCard}>
                    <input
                      type="text"
                      value={editNicknameValue}
                      onChange={(e) => setEditNicknameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveNickname(contact);
                        if (e.key === 'Escape') cancelEditingNickname();
                      }}
                      className={styles.editInput}
                      placeholder={`@${contact.handle}`}
                      autoFocus
                    />
                    <div className={styles.editActions}>
                      <button
                        onClick={() => saveNickname(contact)}
                        className={`${styles.editActionButton} ${styles.save}`}
                      >
                        Save
                      </button>
                      <button
                        onClick={cancelEditingNickname}
                        className={`${styles.editActionButton} ${styles.cancel}`}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className={styles.contactCard}>
                    <div 
                      onClick={() => onContactSelect(contact.handle)}
                      className={styles.contactInfo}
                    >
                      <div className={styles.contactName}>{getDisplayName(contact)}</div>
                      {contact.nickname && (
                        <div className={styles.contactHandle}>@{contact.handle}</div>
                      )}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        startEditingNickname(contact);
                      }}
                      className={styles.editButton}
                      title="Edit nickname"
                    >
                      ✏️
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </motion.div>

      {/* Floating Action Button */}
      <div
        className={styles.fab}
        onClick={() => {
          setShowPanel(!showPanel);
          // Clear error when closing panel
          if (showPanel && errorMessage) {
            setErrorMessage(null);
          }
        }}
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
          {errorMessage && (
            <div className={styles.errorMessage}>
              {errorMessage}
            </div>
          )}
          <input
            type="text"
            placeholder="Enter handle"
            value={handleInput}
            onChange={(e) => {
              setHandleInput(e.target.value);
              // Clear error when user starts typing
              if (errorMessage) setErrorMessage(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !isSubmitting) submitHandle();
            }}
            className={styles.inputField}
            autoFocus
            disabled={isSubmitting}
          />
          <input
            type="text"
            placeholder="Nickname (optional)"
            value={nicknameInput}
            onChange={(e) => {
              setNicknameInput(e.target.value);
              // Clear error when user starts typing
              if (errorMessage) setErrorMessage(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !isSubmitting) submitHandle();
            }}
            className={styles.inputField}
            disabled={isSubmitting}
          />
          <button
            type="button"
            onClick={submitHandle}
            disabled={isSubmitting}
            className="w-full h-10 bg-white text-black font-semibold rounded-lg shadow-md hover:bg-gray-100 active:scale-95 transition-transform focus:outline-none focus:ring-2 focus:ring-gray-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
          >
            {isSubmitting ? 'Adding...' : 'Add'}
          </button>
        </div>
      )}
    </div>
  );
};

export default HomeScreen; 