import type { UserAccount } from '@secure-messenger/shared';

const BASE_URL = import.meta.env.VITE_API_URL || 'https://0.0.0.0:11401';

export interface CreateAccountRequest {
  handle: string;
  publicKey: string;
  deviceId: string;
}

export interface CreateAccountResponse {
  success: boolean;
  accountId: string;
  handle: string;
  message: string;
}

export const userApi = {
  /**
   * Create a new user account
   */
  async createAccount(data: CreateAccountRequest): Promise<CreateAccountResponse> {
    const response = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to create account');
    }

    return response.json();
  },

  /**
   * Get user account by handle
   */
  async getAccount(handle: string): Promise<UserAccount | null> {
    const response = await fetch(`${BASE_URL}/api/auth/account/${handle}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to get account');
    }

    return response.json();
  },

  /**
   * Get current user account by handle (alias for getAccount)
   */
  async getCurrentUser(handle: string): Promise<UserAccount | null> {
    return this.getAccount(handle);
  },

  /**
   * Update account public key
   */
  async updatePublicKey(handle: string, publicKey: string): Promise<void> {
    const response = await fetch(`${BASE_URL}/api/auth/account/${handle}/public-key`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ publicKey }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to update public key');
    }
  },

  /**
   * Delete account (emergency killswitch)
   */
  async deleteAccount(handle: string, confirmationPhrase: string): Promise<void> {
    const response = await fetch(`${BASE_URL}/api/auth/account/${handle}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ confirmationPhrase }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to delete account');
    }
  }
}; 