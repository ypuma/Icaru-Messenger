import sodium from 'libsodium-wrappers';

/**
 * Encode a Uint8Array to URL-safe base64 without padding.
 */
export const toB64 = (bytes: Uint8Array): string => {
  return sodium.to_base64(bytes, sodium.base64_variants.URLSAFE_NO_PADDING);
};

/**
 * Decode a URL-safe base64 (no padding) string into a Uint8Array.
 */
export const fromB64 = (b64: string): Uint8Array => {
  return sodium.from_base64(b64, sodium.base64_variants.URLSAFE_NO_PADDING);
}; 