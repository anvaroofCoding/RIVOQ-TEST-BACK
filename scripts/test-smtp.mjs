#!/usr/bin/env node
/**
 * SMTP ulanishini va (ixtiyoriy) test xat yuborishni tekshirish.
 * Loyiha ildizidan: node scripts/test-smtp.mjs
 * Test xat: node scripts/test-smtp.mjs rivoquz@gmail.com
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const toEmail = process.argv[2]?.trim();

const { createMailer, sendOtpEmail } = await import('../src/utils/email.js');

const port = Number(process.env.SMTP_PORT);
console.log(`Host: ${process.env.SMTP_HOST ?? '(yoq)'}, port: ${Number.isFinite(port) ? port : '(yoq)'}`);
console.log(`User: ${process.env.SMTP_USER ?? '(yoq)'}`);
console.log(
  `SMTP_PASS uzunligi (bo'shliqsiz): ${String(process.env.SMTP_PASS || '').replace(/\s+/g, '').length} (Google app parol odatda 16)`
);

const t = createMailer();
if (!t) {
  console.error('Transporter yaralmadi (.env SMTP_* to‘liq emas).');
  process.exit(1);
}

try {
  await t.verify();
  console.log('\nSMTP verify(): OK.');
} catch (err) {
  console.error('\nSMTP verify() xato:', err.message || err);
  console.error("\n>>> Gmail: SMTP_PASS da faqat «Paroli prilojeniy» bo'yicha 16 belgilarni qo'ying.");
  process.exit(1);
}

if (toEmail) {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  console.log(`\nTest xat yuborilmoqda: ${toEmail} (kod: ${code})`);
  try {
    await sendOtpEmail({ to: toEmail, code });
    console.log('sendOtpEmail: OK (xat ketdi).');
  } catch (e) {
    console.error('sendOtpEmail xato:', e?.message || e);
    process.exit(1);
  }
}
