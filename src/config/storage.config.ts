export default () => ({
  storage: {
    provider: process.env.CLOUDINARY_CLOUD_NAME ? 'cloudinary' : 'local',
    maxFileSize:
      parseInt(process.env.MAX_FILE_SIZE_MB || '10', 10) * 1024 * 1024 ||
      10 * 1024 * 1024, // 10MB
    allowedMimeTypes: [
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/pdf',
    ],
    local: {
      path: process.env.LOCAL_STORAGE_PATH || './uploads',
    },
    cloudinary: {
      cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
      apiKey: process.env.CLOUDINARY_API_KEY || '',
      apiSecret: process.env.CLOUDINARY_API_SECRET || '',
      folder: process.env.CLOUDINARY_FOLDER || 'shopmall',
    },
  },
});
