/**
 * Atlas disk holati — kolleksiya hajmlari.
 * Ishga tushirish: npm run mongo:report
 */
import 'dotenv/config';
import mongoose from 'mongoose';

const uri = process.env.MONGODB_URI?.trim();
if (!uri) {
  console.error('MONGODB_URI .env da kerak');
  process.exit(1);
}

await mongoose.connect(uri);
const db = mongoose.connection.db;

const stats = await db.stats();
console.log('\n=== Database ===');
console.log('Name:', stats.db);
console.log('Data size (MB):', (stats.dataSize / 1024 / 1024).toFixed(2));
console.log('Storage size (MB):', (stats.storageSize / 1024 / 1024).toFixed(2));
console.log('Index size (MB):', (stats.indexSize / 1024 / 1024).toFixed(2));
console.log('Total (data+index) MB:', ((stats.dataSize + stats.indexSize) / 1024 / 1024).toFixed(2));

const cols = await db.listCollections().toArray();
const rows = [];
for (const c of cols) {
  const name = c.name;
  try {
    const s = await db.command({ collStats: name });
    rows.push({
      name,
      docs: s.count ?? 0,
      storageMB: ((s.storageSize ?? 0) / 1024 / 1024).toFixed(2),
      totalMB: ((s.size ?? 0) / 1024 / 1024).toFixed(2),
    });
  } catch {
    rows.push({ name, docs: '?', storageMB: '?', totalMB: '?' });
  }
}

rows.sort((a, b) => Number(b.storageMB) - Number(a.storageMB));
console.log('\n=== Collections (storage) ===');
console.table(rows);

await mongoose.disconnect();
console.log('\nM0 free tier ~512 MB. Mongo operatsiyalari uchun ~500 MB bo‘sh joy kerak.\n');
