import fs from 'fs';
import mongoose from 'mongoose';
import MongoStore from 'connect-mongo';
import { config } from './index.js';

function slog(msg) {
  try {
    fs.writeSync(2, `[RIVOQ] ${msg}\n`);
  } catch {
    // ignore
  }
}

/** Faqat `connectDB()` muvaffaqiyatli tugagach — bitta Mongo client (mongoose) session uchun ham ishlatiladi */
export function createMongoSessionStore() {
  const client = mongoose.connection.getClient();
  return MongoStore.create({
    client,
    dbName: mongoose.connection.name,
  });
}

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
  slog(`  Host (URI dan): ${host}`);

  const looksPlaceholder =
    /xxxxx|example\.mongodb|placeholder|your[_-]?cluster|cluster\.example/i.test(host) ||
    /xxxxx|YOUR_PASSWORD|yourpassword/i.test(config.mongodb.uri);

  if (looksPlaceholder) {
    slog(
      '  → Ko‘rinib turibdiki, namunaviy (placeholder) hostname/URI ishlatilgan. MongoDB Atlas → Connect → Drivers dan haqiqiy string nusxalang.'
    );
  }

  if (/railway\.internal/i.test(host || '') || /railway\.internal/i.test(config.mongodb.uri || '')) {
    slog(
      '  → Railway *.internal Mongo host Render’da ishlamaydi. Atlas mongodb+srv qo‘ying.'
    );
  }

  if (/ENOTFOUND|querySrv|getaddrinfo/i.test(message || '')) {
    slog("  Tekshirish: Atlas hostname; Render’da MONGODB_URI; Network Access ''0.0.0.0/0''; URL-encoded parol.");
  }
}

export const connectDB = async () => {
  try {
    const prod = config.node_env === 'production';
    const hostGuess = mongoHostFromUri(config.mongodb.uri);
    const localhostish =
      /localhost|127\.0\.0\.1/i.test(config.mongodb.uri || '') ||
      /^(localhost|127\.0\.0\.1)$/i.test(hostGuess);
    slog(
      prod && localhostish
        ? 'MongoDB: ulanish… (WARN: productionda localhost ko‘rinadi — Render’da MONGODB_URI = Atlas kerak)'
        : 'MongoDB: ulanish boshlandi…'
    );
    await mongoose.connect(config.mongodb.uri, config.mongodb.options);
    // Haqiqatan DB javob berayotganini tekshiramiz (faqat `connect` resolve yetarli emas deb hisoblangan chekka holatlar uchun)
    await mongoose.connection.db.admin().command({ ping: 1 });

    if (mongoose.connection.readyState !== 1) {
      throw new Error(`Mongo ulanmagan (readyState=${mongoose.connection.readyState})`);
    }

    slog('MongoDB: ulanish muvaffaq (ping OK)');
    console.log('✓ MongoDB connected successfully');
  } catch (error) {
    const msg = error?.message || String(error);
    fs.writeSync(2, `✗ MongoDB connection failed: ${msg}\n`);
    logMongoConnectionHints(msg);
    throw error;
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
