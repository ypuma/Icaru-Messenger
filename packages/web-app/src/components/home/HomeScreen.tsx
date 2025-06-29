import React from "react";
import { motion } from "framer-motion";
import styles from "./HomeScreen.module.scss";
import { useState, useEffect } from "react";
import { updateContactNickname } from "../../lib/api/contactApi";

const BASE_URL = import.meta.env.VITE_API_URL || 'https://0.0.0.0:11401';

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
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isLogoutModalFadingOut, setIsLogoutModalFadingOut] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedContact, setExpandedContact] = useState<string | null>(null);

  // Fetch contacts on mount
  useEffect(() => {
    fetchContacts();
  }, []);



  const fetchContacts = async () => {
    try {
      const sessionData = localStorage.getItem('secmes_current_session');
      if (!sessionData) return;
      const { token } = JSON.parse(sessionData);
      const response = await fetch(`${BASE_URL}/api/contacts`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      if (!response.ok) return;
      const data = await response.json();
      setContacts(data.contacts || []);
    } catch (err) {
      console.error('Fehlgeschlagen, Kontakte zu laden', err);
    }
  };

  const submitHandle = async () => {
    const trimmed = handleInput.trim().toUpperCase();
    const trimmedNickname = nicknameInput.trim();
    if (!trimmed) return;

    // Validate handle length
    if (trimmed.length > 7) {
      setErrorMessage('Handle darf maximal 7 Zeichen lang sein.');
      return;
    }

    // Validate nickname length
    if (trimmedNickname.length > 30) {
      setErrorMessage('Nickname darf maximal 30 Zeichen lang sein.');
      return;
    }

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
      const errorMsg = (err as Error).message || 'Fehlgeschlagen, Kontakt hinzuzufügen';
      setErrorMessage(errorMsg);
      console.error('Fehlgeschlagen, Kontakt hinzuzufügen:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const startEditingNickname = (contact: Contact) => {
    setEditingNickname(contact.id);
    setEditNicknameValue(contact.nickname || "");
  };

  const saveNickname = async (contact: Contact) => {
    const trimmedNickname = editNicknameValue.trim();
    
    // Validate nickname length
    if (trimmedNickname.length > 30) {
      alert('Nickname darf maximal 30 Zeichen lang sein.');
      return;
    }
    
    try {
      const sessionData = localStorage.getItem('secmes_current_session');
      if (!sessionData) return;
      const { token } = JSON.parse(sessionData);
      
      await updateContactNickname(contact.id, trimmedNickname, token);
      
      // Update local state
      setContacts(prev => prev.map(c => 
        c.id === contact.id 
          ? { ...c, nickname: trimmedNickname || undefined }
          : c
      ));
      
      setEditingNickname(null);
      setEditNicknameValue("");
    } catch (err) {
      console.error('Failed to update nickname:', err);
      alert('Fehlgeschlagen, Nickname zu aktualisieren. Bitte versuchen Sie es erneut.');
    }
  };

  const cancelEditingNickname = () => {
    setEditingNickname(null);
    setEditNicknameValue("");
  };

  const deleteContact = async (contact: Contact) => {
    if (!window.confirm(`Are you sure you want to delete ${getDisplayName(contact)}?`)) {
      return;
    }

    try {
      const sessionData = localStorage.getItem('secmes_current_session');
      if (!sessionData) return;
      const { token } = JSON.parse(sessionData);
      
      console.log('Deleting contact:', contact.id, 'with URL:', `${BASE_URL}/api/contacts/${contact.id}`);
      
      const response = await fetch(`${BASE_URL}/api/contacts/${contact.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log('Delete response status:', response.status);
      
      if (!response.ok) {
        const errorData = await response.text();
        console.error('Delete failed with status:', response.status, 'Response:', errorData);
        throw new Error(`Failed to delete contact: ${response.status} - ${errorData}`);
      }
      
      // Remove contact from local state
      setContacts(prev => prev.filter(c => c.id !== contact.id));
      console.log('Contact deleted successfully');
      
    } catch (err) {
      console.error('Failed to delete contact:', err);
      alert('Fehlgeschlagen, Kontakt zu löschen. Bitte versuchen Sie es erneut.');
    }
  };

  const getDisplayName = (contact: Contact) => {
    return contact.nickname || `${contact.handle}`;
  };

  const handleLogoutCancel = () => {
    setIsLogoutModalFadingOut(true);
    setTimeout(() => {
      setShowLogoutConfirm(false);
      setIsLogoutModalFadingOut(false);
    }, 200); // Match the animation duration
  };

  // Filter contacts based on search term
  const filteredContacts = contacts.filter(contact => {
    if (!searchTerm.trim()) return true;
    
    const searchLower = searchTerm.toLowerCase();
    const handle = contact.handle.toLowerCase();
    const nickname = contact.nickname?.toLowerCase() || '';
    
    return handle.includes(searchLower) || nickname.includes(searchLower);
  });

  // Handle contact expansion
  const handleContactMouseEnter = (contactId: string) => {
    setExpandedContact(contactId);
  };

  const handleContactMouseLeave = () => {
    setExpandedContact(null);
  };

  // Handle touch events for mobile
  const handleContactTouch = (e: React.TouchEvent, contactId: string) => {
    // Only handle if not touching on buttons
    if ((e.target as Element).closest('button')) {
      return;
    }
    
    e.preventDefault(); // Prevent default touch behavior
    
    if (expandedContact === contactId) {
      // Second touch - collapse
      setExpandedContact(null);
    } else {
      // First touch - expand
      setExpandedContact(contactId);
    }
  };

  return (
    <div className={styles["home-root"]}>
      {/* Header bar */}
      <header className={styles.headerBar}>
        <div className={styles.headerLeft}>
          <h1 className={styles.brand}>Icaru</h1>
        </div>
        <div className={styles.handleBadge}>{handle}</div>
        <div className={styles.headerRight}>
          <button
            type="button"
            onClick={() => setShowLogoutConfirm(true)}
            aria-label="Abmelden"
            className={styles.logoutHeader}
          >
            Abmelden
          </button>
        </div>
      </header>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className={styles.card}
      >
        {/* Contacts list */}
        <h2 className="text-white font-semibold mb-2 text-center">Kontakte</h2>
        
        {/* Search input */}
        <div className={styles.searchContainer}>
          <svg 
            className={styles.searchIcon}
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2" 
            strokeLinecap="round" 
            strokeLinejoin="round"
            viewBox="0 0 24 24"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="text"
            placeholder="Suche nach Handle oder Nickname..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={styles.searchInput}
          />
        </div>

        <div className="w-full max-h-60 overflow-y-auto flex flex-col items-center">
          {contacts.length === 0 ? (
            <p className="text-gray-400 text-sm text-center w-full">Keine Kontakte</p>
          ) : filteredContacts.length === 0 ? (
            <p className="text-gray-400 text-sm text-center w-full">Keine Kontakte gefunden</p>
          ) : (
            filteredContacts.map((contact) => (
              <div key={contact.id}>
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
                      placeholder={`${contact.handle}`}
                      maxLength={30}
                      autoFocus
                    />
                    <div className={styles.charCounter}>
                      {editNicknameValue.length}/30
                    </div>
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
                  <div 
                    className={`${styles.contactCard} ${expandedContact === contact.id ? styles.expanded : ''}`}
                    data-contact-id={contact.id}
                    onMouseEnter={() => handleContactMouseEnter(contact.id)}
                    onMouseLeave={handleContactMouseLeave}
                    onTouchStart={(e) => handleContactTouch(e, contact.id)}
                  >
                    <div 
                      onClick={() => onContactSelect(contact.handle)}
                      className={styles.contactInfo}
                    >
                      <div className={styles.contactNameRow}>
                        <div className={styles.contactName}>{getDisplayName(contact)}</div>
                        <div className={styles.iconContainer}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              startEditingNickname(contact);
                            }}
                            className={styles.editButton}
                            title="Nickname bearbeiten"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" stroke="black" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="feather feather-edit">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteContact(contact);
                            }}
                            className={styles.deleteButton}
                            title="Kontakt löschen"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="feather feather-trash-2">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                              <path d="M10 11v6" />
                              <path d="M14 11v6" />
                              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                            </svg>
                          </button>
                        </div>
                      </div>
                      {contact.nickname && (
                        <div className={styles.contactHandle}>{contact.handle}</div>
                      )}
                    </div>
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
            placeholder="Handle eingeben"
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
            maxLength={7}
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
            maxLength={30}
            disabled={isSubmitting}
          />
          <button
            type="button"
            onClick={submitHandle}
            disabled={isSubmitting}
            className="w-full h-10 bg-white text-black font-semibold rounded-lg shadow-md hover:bg-gray-100 active:scale-95 transition-transform focus:outline-none focus:ring-2 focus:ring-gray-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
          >
            {isSubmitting ? 'Hinzufügen...' : 'Hinzufügen'}
          </button>
        </div>
      )}

      {/* Logout Confirmation Modal */}
      {showLogoutConfirm && (
        <div className={`${styles.logoutModalBackdrop} ${isLogoutModalFadingOut ? styles.fadeOut : ''}`}>
          <div className={styles.logoutModalContent}>
            <h3>Abmelden bestätigen</h3>
            <p>Möchten Sie sich wirklich abmelden?</p>
            <div className={styles.logoutModalActions}>
              <button
                onClick={handleLogoutCancel}
                className={styles.logoutCancelButton}
              >
                Abbrechen
              </button>
              <button
                onClick={() => {
                  setShowLogoutConfirm(false);
                  onLogout();
                }}
                className={styles.logoutConfirmButton}
              >
                Abmelden
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HomeScreen; 