export default () => ({
  storage: {
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
  },
});
