import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type Database from 'better-sqlite3';
import type { Auth } from './auth.js';
import { HttpError } from './errors.js';

export class IdentityError extends HttpError {}

export async function bootstrap(auth: Auth, db: Database.Database, input: { email?: string; name?: string; passwordFile?: string }) {
  if (db.prepare("SELECT 1 FROM app_settings WHERE key = 'bootstrap_completed'").get()) return { created: false };
  if (!input.email || !input.name || !input.passwordFile) throw new Error('İlk kurulum için BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_NAME ve BOOTSTRAP_ADMIN_PASSWORD_FILE gerekli.');
  if (db.prepare("SELECT 1 FROM user WHERE role = 'super_admin'").get()) throw new Error('Başkan mevcut fakat bootstrap kaydı eksik; otomatik parola/rol değişikliği yapılmadı.');
  const password = (await readFile(input.passwordFile, 'utf8')).trim();
  if (password.length < 16 || password.length > 128) throw new Error('Başlangıç şifresi 16–128 karakter olmalı.');
  const lock = db.prepare("INSERT OR IGNORE INTO app_settings VALUES ('bootstrap_lock', ?)").run(new Date().toISOString());
  if (!lock.changes) throw new Error('Başka bir bootstrap çalışıyor veya yarım kalan kurulum incelenmeli.');
  try {
    const { user } = await auth.api.createUser({ body: { email: input.email.trim().toLowerCase(), name: input.name.trim(), password, role: 'super_admin' } });
    db.transaction(() => {
      db.prepare('INSERT INTO user_profiles (user_id) VALUES (?)').run(user.id);
      db.prepare("INSERT INTO invitations (user_id, state, accepted_at) VALUES (?, 'accepted', ?)").run(user.id, new Date().toISOString());
      db.prepare("INSERT INTO app_settings VALUES ('bootstrap_completed', ?)").run(user.id);
    })();
    return { created: true };
  } finally {
    db.prepare("DELETE FROM app_settings WHERE key = 'bootstrap_lock'").run();
  }
}

export function createIdentityService(auth: Auth, db: Database.Database, appUrl: string) {
  async function invite(userId: string) {
    const row = db.prepare(`SELECT u.email, i.state, p.active FROM user u
      JOIN invitations i ON i.user_id = u.id JOIN user_profiles p ON p.user_id = u.id WHERE u.id = ?`)
      .get(userId) as { email: string; state: string; active: number } | undefined;
    if (!row) throw new IdentityError(404, 'NOT_FOUND', 'Kullanıcı bulunamadı.');
    if (!row.active || row.state === 'accepted') throw new IdentityError(409, 'NOT_INVITABLE', 'Bu hesap için yeniden davet gönderilemez.');
    db.prepare('UPDATE invitations SET last_attempt_at = ? WHERE user_id = ?').run(new Date().toISOString(), userId);
    try {
      await auth.api.requestPasswordReset({ body: { email: row.email, redirectTo: `${appUrl}/sifre-belirle` } });
      const state = (db.prepare('SELECT state FROM invitations WHERE user_id = ?').get(userId) as { state: string }).state;
      if (state === 'failed') throw new IdentityError(502, 'INVITATION_FAILED', 'Hesap korundu, davet gönderilemedi. Yeniden deneyebilirsiniz.');
      return { id: userId, invitation: 'sent' as const };
    } catch {
      db.prepare("UPDATE invitations SET state = 'failed' WHERE user_id = ? AND state NOT IN ('accepted', 'failed')").run(userId);
      throw new IdentityError(502, 'INVITATION_FAILED', 'Hesap korundu, davet gönderilemedi. Yeniden deneyebilirsiniz.');
    }
  }
  async function createUser(input: { name: string; email: string }) {
    const email = input.email.trim().toLowerCase();
    if (db.prepare('SELECT 1 FROM user WHERE email = ?').get(email)) throw new IdentityError(409, 'USER_EXISTS', 'Bu e-posta zaten kayıtlı. Mevcut hesaba yeniden davet gönderin.');
    let user;
    try {
      ({ user } = await auth.api.createUser({ body: { name: input.name.trim(), email, password: randomBytes(48).toString('base64url'), role: 'user' } }));
    } catch {
      if (db.prepare('SELECT 1 FROM user WHERE email = ?').get(email)) throw new IdentityError(409, 'USER_EXISTS', 'Bu e-posta zaten kayıtlı.');
      throw new IdentityError(400, 'INVALID_USER', 'Kullanıcı oluşturulamadı. Bilgileri kontrol edin.');
    }
    db.transaction(() => {
      db.prepare('INSERT INTO user_profiles (user_id) VALUES (?)').run(user.id);
      db.prepare("INSERT INTO invitations (user_id, state) VALUES (?, 'pending')").run(user.id);
    })();
    try { return await invite(user.id); }
    catch (error) {
      if (error instanceof IdentityError && error.code === 'INVITATION_FAILED') return { id: user.id, invitation: 'failed' as const };
      throw error;
    }
  }
  return { createUser, invite };
}
