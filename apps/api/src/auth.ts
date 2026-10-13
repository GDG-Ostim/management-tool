import { betterAuth } from 'better-auth';
import { APIError } from 'better-auth/api';
import { getMigrations } from 'better-auth/db/migration';
import { admin } from 'better-auth/plugins';
import { adminAc, userAc } from 'better-auth/plugins/admin/access';
import type Database from 'better-sqlite3';
import type { Config } from './config.js';
import type { Mailer } from './mail.js';
import { canSignIn, migrateIdentity } from './database.js';

export async function createAuth(config: Config, db: Database.Database, mailer: Mailer) {
  const auth = betterAuth({
    appName: 'GDG Management Tool', baseURL: config.appUrl, secret: config.secret,
    database: db, trustedOrigins: [config.appUrl],
    logger: { disabled: true }, // Tokens/passwords never reach request logs.
    emailAndPassword: {
      enabled: true, disableSignUp: true, minPasswordLength: 12, maxPasswordLength: 128,
      resetPasswordTokenExpiresIn: 3600, revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        const now = new Date().toISOString();
        const invitation = db.prepare('SELECT state FROM invitations WHERE user_id = ?').get(user.id) as { state: string } | undefined;
        const kind = invitation && invitation.state !== 'accepted' ? 'invite' : 'reset';
        try {
          await mailer.sendPasswordLink({ kind, email: user.email, name: user.name, url });
          db.prepare("UPDATE invitations SET state = 'sent', last_attempt_at = ?, sent_at = ? WHERE user_id = ? AND state != 'accepted'")
            .run(now, now, user.id);
        } catch (error) {
          db.prepare("UPDATE invitations SET state = 'failed', last_attempt_at = ? WHERE user_id = ? AND state != 'accepted'")
            .run(now, user.id);
          throw error;
        }
      },
      onPasswordReset: async ({ user }) => {
        db.prepare("UPDATE invitations SET state = 'accepted', accepted_at = ? WHERE user_id = ?")
          .run(new Date().toISOString(), user.id);
      },
    },
    session: { cookieCache: { enabled: false } },
    advanced: { useSecureCookies: config.production },
    rateLimit: { enabled: true, window: 60, max: 60 },
    plugins: [admin({ defaultRole: 'user', adminRoles: ['super_admin'], roles: { super_admin: adminAc, user: userAc } })],
    databaseHooks: {
      session: { create: { before: async session => {
        if (!canSignIn(db, session.userId)) throw new APIError('FORBIDDEN', { message: 'Hesap etkin değil veya davet kabul edilmedi.' });
        return { data: session };
      } } },
    },
  });
  const migration = await getMigrations(auth.options);
  await migration.runMigrations();
  migrateIdentity(db);
  return auth;
}

export type Auth = Awaited<ReturnType<typeof createAuth>>;
