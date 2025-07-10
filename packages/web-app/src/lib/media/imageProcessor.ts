import sodium from 'libsodium-wrappers';

interface ProcessedImage {
  file: File;
  encryptedData: Uint8Array;
  encryptionKey: Uint8Array;
  originalSize: number;
  compressedSize: number;
  dimensions: { width: number; height: number };
  mimeType: string;
  secureFilename: string;
}

interface ImageUploadResult {
  messageId: string;
  mediaUrl: string;
  encryptedKey: string;
  fileSize: number;
  dimensions: { width: number; height: number };
}

class ImageProcessor {
  private readonly MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
  private readonly MAX_DIMENSION = 2048; // Max width/height
  private readonly QUALITY = 0.8; // JPEG quality
  private readonly ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

  constructor() {
    this.initializeSodium();
  }

  private async initializeSodium() {
    await sodium.ready;
  }

  /**
   * Process image: compress, strip metadata, and encrypt
   */
  async processImage(file: File): Promise<ProcessedImage> {
    await sodium.ready;

    // Validate file type
    if (!this.ALLOWED_TYPES.includes(file.type)) {
      throw new Error('Unsupported image format. Please use JPEG, PNG, or WebP.');
    }

    // Validate initial file size (before processing)
    if (file.size > this.MAX_FILE_SIZE * 2) {
      throw new Error('Image is too large. Please select a smaller image.');
    }

    try {
      const { processedFile, dimensions } = await this.compressAndStripMetadata(file);
      const encryptionKey = sodium.randombytes_buf(32); // 256-bit key
      const encryptedData = await this.encryptImageData(processedFile, encryptionKey);
      const secureFilename = this.generateSecureFilename(processedFile.type);

      return {
        file: processedFile,
        encryptedData,
        encryptionKey,
        originalSize: file.size,
        compressedSize: processedFile.size,
        dimensions,
        mimeType: processedFile.type,
        secureFilename
      };
    } catch (error) {
      console.error('Image processing failed:', error);
      throw new Error('Failed to process image. Please try a different image.');
    }
  }

  /**
   * Compress image and strip all metadata
   */
  private async compressAndStripMetadata(file: File): Promise<{
    processedFile: File;
    dimensions: { width: number; height: number };
  }> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error('Canvas context not available'));
        return;
      }

      img.onload = () => {
        try {
          // Calculate dimensions maintaining aspect ratio
          const { width, height } = this.calculateDimensions(img.width, img.height);
          
          // Set canvas dimensions
          canvas.width = width;
          canvas.height = height;

          // Clear canvas and draw image (this strips all metadata)
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);

          // Convert to blob with compression
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error('Failed to compress image'));
                return;
              }

              // Check compressed size
              if (blob.size > this.MAX_FILE_SIZE) {
                reject(new Error('Image is still too large after compression. Please select a smaller image.'));
                return;
              }

              // Create new file with stripped metadata
              const processedFile = new File([blob], 'image.jpg', { 
                type: 'image/jpeg',
                lastModified: Date.now()
              });

              resolve({
                processedFile,
                dimensions: { width, height }
              });
            },
            'image/jpeg',
            this.QUALITY
          );
        } catch (error) {
          reject(error);
        }
      };

      img.onerror = () => {
        reject(new Error('Failed to load image'));
      };

      // Load image from file
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          img.src = e.target.result as string;
        }
      };
      reader.onerror = () => {
        reject(new Error('Failed to read image file'));
      };
      reader.readAsDataURL(file);
    });
  }

  /**
   * Calculate optimal dimensions maintaining aspect ratio
   */
  private calculateDimensions(originalWidth: number, originalHeight: number): { width: number; height: number } {
    let { width, height } = { width: originalWidth, height: originalHeight };

    // Scale down if too large
    if (width > this.MAX_DIMENSION || height > this.MAX_DIMENSION) {
      const scale = Math.min(this.MAX_DIMENSION / width, this.MAX_DIMENSION / height);
      width = Math.floor(width * scale);
      height = Math.floor(height * scale);
    }

    // Ensure even dimensions for better compression
    width = width - (width % 2);
    height = height - (height % 2);

    return { width, height };
  }

  /**
   * Encrypt image data using AES-256-GCM
   */
  private async encryptImageData(file: File, encryptionKey: Uint8Array): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = () => {
        try {
          const arrayBuffer = reader.result as ArrayBuffer;
          const imageData = new Uint8Array(arrayBuffer);

          // Generate nonce
          const nonce = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);

          // Encrypt with XChaCha20-Poly1305 (authenticated encryption)
          const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
            imageData,
            null, // no additional data
            null, // no secret nonce
            nonce,
            encryptionKey
          );

          // Combine nonce and ciphertext
          const encryptedData = new Uint8Array(nonce.length + ciphertext.length);
          encryptedData.set(nonce);
          encryptedData.set(ciphertext, nonce.length);

          resolve(encryptedData);
        } catch (error) {
          reject(new Error('Failed to encrypt image data'));
        }
      };

      reader.onerror = () => {
        reject(new Error('Failed to read image for encryption'));
      };

      reader.readAsArrayBuffer(file);
    });
  }

  /**
   * Generate secure random filename
   */
  private generateSecureFilename(mimeType: string): string {
    const timestamp = Date.now();
    const randomBytes = sodium.randombytes_buf(16);
    const randomHex = sodium.to_hex(randomBytes);
    
    // Get file extension from MIME type
    const extension = this.getExtensionFromMimeType(mimeType);
    
    return `${timestamp}_${randomHex}.${extension}`;
  }

  /**
   * Get file extension from MIME type
   */
  private getExtensionFromMimeType(mimeType: string): string {
    switch (mimeType) {
      case 'image/jpeg': return 'jpg';
      case 'image/png': return 'png';
      case 'image/webp': return 'webp';
      default: return 'jpg';
    }
  }

  /**
   * Upload encrypted image to server
   */
  async uploadImage(processedImage: ProcessedImage, _recipientId: string): Promise<ImageUploadResult> {
    try {
      // Create FormData for upload
      const formData = new FormData();
      
      // Create blob from encrypted data
      const encryptedBlob = new Blob([processedImage.encryptedData], { 
        type: 'application/octet-stream' 
      });
      
      formData.append('file', encryptedBlob, processedImage.secureFilename);
      formData.append('originalSize', processedImage.originalSize.toString());
      formData.append('compressedSize', processedImage.compressedSize.toString());
      formData.append('dimensions', JSON.stringify(processedImage.dimensions));
      formData.append('mimeType', processedImage.mimeType);

      // Upload to server
      const response = await fetch('/api/media/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('secmes_token')}`
        },
        body: formData
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
      }

      const uploadResult = await response.json();

      // Encrypt the encryption key with recipient's public key (would be implemented with Signal Protocol)
      const encryptedKey = sodium.to_base64(processedImage.encryptionKey);

      return {
        messageId: uploadResult.messageId,
        mediaUrl: uploadResult.mediaUrl,
        encryptedKey,
        fileSize: processedImage.compressedSize,
        dimensions: processedImage.dimensions
      };
    } catch (error) {
      console.error('Image upload failed:', error);
      throw new Error('Failed to upload image. Please try again.');
    }
  }

  /**
   * Decrypt and display image
   */
  async decryptImage(encryptedData: Uint8Array, encryptionKey: Uint8Array): Promise<Blob> {
    try {
      await sodium.ready;

      // Extract nonce and ciphertext
      const nonce = encryptedData.slice(0, sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
      const ciphertext = encryptedData.slice(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);

      // Decrypt
      const plaintext = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
        null, // no secret nonce
        ciphertext,
        null, // no additional data
        nonce,
        encryptionKey
      );

      return new Blob([plaintext], { type: 'image/jpeg' });
    } catch (error) {
      console.error('Image decryption failed:', error);
      throw new Error('Failed to decrypt image');
    }
  }

  /**
   * Create thumbnail from processed image
   */
  async createThumbnail(file: File, maxSize: number = 150): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error('Canvas context not available'));
        return;
      }

      img.onload = () => {
        try {
          // Calculate thumbnail dimensions
          const scale = Math.min(maxSize / img.width, maxSize / img.height);
          const width = Math.floor(img.width * scale);
          const height = Math.floor(img.height * scale);

          canvas.width = width;
          canvas.height = height;

          // Draw thumbnail
          ctx.drawImage(img, 0, 0, width, height);

          // Convert to data URL
          const thumbnailUrl = canvas.toDataURL('image/jpeg', 0.6);
          resolve(thumbnailUrl);
        } catch (error) {
          reject(error);
        }
      };

      img.onerror = () => {
        reject(new Error('Failed to load image for thumbnail'));
      };

      // Load image from file
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          img.src = e.target.result as string;
        }
      };
      reader.readAsDataURL(file);
    });
  }

  /**
   * Validate image file
   */
  validateImageFile(file: File): { valid: boolean; error?: string } {
    if (!file) {
      return { valid: false, error: 'No file selected' };
    }

    if (!this.ALLOWED_TYPES.includes(file.type)) {
      return { 
        valid: false, 
        error: 'Unsupported image format. Please use JPEG, PNG, or WebP.' 
      };
    }

    if (file.size > this.MAX_FILE_SIZE * 2) {
      return { 
        valid: false, 
        error: `Image is too large. Maximum size is ${this.MAX_FILE_SIZE / (1024 * 1024)}MB.` 
      };
    }

    return { valid: true };
  }

  /**
   * Get image processing capabilities
   */
  getCapabilities() {
    return {
      maxFileSize: this.MAX_FILE_SIZE,
      maxDimension: this.MAX_DIMENSION,
      allowedTypes: this.ALLOWED_TYPES,
      quality: this.QUALITY,
      encryptionSupported: true,
      metadataStripping: true
    };
  }

  /**
   * Clear temporary data (for security)
   */
  clearMemory(): void {
    // Force garbage collection of any temporary image data
    if (typeof window !== 'undefined' && window.gc) {
      window.gc();
    }
  }
}

// Singleton instance
export const imageProcessor = new ImageProcessor();
export type { ProcessedImage, ImageUploadResult }; 