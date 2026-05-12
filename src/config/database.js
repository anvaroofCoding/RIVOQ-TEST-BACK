import mongoose from 'mongoose';
import MongoStore from 'connect-mongo';
import { config } from './index.js';

/** Mongoose ulanishi tayyor bo‘lgandan keyin — sessiya uchun alohida `MongoClient` ochilmaydi */
export function createMongoSessionStore() {
  const client = mongoose.connection.getClient();
  return MongoStore.create({
    client,
    dbName: mongoose.connection.name,
  });
}

function mongoHostFromUri(uri) {
  if (!uri || typeof uri !== 'string') return '(bo‘sh)';
  const trimmed = uri.trim();
  const raw = trimmed.replace(/^mongodb\+srv:\/\//i, '').replace(/^mongodb:\/\//i, '');
  const at = raw.lastIndexOf('@');
  const hostPort = (at >= 0 ? raw.slice(at + 1) : raw).split('/')[0];
  return hostPort.split(':')[0] || '(host topilmadi)';
}

export const connectDB = async () => {
  try {
    if (
      config.node_env === 'production' &&
      /localhost|127\.0\.0\.1/i.test(config.mongodb.uri || '')
    ) {
      console.warn('Mongo URI localhost — Render uchun Atlas/public URI kerak (MONGODB_URI).');
    }

    await mongoose.connect(config.mongodb.uri, config.mongodb.options);
    await mongoose.connection.db.admin().command({ ping: 1 });

    if (mongoose.connection.readyState !== 1) {
      throw new Error(`Mongo ulanmagan (readyState=${mongoose.connection.readyState})`);
    }

    console.log('✓ MongoDB connected');
  } catch (error) {
    const msg = error?.message || String(error);
    const host = mongoHostFromUri(config.mongodb.uri);
    console.error('MongoDB ulanmadi:', msg);
    console.error(`  URI host: ${host}`);
    if (/railway\.internal/i.test(config.mongodb.uri || '')) {
      console.error('  *.internal URI Renderdan ochilmaydi — public/mongo+srv URIni MONGODB_URI ga qo‘ying.');
    }
    throw error;
  }
};

export const disconnectDB = async () => {
  try {
    await mongoose.disconnect();
    console.log('✓ MongoDB disconnected');
  } catch (error) {
    console.error('MongoDB disconnect:', error.message);
  }
};
