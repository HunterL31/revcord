import FormData from 'form-data';
import { Client as RevoltClient } from 'revolt.js';
import npmlog from 'npmlog';

// Use global fetch (available in Node 18+)
declare const fetch: typeof globalThis.fetch;

interface UploadResult {
  success: boolean;
  fileId?: string;
  error?: string;
}

interface UploadConfig {
  maxSizeMB: number;
  supportedFormats: string[];
  timeoutMs: number;
  autumnUrl: string;
  botToken: string;
}

export class FileUploader {
  constructor(private config: UploadConfig) {}

  async uploadDiscordImageToRevolt(
    attachmentUrl: string, 
    filename: string,
    contentType?: string
  ): Promise<UploadResult> {
    try {
      // Validate file type
      if (!this.isValidImageType(contentType, filename)) {
        return { success: false, error: 'Unsupported file type' };
      }

      // Download from Discord
      npmlog.info('FileUpload', `Downloading image: ${filename}`);
      const response = await fetch(attachmentUrl, {
        signal: AbortSignal.timeout(this.config.timeoutMs)
      });
      
      if (!response.ok) {
        return { success: false, error: `Download failed: ${response.status}` };
      }

      const buffer = await response.arrayBuffer();
      
      // Check file size
      const sizeMB = buffer.byteLength / (1024 * 1024);
      if (sizeMB > this.config.maxSizeMB) {
        return { success: false, error: `File too large: ${sizeMB.toFixed(1)}MB` };
      }

      // Upload to Revolt
      npmlog.info('FileUpload', `Uploading to Revolt: ${filename} (${sizeMB.toFixed(1)}MB)`);
      const uploadResult = await this.uploadToRevoltAPI(buffer, filename, contentType || 'image/png');
      
      npmlog.info('FileUpload', `✅ Upload successful: ${filename} -> ${uploadResult.id}`);
      return { success: true, fileId: uploadResult.id };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      npmlog.error('FileUpload', `Upload failed for ${filename}: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  }

  private async uploadToRevoltAPI(buffer: ArrayBuffer, filename: string, contentType: string) {
    const formData = new FormData();
    formData.append('file', Buffer.from(buffer), {
      filename,
      contentType
    });

    const response = await fetch(`${this.config.autumnUrl}/attachments`, {
      method: 'POST',
      headers: {
        'x-bot-token': this.config.botToken,
        ...formData.getHeaders()
      },
      body: formData,
      signal: AbortSignal.timeout(this.config.timeoutMs)
    });

    if (!response.ok) {
      throw new Error(`Revolt upload failed: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    if (!result.id) {
      throw new Error('Upload response missing file ID');
    }

    return result;
  }

  private isValidImageType(contentType?: string, filename?: string): boolean {
    // Check MIME type first
    if (contentType && contentType.startsWith('image/')) {
      const format = contentType.split('/')[1];
      if (this.config.supportedFormats.includes(format)) {
        return true;
      }
    }

    // Fallback to file extension
    if (filename) {
      const ext = filename.split('.').pop()?.toLowerCase();
      return ext ? this.config.supportedFormats.includes(ext) : false;
    }

    return false;
  }

  async uploadWithRetry(
    attachmentUrl: string, 
    filename: string, 
    contentType?: string, 
    maxRetries = 3
  ): Promise<UploadResult> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const result = await this.uploadDiscordImageToRevolt(attachmentUrl, filename, contentType);
      
      if (result.success) {
        return result;
      }
      
      if (attempt < maxRetries) {
        const delay = 1000 * attempt; // Exponential backoff
        npmlog.warn('FileUpload', `Upload attempt ${attempt} failed, retrying in ${delay}ms: ${result.error}`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    return { success: false, error: 'Max retries exceeded' };
  }
}

// Factory function to create FileUploader with environment config
export function createFileUploader(): FileUploader {
  const config: UploadConfig = {
    maxSizeMB: parseInt(process.env.MAX_IMAGE_SIZE_MB || '10'),
    supportedFormats: (process.env.SUPPORTED_IMAGE_FORMATS || 'jpeg,jpg,png,gif,webp').split(','),
    timeoutMs: parseInt(process.env.IMAGE_UPLOAD_TIMEOUT_MS || '30000'),
    autumnUrl: process.env.REVOLT_ATTACHMENT_URL || 'https://stoat.king-theropod.ts.net/autumn',
    botToken: process.env.REVOLT_TOKEN || ''
  };

  // Validation
  if (!config.botToken) {
    throw new Error('REVOLT_TOKEN is required for file uploads');
  }

  return new FileUploader(config);
}
