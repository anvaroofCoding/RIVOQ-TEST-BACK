import mongoose from 'mongoose';
import { config } from './index.js';

/** Parol chiqarilmasin — faqat host (xato aniqlash uchun) */
function mongoHostFromUri(uri) {
  if (!uri || typeof uri !== 'string') return '(bo‘sh)';
  const trimmed = uri.trim();
  const raw = trimmed.replace(/^mongodb\+srv:\/\//i, '').replace(/^mongodb:\/\//i, '');
  const at = raw.lastIndexOf('@');
  const hostPort = (at >= 0 ? raw.slice(at + 1) : raw).split('/')[0];
  return hostPort.split(':')[0] || '(host topilmadi)';
}

function logMongoConnectionHints(message) {
  const host = mongoHostFromUri(config.mongodb.uri);
  console.error(`  Host (URI dan): ${host}`);

  const looksPlaceholder =
    /xxxxx|example\.mongodb|placeholder|your[_-]?cluster|cluster\.example/i.test(host) ||
    /xxxxx|YOUR_PASSWORD|yourpassword/i.test(config.mongodb.uri);

  if (looksPlaceholder) {
    console.error(
      '  → Ko‘rinib turibdiki, namunaviy (placeholder) hostname/URI ishlatilgan. MongoDB Atlas → Connect → Drivers dan haqiqiy string nusxalang (xxxxx bo‘lmasin).'
    );
  }

  if (/railway\.internal/i.test(host || '') || /railway\.internal/i.test(config.mongodb.uri || '')) {
    console.error(
      '  → Railway `*.internal` Mongo host faqat Railway konteynerlari ichida resolve bo‘ladi. Render uchun MongoDB Atlas `mongodb+srv://...@cluster….mongodb.net/...` yoki boshqa public URL yozing.'
    );
  }

  if (/ENOTFOUND|querySrv|getaddrinfo/i.test(message || '')) {
    console.error('  Tekshirish: Atlas hostname; Render’da MONGODB_URI; Network Access; maxfiy belgili parol uchun URL-encoding.');
  }
}

export const connectDB = async () => {
  try {
    await mongoose.connect(config.mongodb.uri, config.mongodb.options);
    console.log('✓ MongoDB connected successfully');
  } catch (error) {
    console.error('✗ MongoDB connection failed:', error.message);
    logMongoConnectionHints(error.message);
    process.exit(1);
  }
};

export const disconnectDB = async () => {
  try {
    await mongoose.disconnect();
    console.log('✓ MongoDB disconnected successfully');
  } catch (error) {
    console.error('✗ MongoDB disconnection failed:', error.message);
  }
};
