import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderPasswordMail } from '../src/mail-templates.js';

test('davet ve şifre e-postaları ayrı metin taşır ve girdiyi kaçışlar', () => {
  const url = 'https://app.example/api/auth/reset-password/abc?callbackURL=https%3A%2F%2Fapp.example%2Fsifre-belirle&x=1';
  const invite = renderPasswordMail('invite', { name: '<b>Ayşe</b>', url });
  const reset = renderPasswordMail('reset', { name: 'Ayşe', url });
  assert.notEqual(invite.subject, reset.subject);
  assert.match(invite.html, /Şifremi belirle/); assert.match(reset.html, /Yeni şifre belirle/);
  assert.ok(!invite.html.includes('<b>Ayşe</b>')); assert.match(invite.html, /&lt;b&gt;Ayşe&lt;\/b&gt;/);
  assert.ok(invite.html.includes('href="https://app.example/api/auth/reset-password/abc?callbackURL=https%3A%2F%2Fapp.example%2Fsifre-belirle&amp;x=1"'));
  assert.ok(invite.text.includes(url)); assert.match(reset.text, /^Merhaba Ayşe,/);
  assert.match(renderPasswordMail('reset', { name: ' ', url }).text, /^Merhaba,/);
});
