/**
 * OTP email API qisqa integratsiya tekshiruvi.
 * Ishlatish: npm run test:otp
 *
 * MUHIT: API_BASE (default http://127.0.0.1:3000), TEST_EMAIL (default rivoquz@gmail.com)
 */
const BASE = (process.env.API_BASE || 'http://127.0.0.1:3000').replace(/\/+$/, '');
const email = (process.env.TEST_EMAIL || 'rivoquz@gmail.com').trim().toLowerCase();

async function requestCode(tag) {
  const r = await fetch(`${BASE}/api/auth/email/request-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email }),
  });
  const j = JSON.parse(await r.text().catch(() => '{}'));
  console.log(`${tag} → HTTP ${r.status}`, j);
  return r;
}

async function main() {
  console.log(`BASE=${BASE}\nEMAIL=${email}\n`);

  const h = await fetch(`${BASE}/health`);
  const hj = await h.json().catch(() => ({}));
  console.log('GET /health', h.status, {
    environment: hj.environment,
    smtpOtpConfigured: hj.smtpOtpConfigured,
    smtpOtpMissingEnv: hj.smtpOtpMissingEnv,
  });

  console.log('');
  const r1 = await requestCode('So‘rov 1');
  console.log('');
  const r2 = await requestCode('So‘rov 2 (bir xil sekundda — limit yo‘q)');

  const ok = r1.status === 200 && r2.status === 200;
  if (!ok) {
    console.error('\nKutilmaganda: ikkalasida ham HTTP 200 bo‘lishi kerak (OTP qayta yuborish cheklovi yo‘q).');
  } else {
    console.log('\n✓ Ikki ketma-ket kod so‘rovi ham 200 — qator cheklov olib tashlangan.');
    console.warn('Eslatma: prod da bu spam xavfini oshiradi; Gmail quotas ham mavjud.');
  }

  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
