import nodemailer, { type Transporter } from 'nodemailer';
import { getEnv } from './env';

let transporter: Transporter | null = null;

/**
 * Returns a singleton Nodemailer transporter configured from SMTP environment variables.
 */
export function getEmailTransporter(): Transporter {
  if (transporter) return transporter;

  const env = getEnv();
  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465, // true for 465, false for 587 / STARTTLS
    auth: {
      user: env.resolvedSmtpUser,
      pass: env.resolvedSmtpPass,
    },
  });

  return transporter;
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text: string;
  from?: string;
}

/**
 * Sends an email with both HTML and plain-text fallback.
 * Returns true on success, throws error on failure.
 */
export async function sendEmail(options: SendEmailOptions): Promise<boolean> {
  const env = getEnv();
  const transport = getEmailTransporter();

  const fromAddress = options.from || `"CareCircle" <${env.resolvedSmtpUser}>`;

  const info = await transport.sendMail({
    from: fromAddress,
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html,
  });

  return Boolean(info.messageId);
}
