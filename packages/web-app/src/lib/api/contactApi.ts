const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://0.0.0.0:11401';

export const deleteContact = async (contactHandle: string, authToken: string): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/api/contacts/${encodeURIComponent(contactHandle)}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${authToken}`,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: 'Failed to delete contact and could not parse error response.' }));
    throw new Error(errorData.message || 'Failed to delete contact');
  }
};

export const addContact = async (contactHandle: string, authToken: string, nickname?: string): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/api/contacts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`,
    },
    body: JSON.stringify({ 
      contactHandle,
      nickname: nickname || undefined
    })
  });
  if (!response.ok) {
    const err = await response.json().catch(()=>({message:'Failed'}));
    throw new Error(err.message||'Failed to add contact');
  }
};

export const updateContactNickname = async (contactId: string, nickname: string, authToken: string): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/api/contacts`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`,
    },
    body: JSON.stringify({ 
      contactId,
      nickname
    })
  });
  if (!response.ok) {
    const err = await response.json().catch(()=>({message:'Failed'}));
    throw new Error(err.message||'Failed to update contact nickname');
  }
}; 