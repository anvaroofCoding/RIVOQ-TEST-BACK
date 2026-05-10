import nodemailer from 'nodemailer';
import { config } from '../config/index.js';

export function createMailer() {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !port || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

export async function sendOtpEmail({ to, code }) {
  const from = process.env.EMAIL_FROM || 'no-reply@rivoq.local';
  const subject = 'Your login code';
  const text = `Your login code: ${code}\n\nThis code will expire in 10 minutes.`;

  const transporter = createMailer();
  if (!transporter) {
    // DEV fallback: if SMTP not configured, print code to logs.
    if (config.node_env !== 'production') {
      // eslint-disable-next-line no-console
      console.log(`[DEV OTP] email=${to} code=${code}`);
      return { delivered: false, dev: true };
    }
    throw new Error('SMTP is not configured');
  }

  await transporter.sendMail({ from, to, subject, text });
  return { delivered: true };
}

