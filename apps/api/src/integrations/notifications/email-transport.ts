import nodemailer, { type Transporter } from 'nodemailer';

import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { getConfiguration } from '../../modules/platform/configuration.service';

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
}

interface EmailSenderConfig {
  senderName?: unknown;
  senderEmail?: unknown;
}

/**
 * Resolves the `from` header — prefers the admin-configured sender identity
 * (`email` Configuration namespace, `senderName`/`senderEmail`) when both are
 * set, falling back to `env.SMTP_FROM` exactly as before otherwise. SMTP
 * host/port/user/pass stay env-only (credentials, not identity) — see
 * `getTransporter` above, intentionally untouched.
 */
async function resolveFromHeader(): Promise<string> {
  try {
    const config = (await getConfiguration('email')) as EmailSenderConfig;
    const senderName = typeof config.senderName === 'string' ? config.senderName.trim() : '';
    const senderEmail = typeof config.senderEmail === 'string' ? config.senderEmail.trim() : '';
    if (senderName && senderEmail) return `"${senderName}" <${senderEmail}>`;
  } catch (error) {
    logger.warn({ err: error }, 'Failed to read email configuration from DB — falling back to SMTP_FROM');
  }
  return env.SMTP_FROM;
}

let transporter: Transporter | null = null;

/** Lazily built, reused across sends — same singleton pattern as the shared Puppeteer browser in integrations/pdf/pdf.service.ts. */
function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });
  }
  return transporter;
}

/**
 * Real SMTP delivery via nodemailer when `SMTP_HOST` is configured; a
 * dev-safe log-only fallback otherwise (this local environment has no live
 * SMTP credentials). Every send still goes through the real queue/worker/
 * retry/history pipeline in either case — only the last-mile transport
 * differs.
 */
export async function sendEmail(input: SendEmailInput): Promise<void> {
  if (!env.SMTP_HOST) {
    logger.info(
      { to: input.to, subject: input.subject },
      '[email-transport:log-only] SMTP_HOST not configured — logging instead of sending',
    );
    return;
  }

  await getTransporter().sendMail({
    from: await resolveFromHeader(),
    to: input.to,
    subject: input.subject,
    html: input.html,
  });
}
