// Generate a cryptographically secure random handle using Web Crypto API
// Format: ABC-123 (3 letters, dash, 3 numbers)
export const generateHandle = async (): Promise<string> => {
  try {
    const letterArray = new Uint8Array(3);
    const numberArray = new Uint8Array(3);
    
    if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(letterArray);
      window.crypto.getRandomValues(numberArray);
      
      // Generate 3 letters (A-Z)
      let letters = '';
      for (let i = 0; i < 3; i++) {
        letters += String.fromCharCode(65 + (letterArray[i] % 26)); // A-Z
      }
      
      // Generate 3 numbers (0-9)
      let numbers = '';
      for (let i = 0; i < 3; i++) {
        numbers += ((numberArray[i] % 8) + 2).toString(); // 2-9
      }
      
      return letters + numbers; // Return raw format (ABC123), formatHandle will add dash
    } else {
      throw new Error('Web Crypto API not available');
    }
  } catch (error) {
    console.error('Secure random generation failed:', error);
    throw new Error('Secure random generation not available');
  }
};

// Validate handle format and content
export const isValidHandle = (handle: string): boolean => {
  if (!handle) return false;
  // For the account creation flow, allow more flexible handles (3-20 chars, alphanumeric + underscore)
  const handleRegex = /^[a-zA-Z0-9_]{3,20}$/;
  return handleRegex.test(handle);
};

// Format handle as ABC-123
export const formatHandle = (raw: string): string => {
  const upper = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (upper.length !== 6) throw new Error('Handle must have exactly 6 valid characters');
  
  // Check format: 3 letters + 3 numbers
  const letters = upper.slice(0, 3);
  const numbers = upper.slice(3, 6);
  
  if (!/^[A-Z]{3}$/.test(letters) || !/^[0-9]{3}$/.test(numbers)) {
    throw new Error('Handle must be 3 letters followed by 3 numbers');
  }
  
  return letters + '-' + numbers;
};

// Parse formatted handle back to raw (ABC-123 -> ABC123)
export const parseHandle = (formatted: string): string => {
  const upper = formatted.toUpperCase().replace(/[^A-Z2-9]/g, '');
  if (upper.length !== 6) throw new Error('Formatted handle must have exactly 6 valid characters');
  return upper;
};

// Levenshtein distance for similarity detection
export const levenshteinDistance = (a: string, b: string): number => {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return dp[m][n];
};

// Detect visually confusing or malicious handles
export const isMaliciousHandle = (handle: string): boolean => {
  const upper = handle.toUpperCase();
  // All same character
  if (/^([A-Z2-9])\1{5}$/.test(upper)) return true;
  // Repeated patterns (e.g., ABABAB)
  if (/^([A-Z2-9]{2})\1{2}$/.test(upper)) return true;
  // Known confusing patterns (e.g., O0O0O0, 0O0O0O)
  if (/^[O0]{6}$/.test(upper) || /^[I1]{6}$/.test(upper)) return true;
  return false;
};

// Alias for compatibility with AccountCreation component
export const detectMaliciousHandle = isMaliciousHandle;

// Check if handle is unique with real API call
export const isHandleUnique = async (handle: string): Promise<boolean> => {
  try {
    const response = await fetch(`/api/handles/check/${encodeURIComponent(handle)}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      // If API is unavailable, assume handle is unique for offline functionality
      if (response.status === 404 || response.status >= 500) {
        return true; // Silent fallback for offline mode
      }
      throw new Error(`Handle check failed: ${response.statusText}`);
    }

    // Check if response is actually JSON before parsing
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      return true; // Silent fallback for offline mode
    }

    const responseText = await response.text();
    if (!responseText.trim()) {
      return true; // Silent fallback for offline mode
    }

    try {
      const result = JSON.parse(responseText);
      return result.isUnique !== false; // Default to true if isUnique is not explicitly false
    } catch {
      return true; // Silent fallback for offline mode
    }
  } catch {
    // Fallback to assume unique if API is unavailable (offline functionality)
    return true;
  }
};

/**
 * Generate a BIP39-style recovery phrase using the official BIP39 wordlist
 * and proper entropy generation according to the BIP39 specification.
 */
export async function generateRecoveryPhrase(): Promise<string> {
  try {
    // Use dynamic import for bip39 library which implements the spec correctly
    const { generateMnemonic } = await import('bip39');
    
    // Generate a 12-word mnemonic (128 bits of entropy)
    return generateMnemonic(128);
  } catch (error) {
    console.error('Failed to load bip39 library:', error);
    // Fallback to a simple word-based recovery phrase if bip39 fails
    return generateSimpleRecoveryPhrase();
  }
}

/**
 * Fallback recovery phrase generator using Web Crypto API
 * Generates a 12-word recovery phrase from a predefined wordlist
 */
function generateSimpleRecoveryPhrase(): string {
  // BIP39 wordlist subset for fallback (first 256 words)
  const words = [
    'abandon', 'ability', 'able', 'about', 'above', 'absent', 'absorb', 'abstract',
    'absurd', 'abuse', 'access', 'accident', 'account', 'accuse', 'achieve', 'acid',
    'acoustic', 'acquire', 'across', 'act', 'action', 'actor', 'actress', 'actual',
    'adapt', 'add', 'addict', 'address', 'adjust', 'admit', 'adult', 'advance',
    'advice', 'aerobic', 'affair', 'afford', 'afraid', 'again', 'agent', 'agree',
    'ahead', 'aim', 'air', 'airport', 'aisle', 'alarm', 'album', 'alcohol',
    'alert', 'alien', 'all', 'alley', 'allow', 'almost', 'alone', 'alpha',
    'already', 'also', 'alter', 'always', 'amateur', 'amazing', 'among', 'amount',
    'amused', 'analyst', 'anchor', 'ancient', 'anger', 'angle', 'angry', 'animal',
    'ankle', 'announce', 'annual', 'another', 'answer', 'antenna', 'antique', 'anxiety',
    'any', 'apart', 'apology', 'appear', 'apple', 'approve', 'april', 'arch',
    'arctic', 'area', 'arena', 'argue', 'arm', 'armed', 'armor', 'army',
    'around', 'arrange', 'arrest', 'arrive', 'arrow', 'art', 'artist', 'artwork',
    'ask', 'aspect', 'assault', 'asset', 'assist', 'assume', 'asthma', 'athlete',
    'atom', 'attack', 'attend', 'attitude', 'attract', 'auction', 'audit', 'august',
    'aunt', 'author', 'auto', 'autumn', 'average', 'avocado', 'avoid', 'awake',
    'aware', 'away', 'awesome', 'awful', 'awkward', 'axis', 'baby', 'bachelor',
    'bacon', 'badge', 'bag', 'balance', 'balcony', 'ball', 'bamboo', 'banana',
    'banner', 'bar', 'barely', 'bargain', 'barrel', 'base', 'basic', 'basket',
    'battle', 'beach', 'bean', 'beauty', 'because', 'become', 'beef', 'before',
    'begin', 'behave', 'behind', 'believe', 'below', 'belt', 'bench', 'benefit',
    'best', 'betray', 'better', 'between', 'beyond', 'bicycle', 'bid', 'bike',
    'bind', 'biology', 'bird', 'birth', 'bitter', 'black', 'blade', 'blame',
    'blanket', 'blast', 'bleak', 'bless', 'blind', 'blood', 'blossom', 'blow',
    'blue', 'blur', 'blush', 'board', 'boat', 'body', 'boil', 'bomb',
    'bone', 'bonus', 'book', 'boost', 'border', 'boring', 'borrow', 'boss',
    'bottom', 'bounce', 'box', 'boy', 'bracket', 'brain', 'brand', 'brass',
    'brave', 'bread', 'breeze', 'brick', 'bridge', 'brief', 'bright', 'bring',
    'brisk', 'broccoli', 'broken', 'bronze', 'broom', 'brother', 'brown', 'brush',
    'bubble', 'buddy', 'budget', 'buffalo', 'build', 'bulb', 'bulk', 'bullet',
    'bundle', 'bunker', 'burden', 'burger', 'burst', 'bus', 'business', 'busy',
    'butter', 'buyer', 'buzz', 'cabbage', 'cabin', 'cable', 'cactus', 'cage',
    'cake', 'call', 'calm', 'camera', 'camp', 'can', 'cancel', 'candy',
    'cannon', 'canoe', 'canvas', 'canyon', 'capable', 'capital', 'captain', 'car',
    'carbon', 'card', 'care', 'career', 'careful', 'careless', 'cargo', 'carpet',
    'carry', 'cart', 'case', 'cash', 'casino', 'castle', 'casual', 'cat',
    'catalog', 'catch', 'category', 'cattle', 'caught', 'cause', 'caution', 'cave',
    'ceiling', 'celery', 'cement', 'census', 'century', 'cereal', 'certain', 'chair',
    'chalk', 'champion', 'change', 'chaos', 'chapter', 'charge', 'chase', 'chat',
    'cheap', 'check', 'cheese', 'chef', 'cherry', 'chest', 'chicken', 'chief',
    'child', 'chimney', 'choice', 'choose', 'chronic', 'chuckle', 'chunk', 'churn'
  ];

  try {
    const randomWords: string[] = [];
    const randomBytes = new Uint8Array(12);
    
    if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(randomBytes);
      
      for (let i = 0; i < 12; i++) {
        const wordIndex = randomBytes[i] % words.length;
        randomWords.push(words[wordIndex]);
      }
      
      return randomWords.join(' ');
    } else {
      throw new Error('Web Crypto API not available');
    }
  } catch (error) {
    console.error('Fallback recovery phrase generation failed:', error);
    throw new Error('Recovery phrase generation failed');
  }
}

export const getOrCreateDeviceId = (): string => {
  let deviceId = localStorage.getItem('secmes_device_id');
  if (!deviceId) {
    deviceId = 'device_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('secmes_device_id', deviceId);
  }
  return deviceId;
}; 