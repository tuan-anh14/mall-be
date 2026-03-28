export default () => ({
  email: {
    host: (process.env.SMTP_HOST && !process.env.SMTP_HOST.includes('@')) 
      ? process.env.SMTP_HOST 
      : 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.EMAIL_USER || process.env.SMTP_USER || '',
    pass: process.env.EMAIL_PASSWORD || process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || `Shop MALL <${process.env.EMAIL_USER || process.env.SMTP_USER}>`,
  },
});
