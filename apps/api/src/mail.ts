import { Resend } from 'resend';
import type { Config } from './config.js';

export interface PasswordMail { email: string; name: string; url: string }
export interface Mailer { sendPasswordLink(message: PasswordMail): Promise<void> }

export function createMailer(config: Config): Mailer {
  const resend = config.resendKey ? new Resend(config.resendKey) : undefined;
  return {
    async sendPasswordLink({ email, url }) {
      if (!resend || !config.mailFrom) throw new Error('MAIL_NOT_CONFIGURED');
      const { error } = await resend.emails.send({
        from: config.mailFrom, to: email, subject: 'GDG OSTİM — Şifrenizi belirleyin',
        text: `GDG Management Tool hesabınızın şifresini belirlemek veya yenilemek için bağlantıyı açın:\n\n${url}\n\nBağlantı 1 saat geçerlidir ve tek kullanımlıktır. Bu işlemi beklemiyorsanız e-postayı yok sayabilirsiniz.`,
      });
      if (error) throw new Error('MAIL_DELIVERY_FAILED');
    },
  };
}
