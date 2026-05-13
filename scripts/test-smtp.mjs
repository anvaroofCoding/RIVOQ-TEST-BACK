#!/usr/bin/env node
/**
 * SMTP ulanishini tekshirish (.env SMTP_* dan).
 * Ishlatish (loyiha ildizidan): node scripts/test-smtp.mjs
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const { createMailer } = await import('../src/utils/email.js');

const port = Number(process.env.SMTP_PORT);
console.log(`Host: ${process.env.SMTP_HOST ?? '(yoq)'}, port: ${Number.isFinite(port) ? port : '(yoq)'}`);
console.log(`User: ${process.env.SMTP_USER ?? '(yoq)'}`);
console.log(`SMTP_PASS uzunligi (bo'shliqsiz): ${String(process.env.SMTP_PASS || '').replace(/\s+/g, '').length} (Google app parol odatda 16)`);

const t = createMailer();
if (!t) {
  console.error('Transporter yaralmadi.');
  process.exit(1);
}

try {
  await t.verify();
  console.log('\nSMTP verify(): OK.');
} catch (err) {
  console.error('\nSMTP verify() xato:', err.message || err);
  console.error('\n>>> Gmail: SMTP_PASS da faqat «Paroli prilojeniy» bogida yaratilgan 16 belgilni qo\'ying.');
  process.exit(1);
}
