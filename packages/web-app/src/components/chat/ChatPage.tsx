import React, { useState, useEffect } from "react";
import styles from "./ChatPage.module.scss";
import ChatInterface from "./ChatInterface";
import { addContact } from "../../lib/api/contactApi";

interface Contact { id:string; handle:string; }

interface ChatPageProps { currentUser: {handle:string; sessionToken:string; sessionId:string; publicKey:string; privateKey:string;} }

const ChatPage: React.FC<ChatPageProps> = ({ currentUser }) => {
  const [active, setActive] = useState<string | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [adding, setAdding] = useState(false);
  const [newHandle, setNewHandle] = useState("");

  useEffect(() => {
    const fetchContacts = async () => {
      try {
        const res = await fetch('http://localhost:3001/api/contacts', {
          headers: { Authorization: `Bearer ${currentUser.sessionToken}` },
        });
        if (res.ok) {
          const data = await res.json();
          setContacts(data.contacts || []);
        }
      } catch (e) {
        console.error('Failed to fetch contacts', e);
      }
    };
    fetchContacts();
  }, [currentUser]);

  const handleAddContact = async () => {
    try {
      await addContact(newHandle, currentUser.sessionToken);
      setAdding(false);
      setNewHandle("");
      // refresh contacts
      const res = await fetch('http://localhost:3001/api/contacts', {
        headers: { Authorization: `Bearer ${currentUser.sessionToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setContacts(data.contacts || []);
      }
    } catch (e) {
      alert((e as Error).message);
    }
  };

  return (
    <div className={styles["chat-page"]}>
      <aside className={styles["contacts-panel"]}>
        {contacts.map((c) => (
          <div
            key={c.id}
            className={`${styles["contact-item"]} ${active === c.handle ? styles["active"] : ""}`}
            onClick={() => setActive(c.handle)}
          >
            {c.handle}
          </div>
        ))}
      </aside>
      <section className={styles["chat-area"]}>
        {active ? (
          <div className={styles["slide-in"]}>
            <ChatInterface currentUser={currentUser} />
          </div>
        ) : (
          <p style={{ margin: "auto", opacity: 0.6 }}>Select a contact to start chatting</p>
        )}
        <button className={styles["new-chat-btn"]} onClick={() => setAdding(true)}>+</button>
        {adding && (
          <div className={styles["add-contact-overlay"]}>
            <div className={styles["add-contact-box"]}>
              <input placeholder="Handle" value={newHandle} onChange={e => setNewHandle(e.target.value)} />
              <button onClick={handleAddContact}>Add</button>
              <button onClick={() => setAdding(false)}>Cancel</button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};

export default ChatPage; 