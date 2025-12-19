import npmlog from 'npmlog';

export interface ImageUploadConfig {
  enabled: boolean;
  maxSizeMB: number;
  supportedFormats: string[];
  timeoutMs: number;
  fallbackToUrl: boolean;
}

export interface EmojiSyncConfig {
  enabled: boolean;
  maxSizeMB: number;
  cacheExpiryDays: number;
  fallbackToLink: boolean;
}

export function loadImageUploadConfig(): ImageUploadConfig {
  const config: ImageUploadConfig = {
    enabled: process.env.UPLOAD_IMAGES_TO_REVOLT === 'true',
    maxSizeMB: parseInt(process.env.MAX_IMAGE_SIZE_MB || '10'),
    supportedFormats: (process.env.SUPPORTED_IMAGE_FORMATS || 'jpeg,jpg,png,gif,webp').split(','),
    timeoutMs: parseInt(process.env.IMAGE_UPLOAD_TIMEOUT_MS || '30000'),
    fallbackToUrl: process.env.FALLBACK_TO_URL_ON_ERROR !== 'false'
  };

  // Validation
  if (config.maxSizeMB > 100) {
    npmlog.warn('Config', 'MAX_IMAGE_SIZE_MB is very large, consider lowering it');
  }
  
  if (config.maxSizeMB < 1) {
    npmlog.warn('Config', 'MAX_IMAGE_SIZE_MB is very small, setting to 1MB minimum');
    config.maxSizeMB = 1;
  }
  
  if (config.timeoutMs < 5000) {
    npmlog.warn('Config', 'IMAGE_UPLOAD_TIMEOUT_MS is very low, uploads may fail');
  }

  if (config.enabled) {
    npmlog.info('Config', `Image upload enabled - Max: ${config.maxSizeMB}MB, Timeout: ${config.timeoutMs}ms`);
    npmlog.info('Config', `Supported formats: ${config.supportedFormats.join(', ')}`);
    npmlog.info('Config', `Fallback to URL: ${config.fallbackToUrl}`);
  } else {
    npmlog.info('Config', 'Image upload disabled - using URL fallback only');
  }

  return config;
}

export function loadEmojiSyncConfig(): EmojiSyncConfig {
  const config: EmojiSyncConfig = {
    enabled: process.env.SYNC_EMOJIS_TO_REVOLT !== 'false', // Enabled by default
    maxSizeMB: parseInt(process.env.MAX_EMOJI_SIZE_MB || '5'),
    cacheExpiryDays: parseInt(process.env.EMOJI_CACHE_EXPIRY_DAYS || '7'),
    fallbackToLink: process.env.EMOJI_FALLBACK_TO_LINK !== 'false' // Enabled by default
  };

  // Validation
  if (config.maxSizeMB > 20) {
    npmlog.warn('Config', 'MAX_EMOJI_SIZE_MB is very large, consider lowering it');
  }
  
  if (config.maxSizeMB < 1) {
    npmlog.warn('Config', 'MAX_EMOJI_SIZE_MB is very small, setting to 1MB minimum');
    config.maxSizeMB = 1;
  }
  
  if (config.cacheExpiryDays < 1) {
    npmlog.warn('Config', 'EMOJI_CACHE_EXPIRY_DAYS is too low, setting to 1 day minimum');
    config.cacheExpiryDays = 1;
  }

  if (config.enabled) {
    npmlog.info('Config', `Emoji sync enabled - Max: ${config.maxSizeMB}MB, Cache: ${config.cacheExpiryDays} days`);
    npmlog.info('Config', `Fallback to link: ${config.fallbackToLink}`);
  } else {
    npmlog.info('Config', 'Emoji sync disabled - using link format only');
  }

  return config;
}

// Environment variable validation
export function validateEnvironment(): boolean {
  const required = ['REVOLT_TOKEN', 'REVOLT_ATTACHMENT_URL'];
  const missing = required.filter(env => !process.env[env]);
  
  if (missing.length > 0) {
    npmlog.error('Config', `Missing required environment variables: ${missing.join(', ')}`);
    return false;
  }
  
  return true;
}
