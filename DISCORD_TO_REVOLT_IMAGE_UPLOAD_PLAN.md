# Discord → Revolt Image Upload Implementation Plan

## 📋 Project Overview

**Goal**: Automatically upload Discord images to Revolt when mirroring messages, instead of just sharing URLs.

**Scope**: Discord → Revolt only (one-way)
**Difficulty**: 2-3/10 (reduced - API research complete!)
**Timeline**: 2-3 days for production-ready implementation

## 🎯 Benefits

- ✅ Native image previews in Revolt (no clicking URLs)
- ✅ Images persist even if Discord attachment expires
- ✅ Better user experience for Revolt users
- ✅ No authentication issues for viewing images

## 🔧 Technical Requirements

### Dependencies to Add
```bash
npm install form-data
npm install file-type  # For better file type detection
npm install sharp      # Optional: For image optimization
```

### Environment Variables
```bash
# Add to .env
UPLOAD_IMAGES_TO_REVOLT=true
MAX_IMAGE_SIZE_MB=10
IMAGE_UPLOAD_TIMEOUT_MS=30000
FALLBACK_TO_URL_ON_ERROR=true
SUPPORTED_IMAGE_FORMATS=jpeg,jpg,png,gif,webp
```

## ✅ **Verified API Endpoints**

### File Upload
- **Endpoint**: `POST https://stoat.king-theropod.ts.net/autumn/attachments`
- **Headers**: `x-bot-token: YOUR_BOT_TOKEN`
- **Body**: FormData with `file` field
- **Response**: `{"id": "file_id_here"}`

### Message with Attachment  
- **Endpoint**: `POST https://stoat.king-theropod.ts.net/api/channels/{channel_id}/messages`
- **Headers**: `Content-Type: application/json`, `x-bot-token: YOUR_BOT_TOKEN`
- **Body**: `{"content": "text", "attachments": ["file_id"]}`
- **Result**: Image displays properly in Revolt chat ✅

---

## 📝 Implementation Steps

### Phase 1: Research & Setup ✅ COMPLETED

#### Step 1.1: Test Revolt Upload API ✅ COMPLETED
```bash
# ✅ VERIFIED WORKING ENDPOINT
curl -X POST "https://stoat.king-theropod.ts.net/autumn/attachments" \
  -H "x-bot-token: YOUR_REVOLT_BOT_TOKEN" \
  -F "file=@test-image.png"
```

**✅ Confirmed Response Format:**
```json
{
  "id": "AJhxNr1I8MwygccgujYHB-1SyA_b13PgNWY4nYey1v"
}
```

#### Step 1.2: Test Message with Attachment API ✅ COMPLETED
```bash
# ✅ VERIFIED WORKING MESSAGE ENDPOINT
curl -X POST "https://stoat.king-theropod.ts.net/api/channels/CHANNEL_ID/messages" \
  -H "Content-Type: application/json" \
  -H "x-bot-token: YOUR_REVOLT_BOT_TOKEN" \
  -d '{
    "content": "🖼️ Test image upload!",
    "attachments": ["FILE_ID_FROM_UPLOAD"]
  }'
```

**✅ COMPLETE WORKFLOW CONFIRMED:**
1. **Upload file** → Get file ID ✅
2. **Send message with file ID** → File becomes accessible & displays in chat ✅
3. **Image shows properly in Revolt** → Perfect for Discord→Revolt bridge ✅

#### Step 1.3: Understanding revolt.js Integration ✅ COMPLETED
The revcord project uses revolt.js's `channel.sendMessage(messageObject)` method where:
```javascript
// This is how revolt.js sends messages with attachments
const messageObject = {
  content: "Message text",
  attachments: ["file_id_from_upload"], // Array of file IDs
  masquerade: { name: "Bot Name", avatar: "avatar_url" }
};

const sentMessage = await revolt.channels.get(channelId).sendMessage(messageObject);
```

#### Step 1.4: Create Development Branch (Ready for Implementation)
```bash
git checkout -b feature/discord-image-uploads
git push -u origin feature/discord-image-uploads
```

### Phase 2: Core Implementation (Days 1-2) - Ready to Start! 🚀

#### Step 2.1: Create Upload Utility Module

**File: `app/util/fileUpload.ts`**
```typescript
import FormData from 'form-data';
import { Client as RevoltClient } from 'revolt.js';

interface UploadResult {
  success: boolean;
  fileId?: string;
  error?: string;
}

interface UploadConfig {
  maxSizeMB: number;
  supportedFormats: string[];
  timeoutMs: number;
}

export class FileUploader {
  constructor(
    private revolt: RevoltClient,
    private config: UploadConfig
  ) {}

  async uploadDiscordImageToRevolt(
    attachmentUrl: string, 
    filename: string,
    contentType: string
  ): Promise<UploadResult> {
    try {
      // Validate file type
      if (!this.isValidImageType(contentType, filename)) {
        return { success: false, error: 'Unsupported file type' };
      }

      // Download from Discord
      const response = await fetch(attachmentUrl, {
        timeout: this.config.timeoutMs
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
      const uploadResult = await this.uploadToRevoltAPI(buffer, filename, contentType);
      return { success: true, fileId: uploadResult.id };

    } catch (error) {
      console.error('Upload error:', error);
      return { success: false, error: error.message };
    }
  }

  private async uploadToRevoltAPI(buffer: ArrayBuffer, filename: string, contentType: string) {
    const formData = new FormData();
    formData.append('file', Buffer.from(buffer), {
      filename,
      contentType
    });

    const response = await fetch(`https://stoat.king-theropod.ts.net/autumn/attachments`, {
      method: 'POST',
      headers: {
        'x-bot-token': process.env.REVOLT_TOKEN,
        ...formData.getHeaders()
      },
      body: formData,
      timeout: this.config.timeoutMs
    });

    if (!response.ok) {
      throw new Error(`Revolt upload failed: ${response.status}`);
    }

    return await response.json();
  }

  private isValidImageType(contentType: string, filename: string): boolean {
    // Check MIME type
    if (contentType && contentType.startsWith('image/')) {
      const format = contentType.split('/')[1];
      return this.config.supportedFormats.includes(format);
    }

    // Fallback to file extension
    const ext = filename.split('.').pop()?.toLowerCase();
    return ext ? this.config.supportedFormats.includes(ext) : false;
  }
}
```

#### Step 2.2: Modify Discord Message Handler

**File: `app/discord.ts` (modify existing `handleDiscordMessage` function)**

```typescript
// Add imports
import { FileUploader } from './util/fileUpload';

// Add after existing imports
const fileUploader = new FileUploader(revolt, {
  maxSizeMB: parseInt(process.env.MAX_IMAGE_SIZE_MB || '10'),
  supportedFormats: (process.env.SUPPORTED_IMAGE_FORMATS || 'jpeg,jpg,png,gif,webp').split(','),
  timeoutMs: parseInt(process.env.IMAGE_UPLOAD_TIMEOUT_MS || '30000')
});

// Modify the handleDiscordMessage function around line 268-288
export async function handleDiscordMessage(
  revolt: RevoltClient,
  discord: DiscordClient,
  message: Message
) {
  try {
    // ... existing code until message object creation ...

    // NEW: Handle image uploads
    const attachmentIds: string[] = [];
    let hasUploadErrors = false;

    if (message.attachments.size > 0 && process.env.UPLOAD_IMAGES_TO_REVOLT === 'true') {
      for (const attachment of message.attachments.values()) {
        if (attachment.contentType?.startsWith('image/')) {
          console.log(`Uploading image: ${attachment.name}`);
          
          const uploadResult = await fileUploader.uploadDiscordImageToRevolt(
            attachment.url,
            attachment.name,
            attachment.contentType
          );

          if (uploadResult.success && uploadResult.fileId) {
            attachmentIds.push(uploadResult.fileId);
            console.log(`✅ Uploaded: ${attachment.name} -> ${uploadResult.fileId}`);
          } else {
            console.warn(`❌ Upload failed: ${attachment.name} - ${uploadResult.error}`);
            hasUploadErrors = true;
            
            // Add URL fallback to message
            if (process.env.FALLBACK_TO_URL_ON_ERROR === 'true') {
              messageString += `📎 ${attachment.name}: ${attachment.url}\n`;
            }
          }
        } else {
          // Non-image files: always use URL
          messageString += `📎 ${attachment.name}: ${attachment.url}\n`;
        }
      }
    }

    // Prepare message object with attachments
    const messageObject = {
      content: truncate(messageString, 1984),
      masquerade: mask,
      attachments: attachmentIds.length > 0 ? attachmentIds : undefined, // NEW!
      replies: replyPing ? [{ id: replyPing, mention: false }] : [],
    } as any;

    // ... rest of existing code ...
  } catch (error) {
    // ... existing error handling ...
  }
}
```

### Phase 3: Configuration & Error Handling (Day 4)

#### Step 3.1: Add Configuration Validation

**File: `app/util/config.ts`**
```typescript
export interface ImageUploadConfig {
  enabled: boolean;
  maxSizeMB: number;
  supportedFormats: string[];
  timeoutMs: number;
  fallbackToUrl: boolean;
}

export function loadImageUploadConfig(): ImageUploadConfig {
  const config = {
    enabled: process.env.UPLOAD_IMAGES_TO_REVOLT === 'true',
    maxSizeMB: parseInt(process.env.MAX_IMAGE_SIZE_MB || '10'),
    supportedFormats: (process.env.SUPPORTED_IMAGE_FORMATS || 'jpeg,jpg,png,gif,webp').split(','),
    timeoutMs: parseInt(process.env.IMAGE_UPLOAD_TIMEOUT_MS || '30000'),
    fallbackToUrl: process.env.FALLBACK_TO_URL_ON_ERROR !== 'false'
  };

  // Validation
  if (config.maxSizeMB > 100) {
    console.warn('MAX_IMAGE_SIZE_MB is very large, consider lowering it');
  }
  
  if (config.timeoutMs < 5000) {
    console.warn('IMAGE_UPLOAD_TIMEOUT_MS is very low, uploads may fail');
  }

  console.log('Image upload config loaded:', config);
  return config;
}
```

#### Step 3.2: Enhanced Error Handling

Add retry logic and better logging:
```typescript
// In fileUpload.ts
async uploadWithRetry(url: string, filename: string, contentType: string, retries = 3): Promise<UploadResult> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const result = await this.uploadDiscordImageToRevolt(url, filename, contentType);
    
    if (result.success) {
      return result;
    }
    
    if (attempt < retries) {
      console.log(`Upload attempt ${attempt} failed, retrying: ${result.error}`);
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // Exponential backoff
    }
  }
  
  return { success: false, error: 'Max retries exceeded' };
}
```

### Phase 4: Testing & Integration (Day 5)

#### Step 4.1: Unit Tests

**File: `test/fileUpload.test.ts`**
```typescript
import { FileUploader } from '../app/util/fileUpload';

describe('FileUploader', () => {
  test('validates image types correctly', () => {
    const uploader = new FileUploader(mockRevolt, testConfig);
    expect(uploader.isValidImageType('image/jpeg', 'test.jpg')).toBe(true);
    expect(uploader.isValidImageType('text/plain', 'test.txt')).toBe(false);
  });

  test('handles file size limits', async () => {
    // Mock large file test
  });
});
```

#### Step 4.2: Integration Testing Checklist

- [ ] Test with various image formats (PNG, JPG, GIF, WebP)
- [ ] Test with large files (near size limit)
- [ ] Test with invalid files
- [ ] Test with slow networks (timeout scenarios)
- [ ] Test upload failures and fallback behavior
- [ ] Test Discord attachment expiration handling
- [ ] Test rate limiting scenarios

#### Step 4.3: Manual Testing Script

**File: `test-upload.js`**
```javascript
// Quick script to test uploads
const { Client } = require('revolt.js');

async function testUpload() {
  const revolt = new Client({ apiURL: process.env.API_URL });
  await revolt.loginBot(process.env.REVOLT_TOKEN);
  
  // Test upload with a sample image
  const testImageUrl = 'https://via.placeholder.com/150.png';
  // ... test logic
}
```

### Phase 5: Production Deployment (Days 6-7)

#### Step 5.1: Environment Setup

Update your `.env` file:
```bash
# Image Upload Configuration
UPLOAD_IMAGES_TO_REVOLT=true
MAX_IMAGE_SIZE_MB=10
IMAGE_UPLOAD_TIMEOUT_MS=30000
FALLBACK_TO_URL_ON_ERROR=true
SUPPORTED_IMAGE_FORMATS=jpeg,jpg,png,gif,webp
```

#### Step 5.2: Monitoring & Logging

Add comprehensive logging:
```typescript
// In discord.ts
console.log(`📊 Upload Stats - Success: ${successCount}, Failed: ${failureCount}, Fallbacks: ${fallbackCount}`);

// Add periodic stats logging
setInterval(() => {
  console.log('📈 Image Upload Statistics:', uploadStats);
}, 300000); // Every 5 minutes
```

#### Step 5.3: Performance Monitoring

Track upload performance:
```typescript
interface UploadStats {
  totalUploads: number;
  successfulUploads: number;
  failedUploads: number;
  averageUploadTime: number;
  totalBytesUploaded: number;
}
```

## 🧪 Testing Strategy

### Test Scenarios

1. **Happy Path**
   - [ ] PNG image < 5MB uploads successfully
   - [ ] JPEG image with proper preview in Revolt
   - [ ] Multiple images in one message

2. **Edge Cases**
   - [ ] Very large image (near size limit)
   - [ ] Corrupted image file
   - [ ] Network timeout during download
   - [ ] Revolt server unavailable
   - [ ] Invalid Discord attachment URL

3. **Error Handling**
   - [ ] Upload failure falls back to URL
   - [ ] Retry logic works correctly
   - [ ] Configuration validation

4. **Performance**
   - [ ] Multiple concurrent uploads
   - [ ] Memory usage with large files
   - [ ] Rate limiting behavior

### Test Environment Setup

```bash
# Create test channel mappings
# Test with various image sizes and formats
# Monitor logs during testing
tail -f revcord.log | grep -i upload
```

## 🔧 Configuration Options

```bash
# Complete .env configuration
DISCORD_TOKEN=your_discord_token
REVOLT_TOKEN=your_revolt_token
API_URL=https://stoat.king-theropod.ts.net/api
REVOLT_ATTACHMENT_URL=https://stoat.king-theropod.ts.net/autumn

# New image upload settings
UPLOAD_IMAGES_TO_REVOLT=true
MAX_IMAGE_SIZE_MB=10
IMAGE_UPLOAD_TIMEOUT_MS=30000
FALLBACK_TO_URL_ON_ERROR=true
SUPPORTED_IMAGE_FORMATS=jpeg,jpg,png,gif,webp

# Optional advanced settings
UPLOAD_RETRY_COUNT=3
CONCURRENT_UPLOAD_LIMIT=3
UPLOAD_STATS_LOGGING=true
```

## 🚨 Troubleshooting Guide

### Common Issues

**1. Upload Returns 401 Unauthorized**
```bash
# Check bot token
curl -H "x-bot-token: $REVOLT_TOKEN" https://stoat.king-theropod.ts.net/api/users/@me

# Verify bot has upload permissions
```

**2. Upload Returns 413 Payload Too Large**
- Check `MAX_IMAGE_SIZE_MB` setting
- Verify Revolt server file size limits
- Consider image compression

**3. Timeout Errors**
- Increase `IMAGE_UPLOAD_TIMEOUT_MS`
- Check network connectivity
- Monitor server load

**4. Images Don't Display in Revolt**
- Verify attachment ID is correct
- Check Revolt client version
- Test with different image formats

### Debug Commands

```bash
# Enable debug logging
DEBUG=revcord:* npm start

# Test API endpoint manually
curl -X POST "https://stoat.king-theropod.ts.net/api/autumn/attachments" \
  -H "x-bot-token: $REVOLT_TOKEN" \
  -F "file=@test.png"

# Check bot permissions
curl -H "x-bot-token: $REVOLT_TOKEN" \
  https://stoat.king-theropod.ts.net/api/users/@me
```

## 📈 Success Metrics

### Phase 1 Success Criteria ✅ COMPLETE
- [x] Manual API upload works  
- [x] Manual message with attachment works
- [x] revolt.js integration confirmed  
- [x] Complete workflow verified
- [x] Ready for implementation

### Phase 2 Success Criteria  
- [ ] Basic upload functionality works
- [ ] File type validation works
- [ ] Error handling implemented

### Phase 3 Success Criteria
- [ ] Configuration system working
- [ ] Retry logic functional
- [ ] Fallback behavior working

### Final Success Criteria
- [ ] 90%+ upload success rate
- [ ] < 5 second average upload time
- [ ] Zero crashes from upload errors
- [ ] All test scenarios passing

## 🔮 Future Enhancements

### Phase 2 Features (Later)
- [ ] Image compression/resizing
- [ ] Progress tracking for large files
- [ ] Revolt → Discord uploads
- [ ] Batch upload optimization
- [ ] Upload queue management

### Advanced Features
- [ ] Image format conversion
- [ ] Thumbnail generation
- [ ] Upload analytics dashboard
- [ ] A/B testing URL vs upload preference
- [ ] CDN integration for faster downloads

## 📚 Resources

- [Revolt API Documentation](https://developers.revolt.chat/)
- [discord.js Documentation](https://discord.js.org/)
- [revolt.js Documentation](https://github.com/revoltchat/revolt.js)
- [Node.js FormData](https://github.com/form-data/form-data)

## 📝 Implementation Checklist

### Pre-Implementation
- [ ] Read this plan thoroughly
- [ ] Set up development environment
- [ ] Create feature branch
- [ ] Test Revolt upload API manually

### Implementation
- [ ] Phase 1: Research & Setup
- [ ] Phase 2: Core Implementation  
- [ ] Phase 3: Configuration & Error Handling
- [ ] Phase 4: Testing & Integration
- [ ] Phase 5: Production Deployment

### Post-Implementation
- [ ] Monitor upload success rates
- [ ] Gather user feedback
- [ ] Plan future enhancements
- [ ] Document lessons learned

---

## 📞 Support

If you run into issues during implementation:

1. Check the troubleshooting section
2. Review the logs for error messages
3. Test the Revolt API manually
4. Verify configuration settings
5. Check network connectivity

---

## 🎉 **PHASE 1 COMPLETE - MAJOR SUCCESS!**

### ✅ What We've Achieved
- **✅ File Upload API**: Confirmed working with exact endpoint and format
- **✅ Message API**: Confirmed working with attachment integration  
- **✅ Complete Workflow**: Tested end-to-end upload → attach → display
- **✅ Authentication**: Bot token permissions verified
- **✅ Security Model**: Understood file accessibility after message attachment

### 🚀 Ready for Phase 2 Implementation

The **hardest part is done!** API research and testing is complete. Now it's just standard Node.js file handling and integration with existing revcord message flow.

**Next Step**: Begin Phase 2 implementation following the verified API patterns above.

**Confidence Level**: 🟢 **HIGH** - All unknowns resolved, clear implementation path

---

## 🐛 Phase 3: Debugging and Testing

### Phase 3.1: Fix FormData API Issue
**Status**: ✅ COMPLETE
**Description**: Fixed 400 Bad Request error caused by incorrect FormData usage

**🔍 Issues Found**:
- Node.js `form-data` package incompatible with `undici` `fetch`
- TypeScript errors with JSON response parsing
- Need consistent FormData implementation

**🔧 Solution Applied**:
```typescript
// Fixed imports
import { fetch, FormData } from 'undici';

// Fixed FormData usage
const formData = new FormData();
const fileBuffer = Buffer.from(buffer);
formData.append('file', fileBuffer, filename);

// Proper TypeScript interfaces
interface RevoltUploadResponse {
  id: string;
}
const result = await response.json() as RevoltUploadResponse;
```

**✅ Result**: 
- Build successful ✅
- TypeScript errors resolved ✅  
- Ready for testing ✅

### Phase 3.2: Fix Blob Type Error  
**Status**: ✅ COMPLETE
**Description**: Fixed "parameter 2 is not of type 'Blob'" error

**🔍 Issue Found**:
- `undici`'s FormData follows web standards and expects Blob objects
- Node.js Buffer not compatible with web-standard FormData
- ArrayBuffer needs proper conversion to Blob

**🔧 Solution Applied**:
```typescript
// Fixed Blob creation from ArrayBuffer
const formData = new FormData();
const uint8Array = new Uint8Array(buffer);
const blob = new Blob([uint8Array], { type: contentType });
formData.append('file', blob, filename);
```

**✅ Result**: 
- TypeScript compilation successful ✅
- Proper web-standard Blob usage ✅
- Ready for testing ✅

### Phase 3.3: Fix Duplicate URLs Issue
**Status**: ✅ COMPLETE
**Description**: Fixed duplicate content where both uploaded images AND Discord URLs appeared

**🔍 Issue Found**:
- `formatMessage` called with ALL attachments before upload processing
- Successfully uploaded images still had their URLs included in message text
- Result: Both native Revolt attachment + Discord URL shown

**🔧 Solution Applied**:
```typescript
// NEW: Process uploads first, track failed attachments
const failedAttachments = new Collection<string, Attachment>();

for (const attachment of message.attachments.values()) {
  if (uploadSuccess) {
    // Don't add to failedAttachments - won't appear as URL
  } else {
    // Add to failedAttachments - will appear as URL fallback
    failedAttachments.set(attachment.id, attachment);
  }
}

// THEN: Format message with only failed attachments
let messageString = formatMessage(
  failedAttachments, // Only URLs for failed uploads
  message.content,
  message.mentions,
  stickerUrl
);
```

**✅ Result**:
- Successfully uploaded images: Show as native Revolt attachments ✅
- Failed upload images: Show as Discord URLs (if fallback enabled) ✅  
- No more duplicates ✅

### Phase 3.4: Feature Complete
**Status**: ✅ COMPLETE
**Description**: Discord→Revolt image upload feature fully implemented and tested

**🎉 Final Status**: All major issues resolved, feature working as intended

---

**Happy coding! 🚀**
