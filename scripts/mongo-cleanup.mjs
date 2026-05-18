/**
 * Eski test sessiyalari va HTTP sessiyalarni o‘chirish (Atlas disk bo‘shatish).
 * Ishga tushirish: npm run mongo:cleanup
 * Muhit: KEEP_DAYS=30 (default 90)
 */
import 'dotenv/config';
import mongoose from 'mongoose';

const uri = process.env.MONGODB_URI?.trim();
const keepDays = Math.max(7, Number(process.env.KEEP_DAYS || 90) || 90);
const cutoff = new Date(Date.now() - keepDays * 24 * 60 * 60 * 1000);

if (!uri) {
  console.error('MONGODB_URI .env da kerak');
  process.exit(1);
}

await mongoose.connect(uri);
const db = mongoose.connection.db;

console.log(`\nCutoff: ${cutoff.toISOString()} (${keepDays} kun oldin)\n`);

const testSessions = db.collection('testsessions');
const finished = await testSessions.deleteMany({
  status: 'finished',
  finishedAt: { $lt: cutoff },
});
console.log('Deleted finished TestSession:', finished.deletedCount);

const staleProgress = await testSessions.deleteMany({
  status: 'in_progress',
  updatedAt: { $lt: cutoff },
});
console.log('Deleted stale in_progress TestSession:', staleProgress.deletedCount);

try {
  const sessions = db.collection('sessions');
  const sess = await sessions.deleteMany({ expires: { $lt: new Date() } });
  console.log('Deleted expired connect-mongo sessions:', sess.deletedCount);
} catch {
  console.log('No sessions collection or delete skipped');
}

const stats = await db.stats();
console.log('\nAfter cleanup — storage (MB):', (stats.storageSize / 1024 / 1024).toFixed(2));
console.log('Atlas → Metrics → disk bo‘shaganini tekshiring.\n');

await mongoose.disconnect();
