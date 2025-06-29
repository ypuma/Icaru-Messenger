import React, { useState, useRef, useCallback } from 'react';
import { imageProcessor } from '../../../lib/media/imageProcessor';
import type { ProcessedImage } from '../../../lib/media/imageProcessor';

interface ImageUploadProps {
  onImageSelected: (processedImage: ProcessedImage) => void;
  onCancel: () => void;
  isUploading?: boolean;
  className?: string;
}

interface ProcessingStatus {
  stage: 'selecting' | 'processing' | 'complete' | 'error';
  progress: number;
  message: string;
  error?: string;
}

const ImageUpload: React.FC<ImageUploadProps> = ({
  onImageSelected,
  onCancel,
  isUploading = false,
  className = ''
}) => {
  const [processingStatus, setProcessingStatus] = useState<ProcessingStatus>({
    stage: 'selecting',
    progress: 0,
    message: 'Select an image to share'
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [processedImage, setProcessedImage] = useState<ProcessedImage | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /**
   * Handle file selection from input or drag & drop
   */
  const handleFileSelect = useCallback(async (file: File) => {
    setSelectedFile(file);
    setProcessingStatus({
      stage: 'processing',
      progress: 10,
      message: 'Validating image...'
    });

    try {
      // Validate file
      const validation = imageProcessor.validateImageFile(file);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      // Create preview URL
      const preview = URL.createObjectURL(file);
      setPreviewUrl(preview);

      setProcessingStatus({
        stage: 'processing',
        progress: 25,
        message: 'Compressing and securing image...'
      });

      // Process image (compress, strip metadata, encrypt)
      const processed = await imageProcessor.processImage(file);
      
      setProcessedImage(processed);
      setProcessingStatus({
        stage: 'complete',
        progress: 100,
        message: 'Image ready to send'
      });

    } catch (error) {
      console.error('Image processing failed:', error);
      setProcessingStatus({
        stage: 'error',
        progress: 0,
        message: 'Failed to process image',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }, []);

  /**
   * Handle file input change
   */
  const handleInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  }, [handleFileSelect]);

  /**
   * Handle drag and drop
   */
  const handleDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();

    const files = event.dataTransfer.files;
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  }, [handleFileSelect]);

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
  }, []);

  /**
   * Send the processed image
   */
  const handleSendImage = useCallback(() => {
    if (processedImage) {
      onImageSelected(processedImage);
    }
  }, [processedImage, onImageSelected]);

  /**
   * Reset component state
   */
  const handleReset = useCallback(() => {
    setSelectedFile(null);
    setProcessedImage(null);
    setProcessingStatus({
      stage: 'selecting',
      progress: 0,
      message: 'Select an image to share'
    });
    
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl('');
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    // Clear any temporary data
    imageProcessor.clearMemory();
  }, [previewUrl]);

  /**
   * Handle cancel
   */
  const handleCancel = useCallback(() => {
    handleReset();
    onCancel();
  }, [handleReset, onCancel]);

  /**
   * Format file size for display
   */
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div className={`fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 ${className}`}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">Share Image</h3>
            <button
              onClick={handleCancel}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              aria-label="Cancel"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {processingStatus.stage === 'selecting' && (
            <div
              className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-all duration-200"
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onClick={() => fileInputRef.current?.click()}
            >
              <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              
              <p className="text-gray-600 mb-2">Click to select or drag & drop an image</p>
              <p className="text-sm text-gray-500">
                JPEG, PNG, WebP • Max 2MB
                {selectedFile && ` • Selected: ${selectedFile.name}`}
              </p>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleInputChange}
                className="hidden"
              />
            </div>
          )}

          {processingStatus.stage === 'processing' && (
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              
              <p className="text-gray-600 mb-4">{processingStatus.message}</p>
              
              {/* Progress Bar */}
              <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${processingStatus.progress}%` }}
                ></div>
              </div>

              <div className="text-xs text-gray-500 space-y-1">
                <p>• Compressing image</p>
                <p>• Removing metadata (EXIF, location, etc.)</p>
                <p>• Encrypting for secure transmission</p>
              </div>
            </div>
          )}

          {processingStatus.stage === 'complete' && processedImage && (
            <div className="space-y-4">
              {/* Image Preview */}
              <div className="relative">
                <img
                  src={previewUrl}
                  alt="Preview"
                  className="w-full h-48 object-cover rounded-lg"
                />
                <div className="absolute top-2 right-2 bg-green-500 text-white px-2 py-1 rounded-full text-xs font-medium">
                  ✓ Secured
                </div>
              </div>

              {/* Image Information */}
              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Original size:</span>
                  <span className="font-medium">{formatFileSize(processedImage.originalSize)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Compressed:</span>
                  <span className="font-medium text-green-600">
                    {formatFileSize(processedImage.compressedSize)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Dimensions:</span>
                  <span className="font-medium">
                    {processedImage.dimensions.width} × {processedImage.dimensions.height}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Security:</span>
                  <span className="font-medium text-green-600">Encrypted</span>
                </div>
              </div>

              {/* Security Features */}
              <div className="text-xs text-gray-500 space-y-1">
                <p>✓ All metadata removed (location, device info, etc.)</p>
                <p>✓ End-to-end encrypted before upload</p>
                <p>✓ Secure random filename generated</p>
              </div>
            </div>
          )}

          {processingStatus.stage === 'error' && (
            <div className="text-center">
              <div className="bg-red-100 rounded-full w-12 h-12 flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              
              <p className="text-red-600 font-medium mb-2">{processingStatus.message}</p>
              {processingStatus.error && (
                <p className="text-sm text-red-500 mb-4">{processingStatus.error}</p>
              )}
              
              <button
                onClick={handleReset}
                className="text-blue-600 hover:text-blue-700 text-sm font-medium"
              >
                Try again
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        {processingStatus.stage === 'complete' && (
          <div className="px-6 py-4 border-t border-gray-200 flex space-x-3">
            <button
              onClick={handleReset}
              className="flex-1 py-2 px-4 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Choose Different
            </button>
            <button
              onClick={handleSendImage}
              disabled={isUploading}
              className="flex-1 py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isUploading ? 'Sending...' : 'Send Image'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ImageUpload; 