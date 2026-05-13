import nodemailer from 'nodemailer';
import { config } from '../config/index.js';

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
    tls: {
      minVersion: 'TLSv1.2',
      rejectUnauthorized: true,
    },
  });
}

function otpConsoleFallbackAllowed() {
  if (config.node_env !== 'production') return true;
  return String(process.env.ALLOW_OTP_WITHOUT_SMTP || '').toLowerCase() === 'true';
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
    throw new Error(`Email could not be sent (${err?.responseCode || err?.code || 'SMTP'}). Check SMTP credentials / App password.`);
  }
}
