const API_BASE_URL = 'http://localhost:3001';

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

export const addContact = async (contactHandle: string, authToken: string): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/api/contacts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`,
    },
    body: JSON.stringify({ contactHandle })
  });
  if (!response.ok) {
    const err = await response.json().catch(()=>({message:'Failed'}));
    throw new Error(err.message||'Failed to add contact');
  }
}; 