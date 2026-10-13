import { Resend } from 'resend';
import type { Config } from './config.js';
import { renderPasswordMail, type PasswordMailKind } from './mail-templates.js';

export interface PasswordMail { kind: PasswordMailKind; email: string; name: string; url: string }
export interface Mailer { sendPasswordLink(message: PasswordMail): Promise<void> }

export function createMailer(config: Config): Mailer {
  const resend = config.resendKey ? new Resend(config.resendKey) : undefined;
  return {
    async sendPasswordLink({ kind, email, name, url }) {
      if (!resend || !config.mailFrom) throw new Error('MAIL_NOT_CONFIGURED');
      const { error } = await resend.emails.send({ from: config.mailFrom, to: email, ...renderPasswordMail(kind, { name, url }) });
      if (error) throw new Error('MAIL_DELIVERY_FAILED');
    },
  };
}
