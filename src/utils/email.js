import nodemailer from 'nodemailer';
import dns from 'node:dns';
import dnsPromises from 'node:dns/promises';
import { config } from '../config/index.js';

/**
 * Render va boshqa bulutlarda `smtp.gmail.com` → IPv6; konteynerda `ENETUNREACH` bo‘lishi mumkin.
 * Default: faqat IPv4 (`SMTP_FORCE_IPV4=false` bo‘lsa — tizim DNS tartibi).
 */
function smtpLookup(hostname, options, callback) {
  const force =
    process.env.SMTP_FORCE_IPV4 === undefined || String(process.env.SMTP_FORCE_IPV4).toLowerCase() !== 'false';
  if (!force) {
    dns.lookup(hostname, options, callback);
    return;
  }
  dns.lookup(hostname, { family: 4 }, callback);
}

/** .env qiymatlarini Gmail uchun aqlli defaultlar bilan birlashtiramiz */
function resolvedSmtpConfig() {
  let host = process.env.SMTP_HOST?.trim() || '';
  const user = process.env.SMTP_USER?.trim() || '';
  if (!host && /@gmail\.com$/i.test(user)) {
    host = 'smtp.gmail.com';
  }

  let portRaw =
    process.env.SMTP_PORT != null && String(process.env.SMTP_PORT).trim() !== ''
      ? Number(process.env.SMTP_PORT)
      : NaN;
  if ((!Number.isFinite(portRaw) || portRaw <= 0) && /^smtp\.gmail\.com$/i.test(host)) {
    portRaw = 587;
  }
  const port = Number.isFinite(portRaw) && portRaw > 0 ? Math.trunc(portRaw) : undefined;

  const pass = process.env.SMTP_PASS?.replace(/\s+/g, '') ?? '';

  return {
    host: host || undefined,
    port,
    user: user || undefined,
    pass,
  };
}

function otpMissingParts(c) {
  const m = [];
  if (!c.host) m.push('SMTP_HOST');
  if (!c.port) m.push('SMTP_PORT');
  if (!c.user) m.push('SMTP_USER');
  if (!c.pass) m.push('SMTP_PASS');
  return m;
}

/** Resend.com — HTTPS (443), Render free SMTP blokidan qochish */
function resendApiKey() {
  return process.env.RESEND_API_KEY?.trim() || '';
}

export function isResendConfigured() {
  return resendApiKey().length > 0;
}

/** Diagnostika: qaysi o‘zgaruvchilar bo‘lmaganda OTP email ketmaydi */
export function smtpMissingEnvKeysForOtp() {
  if (isResendConfigured()) return [];
  const c = resolvedSmtpConfig();
  return otpMissingParts(c);
}

export function otpEmailProvider() {
  if (isResendConfigured()) return 'resend';
  if (createMailer()) return 'smtp';
  if (otpConsoleFallbackAllowed()) return 'console';
  return 'none';
}

function connectionTimeouts() {
  return {
    connectionTimeout: Number(process.env.SMTP_CONNECTION_TIMEOUT_MS) || 25_000,
    greetingTimeout: Number(process.env.SMTP_GREETING_TIMEOUT_MS) || 20_000,
    socketTimeout: Number(process.env.SMTP_SOCKET_TIMEOUT_MS) || 35_000,
  };
}

/**
 * SMTP ulanish: domen bo‘lsa va IPv4 majbur bo‘lsa — `resolve4` bilan IP ga ulanamiz,
 * TLS SNI uchun `servername` = asl domen (Gmail sertifikati).
 */
async function smtpResolveConnectTarget(hostname) {
  if (!hostname || /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
    return { connectHost: hostname, servername: undefined };
  }
  const force =
    process.env.SMTP_FORCE_IPV4 === undefined || String(process.env.SMTP_FORCE_IPV4).toLowerCase() !== 'false';
  if (!force) {
    return { connectHost: hostname, servername: undefined };
  }
  try {
    const v4 = await dnsPromises.resolve4(hostname);
    if (v4?.length) {
      return { connectHost: v4[0], servername: hostname };
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(`[SMTP] resolve4(${hostname}) xato, domen bilan davom:`, e?.message || e);
  }
  return { connectHost: hostname, servername: undefined };
}

function baseTransportOptions(c, connectHost, servername) {
  const port = c.port;
  const useLookup = String(connectHost) === String(c.host);
  return {
    host: connectHost,
    port,
    secure: port === 465,
    requireTLS: port === 587,
    auth: { user: c.user, pass: c.pass },
    ...(useLookup ? { lookup: smtpLookup } : {}),
    tls: {
      minVersion: 'TLSv1.2',
      rejectUnauthorized: true,
      ...(servername ? { servername } : {}),
    },
    ...connectionTimeouts(),
  };
}

export function createMailer() {
  const c = resolvedSmtpConfig();
  const { host, port, user, pass } = c;

  if (!host || !port || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport(baseTransportOptions(c, host, undefined));
}

function otpConsoleFallbackAllowed() {
  if (config.node_env !== 'production') return true;
  return String(process.env.ALLOW_OTP_WITHOUT_SMTP || '').toLowerCase() === 'true';
}

/** OTP email yuborilishi mumkinmi (Resend API, SMTP yoki dev konsol) */
export function isOtpEmailConfiguredOrDevFallback() {
  return isResendConfigured() || !!createMailer() || otpConsoleFallbackAllowed();
}

function formatMailerError(err) {
  const code = err?.responseCode ?? err?.code;
  const msg = err?.message || String(err);
  const gmailHint =
    typeof msg === 'string' && (/Invalid login|EAUTH|EENVELOPE|535/i.test(msg) || Number(code) === 535)
      ? ' Gmail: SMTP_USER va SMTP_PASS - Gmail App password (16 belgi, probelsiz).'
      : '';
  return `[SMTP xato] ${code ? `code=${code} ` : ''}${msg}.${gmailHint}`;
}

/** Mobil UI — texnik inglizcha matnni emas, qisqa o‘zbekcha */
export function getPublicOtpEmailErrorMessage(err) {
  const m = `${err?.message || ''} ${err?.code || ''} ${err?.responseCode || ''}`;
  if (/Resend:/i.test(m)) {
    return m.replace(/^Resend:\s*/i, 'Email xizmati: ');
  }
  if (/535|Invalid login|EAUTH|EENVELOPE|authentication failed/i.test(m)) {
    return 'Gmail: SMTP_USER va App password (16 belgi) noto‘g‘ri yoki hisob bloklangan.';
  }
  if (/ETIMEDOUT|ECONNRESET|ENOTFOUND|ENETUNREACH|ESOCKET|ETLS|ECONNREFUSED|certificate/i.test(m)) {
    if (config.node_env === 'production') {
      return 'Render bepul rejimida SMTP (587) bloklangan. RESEND_API_KEY qo‘ying yoki Render’ni pullik rejimga o‘tkazing.';
    }
    return 'Pochta serveriga ulanib bo‘lmadi. SMTP host/port va internetni tekshiring.';
  }
  return 'Email yuborilmadi. Bir ozdan keyin qayta «Kodni yuborish»ni bosing.';
}

async function sendOtpViaResend({ to, code, from, subject, text }) {
  const key = resendApiKey();
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      text,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail =
      typeof body?.message === 'string'
        ? body.message
        : typeof body?.error === 'string'
          ? body.error
          : `HTTP ${res.status}`;
    throw new Error(`Resend: ${detail}`);
  }
  return { delivered: true, via: 'resend' };
}

export async function sendOtpEmail({ to, code }) {
  const c = resolvedSmtpConfig();
  const fromRaw = process.env.EMAIL_FROM?.trim() || 'no-reply@rivoq.local';
  const subject = 'RIVIQ — kirish kodi';
  const text = `Kirishingiz uchun kod: ${code}\n\nKod 10 daqiqa amal qiladi.`;

  let from = fromRaw;
  if (isResendConfigured()) {
    if (/^smtp\.gmail\.com$/i.test(c.host || '') && c.user && !from.includes(c.user)) {
      from = c.user;
    }
    // eslint-disable-next-line no-console
    console.log(`[OTP] Resend API orqali: to=${to}`);
    return sendOtpViaResend({ to, code, from, subject, text });
  }

  if (!createMailer()) {
    const miss = otpMissingParts(c).join(', ') || '(nomalum)';
    if (otpConsoleFallbackAllowed()) {
      // eslint-disable-next-line no-console
      console.warn(
        `[OTP] SMTP toʻliq sozlanmagan (yo‘q/qabul qilinmaydi: ${miss}) — kod faqat konsolda`
      );
      // eslint-disable-next-line no-console
      console.log(`[OTP] email=${to} code=${code}`);
      return { delivered: false, dev: true };
    }
    throw new Error(
      `SMTP is not configured (kam: ${miss}). Mobil ilova prod serverga urganda uni Render/VPS Environment ga qo‘ying; vaqtincha ALLOW_OTP_WITHOUT_SMTP=true (faqat ichki test)`
    );
  }

  /** Gmail frequently rejects arbitrary From ≠ login unless “alias” configured */
  let from = fromRaw;
  if (/^smtp\.gmail\.com$/i.test(c.host || '') && c.user && /@gmail\.com$/i.test(c.user)) {
    if (!from.includes(c.user)) {
      // eslint-disable-next-line no-console
      console.warn(`[OTP] EMAIL_FROM login bilan mos emas → From=${c.user}`);
      from = c.user;
    }
  }

  const { connectHost, servername } = await smtpResolveConnectTarget(c.host);
  // eslint-disable-next-line no-console
  console.log(`[OTP] SMTP ulanish: host=${connectHost}${servername ? ` tlsServername=${servername}` : ''} port=${c.port}`);

  const transporter = nodemailer.createTransport(baseTransportOptions(c, connectHost, servername));

  try {
    await transporter.sendMail({ from, to, subject, text });
    return { delivered: true };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(formatMailerError(err));
    throw err;
  }
}

/**
 * `sendMail` ni maks. `timeoutMs` ichida tugatish (mobil fetch timeout bilan moslash uchun ixtiyoriy).
 * @returns {{ ok: true } | { ok: false, error: Error }}
 */
export async function sendOtpEmailWithTimeout({ to, code, timeoutMs = 25_000 }) {
  const ms = Math.max(3000, Math.min(Number(timeoutMs) || 25_000, 60_000));
  try {
    await Promise.race([
      sendOtpEmail({ to, code }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('SMTP send timeout')), ms)),
    ]);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err };
  }
}
