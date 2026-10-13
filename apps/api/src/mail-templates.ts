export type PasswordMailKind = 'invite' | 'reset';

export interface RenderedMail { subject: string; html: string; text: string }

const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

const copy = {
  invite: {
    subject: 'GDG OSTİM çalışma alanına davet edildin',
    preheader: 'Şifreni belirleyerek komite ve görev alanına katıl.',
    title: 'Çalışma alanına hoş geldin',
    intro: 'GDG OSTİM Management Tool hesabın oluşturuldu. Şifreni belirlediğinde komitelerini, görevlerini ve ekip çıktılarını tek yerden takip edebilirsin.',
    action: 'Şifremi belirle',
    footer: 'Bu daveti beklemiyorsan e-postayı yok sayabilirsin; şifre belirlenmeden hesap kullanılamaz.',
  },
  reset: {
    subject: 'GDG OSTİM şifre yenileme bağlantın',
    preheader: 'Yeni şifreni belirlemek için bağlantı 1 saat geçerlidir.',
    title: 'Şifreni yenile',
    intro: 'Hesabın için şifre yenileme isteği aldık. Aşağıdaki düğmeyle yeni şifreni belirleyebilirsin; açık oturumların güvenlik için kapatılır.',
    action: 'Yeni şifre belirle',
    footer: 'Bu isteği sen yapmadıysan e-postayı yok sayabilirsin; mevcut şifren değişmez.',
  },
} satisfies Record<PasswordMailKind, Record<string, string>>;

export function renderPasswordMail(kind: PasswordMailKind, input: { name: string; url: string }): RenderedMail {
  const text = copy[kind];
  const name = input.name.trim();
  const greeting = name ? `Merhaba ${name},` : 'Merhaba,';
  const url = escape(input.url);
  const dots = ['#4285F4', '#EA4335', '#FBBC05', '#34A853']
    .map(color => `<td width="10" height="10" style="width:10px;height:10px;background:${color};border-radius:3px;font-size:0;line-height:0;">&nbsp;</td><td width="4" style="width:4px;font-size:0;">&nbsp;</td>`).join('');
  const html = `<!doctype html>
<html lang="tr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escape(text.subject)}</title></head>
<body style="margin:0;padding:0;background:#f5f6f7;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escape(text.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6f7;">
<tr><td align="center" style="padding:32px 16px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;font-family:Inter,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#202124;">
    <tr><td style="padding:0 4px 18px;">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr><td valign="middle" style="vertical-align:middle;"><table role="presentation" cellpadding="0" cellspacing="0" style="height:10px;"><tr>${dots}</tr></table></td><td style="padding-left:6px;font-size:15px;font-weight:700;color:#202124;">GDG OSTİM</td><td style="padding-left:8px;font-size:12px;color:#7a8087;">Management Tool</td></tr></table>
    </td></tr>
    <tr><td style="background:#ffffff;border:1px solid #e1e4e8;border-radius:12px;padding:32px 28px;">
      <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;font-weight:700;color:#202124;">${escape(text.title)}</h1>
      <p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#202124;">${escape(greeting)}</p>
      <p style="margin:0 0 26px;font-size:15px;line-height:1.6;color:#5f6368;">${escape(text.intro)}</p>
      <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:9px;background:#1967d2;">
        <a href="${url}" style="display:inline-block;padding:13px 22px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:9px;">${escape(text.action)}</a>
      </td></tr></table>
      <p style="margin:24px 0 0;padding:12px 14px;background:#f8f9fa;border:1px solid #eceef0;border-radius:8px;font-size:13px;line-height:1.5;color:#5f6368;">Bağlantı <strong style="color:#202124;">1 saat</strong> geçerlidir ve yalnız bir kez kullanılabilir. Süresi dolarsa giriş ekranındaki “Şifremi unuttum” ile yenisini isteyebilirsin.</p>
      <p style="margin:22px 0 6px;font-size:12px;line-height:1.5;color:#7a8087;">Düğme çalışmazsa bu adresi tarayıcına yapıştır:</p>
      <p style="margin:0;font-size:12px;line-height:1.5;word-break:break-all;"><a href="${url}" style="color:#1967d2;">${url}</a></p>
    </td></tr>
    <tr><td style="padding:18px 6px 0;font-size:12px;line-height:1.6;color:#7a8087;">${escape(text.footer)}<br>GDG OSTİM · Topluluk içi komite ve görev aracı</td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
  const plain = [
    greeting, '', text.intro, '', `${text.action}: ${input.url}`, '',
    'Bağlantı 1 saat geçerlidir ve yalnız bir kez kullanılabilir.', text.footer, '', 'GDG OSTİM · Management Tool',
  ].join('\n');
  return { subject: text.subject, html, text: plain };
}
