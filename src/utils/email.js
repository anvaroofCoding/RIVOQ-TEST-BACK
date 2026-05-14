import nodemailer from 'nodemailer';
import dns from 'node:dns';
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

/** Diagnostika: qaysi o‘zgaruvchilar bo‘lmaganda OTP email ketmaydi */
export function smtpMissingEnvKeysForOtp() {
  const c = resolvedSmtpConfig();
  return otpMissingParts(c);
}

export function createMailer() {
  const c = resolvedSmtpConfig();
  const { host, port, user, pass } = c;

  if (!host || !port || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    requireTLS: port === 587,
    auth: { user, pass },
    lookup: smtpLookup,
    tls: {
      minVersion: 'TLSv1.2',
      rejectUnauthorized: true,
    },
    /** Render / sekin SMTP — cheksiz kutmaslik (ETIMEDOUT uchun biroz yuqori) */
    connectionTimeout: Number(process.env.SMTP_CONNECTION_TIMEOUT_MS) || 25_000,
    greetingTimeout: Number(process.env.SMTP_GREETING_TIMEOUT_MS) || 20_000,
    socketTimeout: Number(process.env.SMTP_SOCKET_TIMEOUT_MS) || 35_000,
  });
}

function otpConsoleFallbackAllowed() {
  if (config.node_env !== 'production') return true;
  return String(process.env.ALLOW_OTP_WITHOUT_SMTP || '').toLowerCase() === 'true';
}

/** OTP email yuborilishi mumkinmi (SMTP yoki dev konsol fallback) */
export function isOtpEmailConfiguredOrDevFallback() {
  return !!createMailer() || otpConsoleFallbackAllowed();
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

export async function sendOtpEmail({ to, code }) {
  const c = resolvedSmtpConfig();
  const fromRaw = process.env.EMAIL_FROM?.trim() || 'no-reply@rivoq.local';
  const subject = 'Your login code';
  const text = `Your login code: ${code}\n\nThis code will expire in 10 minutes.`;

  const transporter = createMailer();
  if (!transporter) {
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

  try {
    await transporter.sendMail({ from, to, subject, text });
    return { delivered: true };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(formatMailerError(err));
    const hint =
      /ENETUNREACH|IPv6|ESOCKET/i.test(String(err?.message || err?.code || ''))
        ? ' Render/bulutda IPv6 ulanmasa: SMTP_FORCE_IPV4=true (default) qoldiring yoki SMTP_HOST ni provayder IPv4 hostname bilan tekshiring.'
        : '';
    throw new Error(
      `Email could not be sent (${err?.responseCode || err?.code || 'SMTP'}). Check SMTP credentials / App password.${hint}`
    );
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
