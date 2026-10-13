import express, { type ErrorRequestHandler, type RequestHandler } from 'express';
import { fromNodeHeaders, toNodeHandler } from 'better-auth/node';
import { resolve } from 'node:path';
import type { Config } from './config.js';
import { openDatabase, canSignIn } from './database.js';
import { createAuth } from './auth.js';
import { createIdentityService, IdentityError } from './identity.js';
import { createMailer, type Mailer } from './mail.js';
import { HttpError } from './errors.js';
import { registerCommitteeRoutes } from './committees.js';
import { registerTaskRoutes } from './tasks.js';

function throttle(max: number, windowMs: number): RequestHandler {
  const buckets = new Map<string, { count: number; until: number }>();
  return (req, res, next) => {
    const now = Date.now();
    for (const [key, value] of buckets) if (value.until <= now) buckets.delete(key);
    const key = req.ip ?? 'unknown';
    const value = buckets.get(key) ?? { count: 0, until: now + windowMs };
    if (buckets.size >= 10000 && !buckets.has(key)) { res.status(429).json({ error: { code: 'RATE_LIMIT', message: 'Daha sonra tekrar deneyin.' } }); return; }
    value.count += 1; buckets.set(key, value);
    if (value.count > max) { res.setHeader('Retry-After', String(Math.ceil((value.until - now) / 1000))); res.status(429).json({ error: { code: 'RATE_LIMIT', message: 'Çok fazla deneme. Daha sonra tekrar deneyin.' } }); return; }
    next();
  };
}

export async function createApplication(config: Config, mailer: Mailer = createMailer(config)) {
  const db = openDatabase(config.databasePath);
  const auth = await createAuth(config, db, mailer);
  const identity = createIdentityService(auth, db, config.appUrl);
  const app = express();
  app.disable('x-powered-by');
  app.use('/api', (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); res.setHeader('Referrer-Policy', 'no-referrer'); next(); });
  app.use('/api', (req, res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('origin') !== config.appUrl) {
      res.status(403).json({ error: { code: 'INVALID_ORIGIN', message: 'İstek kaynağına izin verilmiyor.' } }); return;
    }
    next();
  });
  const authPaths = new Set(['/sign-in/email', '/sign-out', '/get-session', '/reset-password', '/change-password']);
  app.use('/api/auth', (req, res, next) => {
    const path = req.path.replace(/\/$/, '');
    if (authPaths.has(path) || (req.method === 'GET' && /^\/reset-password\/[^/]+$/.test(path))) { next(); return; }
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'İşlem bulunamadı.' } });
  });
  // Better Auth must consume the request stream before express.json().
  app.all('/api/auth/*splat', toNodeHandler(auth));
  app.use(express.json({ limit: '16kb' }));
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  app.post('/api/password-reset', throttle(5, 60_000), (req, res) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { res.status(400).json({ error: { code: 'INVALID_EMAIL', message: 'Geçerli bir e-posta girin.' } }); return; }
    // Same response and delivery timing for existing/nonexistent accounts.
    res.status(202).json({ message: 'Hesabınız varsa şifre belirleme bağlantısı gönderilecek.' });
    void auth.api.requestPasswordReset({ body: { email, redirectTo: `${config.appUrl}/sifre-belirle` } }).catch(() => {
      // No email, provider error text or token is logged.
      console.warn('Şifre e-postası gönderilemedi; mail yapılandırmasını kontrol edin.');
    });
  });
  const requireMember: RequestHandler = async (req, res, next) => {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    if (!session || !canSignIn(db, session.user.id)) { res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Oturum açmanız gerekiyor.' } }); return; }
    res.locals.user = session.user;
    next();
  };
  const requireAdmin: RequestHandler = (_req, res, next) => {
    if (res.locals.user.role !== 'super_admin') { res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Bu işlem için başkan yetkisi gerekiyor.' } }); return; }
    next();
  };
  app.get('/api/me', requireMember, (_req, res) => {
    const { id, name, email, role } = res.locals.user;
    const profile = db.prepare('SELECT onboarding_completed_at AS onboardingCompletedAt FROM user_profiles WHERE user_id = ?')
      .get(id) as { onboardingCompletedAt: string | null };
    res.json({ id, name, email, role, onboardingCompletedAt: profile.onboardingCompletedAt });
  });
  app.patch('/api/me/onboarding', requireMember, (req, res) => {
    const body = req.body as unknown;
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1 || (body as { completed?: unknown }).completed !== true) {
      res.status(400).json({ error: { code: 'INVALID_ONBOARDING', message: 'Tanıtım durumu geçersiz.' } }); return;
    }
    const now = new Date().toISOString();
    db.prepare('UPDATE user_profiles SET onboarding_completed_at = COALESCE(onboarding_completed_at, ?) WHERE user_id = ?')
      .run(now, res.locals.user.id);
    const profile = db.prepare('SELECT onboarding_completed_at AS onboardingCompletedAt FROM user_profiles WHERE user_id = ?')
      .get(res.locals.user.id) as { onboardingCompletedAt: string };
    res.json(profile);
  });
  type UserRow = { id: string; name: string; email: string; role: string; active: number; invitation: string; invitationSentAt: string | null; createdAt: string };
  const userSelect = `SELECT u.id, u.name, u.email, u.role, p.active, i.state AS invitation, i.sent_at AS invitationSentAt, u.createdAt AS createdAt
    FROM user u JOIN user_profiles p ON p.user_id=u.id JOIN invitations i ON i.user_id=u.id`;
  const toUser = (row: UserRow) => ({ ...row, active: row.active === 1, createdAt: new Date(row.createdAt).toISOString() });
  app.get('/api/users', requireMember, requireAdmin, (_req, res) => {
    res.json((db.prepare(`${userSelect} ORDER BY u.name COLLATE NOCASE LIMIT 500`).all() as UserRow[]).map(toUser));
  });
  app.patch('/api/users/:id', requireMember, requireAdmin, throttle(30, 60_000), (req, res) => {
    const body = req.body as Record<string, unknown> | undefined;
    const keys = body && typeof body === 'object' && !Array.isArray(body) ? Object.keys(body) : [];
    const { role, active } = body ?? {};
    if (!keys.length || keys.some(key => key !== 'role' && key !== 'active')
      || (role !== undefined && role !== 'super_admin' && role !== 'user') || (active !== undefined && typeof active !== 'boolean')) {
      throw new IdentityError(400, 'INVALID_USER_UPDATE', 'Rol veya erişim bilgisi geçersiz.');
    }
    const id = String(req.params.id);
    if (id === res.locals.user.id) throw new IdentityError(409, 'SELF_UPDATE', 'Kendi rolünü veya erişimini değiştiremezsin; başka bir başkandan iste.');
    const updated = db.transaction(() => {
      const current = db.prepare(`${userSelect} WHERE u.id = ?`).get(id) as UserRow | undefined;
      if (!current) throw new IdentityError(404, 'NOT_FOUND', 'Kullanıcı bulunamadı.');
      const nextRole = (role as string | undefined) ?? current.role;
      const nextActive = (active as boolean | undefined) ?? current.active === 1;
      const losesAdmin = current.role === 'super_admin' && current.active === 1 && (nextRole !== 'super_admin' || !nextActive);
      if (losesAdmin) {
        const others = db.prepare(`SELECT count(*) AS count FROM user u JOIN user_profiles p ON p.user_id=u.id JOIN invitations i ON i.user_id=u.id
          WHERE u.role='super_admin' AND p.active=1 AND i.state='accepted' AND u.id != ?`).get(id) as { count: number };
        if (!others.count) throw new IdentityError(409, 'LAST_ADMIN', 'Son aktif başkanın yetkisi kaldırılamaz veya hesabı pasifleştirilemez.');
      }
      db.prepare('UPDATE user SET role = ?, updatedAt = ? WHERE id = ?').run(nextRole, new Date().toISOString(), id);
      db.prepare('UPDATE user_profiles SET active = ? WHERE user_id = ?').run(nextActive ? 1 : 0, id);
      // Deactivation ends existing sessions; access is also re-checked on every request.
      if (!nextActive) db.prepare('DELETE FROM session WHERE userId = ?').run(id);
      return db.prepare(`${userSelect} WHERE u.id = ?`).get(id) as UserRow;
    })();
    res.json(toUser(updated));
  });
  app.post('/api/users', requireMember, requireAdmin, throttle(20, 60_000), async (req, res) => {
    const { name, email, ...extra } = req.body ?? {};
    if (Object.keys(extra).length || typeof name !== 'string' || !name.trim() || name.length > 100 || typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      throw new IdentityError(400, 'INVALID_USER', 'Ad ve geçerli e-posta gerekli. Bu uç nokta yalnız normal kullanıcı oluşturur.');
    }
    res.status(201).json(await identity.createUser({ name, email }));
  });
  app.post('/api/users/:id/invite', requireMember, requireAdmin, throttle(10, 60_000), async (req, res) => {
    res.json(await identity.invite(String(req.params.id)));
  });
  registerCommitteeRoutes(app, db, { requireMember, requireAdmin });
  registerTaskRoutes(app, db, { requireMember });
  app.use('/api', (_req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'İşlem bulunamadı.' } }));
  if (config.production) {
    app.use(express.static(resolve('apps/web/dist')));
    app.get('/{*splat}', (_req, res) => res.sendFile(resolve('apps/web/dist/index.html')));
  }
  const handleError: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof HttpError) { res.status(error.status).json({ error: { code: error.code, message: error.message }, ...(error.current ? { current: error.current } : {}) }); return; }
    if (error.type === 'entity.too.large' || error instanceof SyntaxError) { res.status(400).json({ error: { code: 'INVALID_BODY', message: 'İstek içeriği geçersiz.' } }); return; }
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'İşlem tamamlanamadı.' } });
  };
  app.use(handleError);
  return { app, auth, db, identity, close: () => db.close() };
}
