import { resolve } from 'node:path';
import { createECDH } from 'node:crypto';

export interface Config {
  appUrl: string;
  secret: string;
  databasePath: string;
  port: number;
  host: string;
  production: boolean;
  resendKey?: string;
  mailFrom?: string;
  push?: { subject: string; publicKey: string; privateKey: string };
  /** Push is on without keys in the environment: the server creates one key pair and keeps it in its database. */
  pushSubject?: string;
}

/** Throws unless the private key is a P-256 key and the public key belongs to it. */
export function assertVapidPair(publicKey: string, privateKey: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(publicKey + privateKey) || Buffer.from(privateKey, 'base64url').length !== 32) throw new Error('VAPID');
  const key = createECDH('prime256v1'); key.setPrivateKey(Buffer.from(privateKey, 'base64url'));
  if (key.getPublicKey().toString('base64url') !== publicKey) throw new Error('VAPID');
}

export function loadConfig(env = process.env): Config {
  const production = env.NODE_ENV === 'production';
  const appUrl = env.APP_URL ?? 'http://127.0.0.1:5173';
  const url = new URL(appUrl);
  if (url.origin !== appUrl || !['http:', 'https:'].includes(url.protocol)) throw new Error('APP_URL yalnız geçerli origin olmalı.');
  if (production && url.protocol !== 'https:') throw new Error('Üretimde APP_URL HTTPS olmalı.');
  if (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32) throw new Error('BETTER_AUTH_SECRET en az 32 karakter olmalı.');
  if (production && (!env.RESEND_API_KEY || !env.MAIL_FROM)) throw new Error('Üretimde RESEND_API_KEY ve MAIL_FROM gerekli.');
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Geçersiz PORT.');
  // Containers listen on all interfaces; local runs stay on loopback.
  const host = env.HOST ?? '127.0.0.1';
  let push: Config['push'];
  let pushSubject: string | undefined;
  if (env.PUSH_ENABLED && !['true', 'false'].includes(env.PUSH_ENABLED)) throw new Error('PUSH_ENABLED true veya false olmalı.');
  if (env.PUSH_ENABLED === 'true') {
    const { VAPID_SUBJECT: subject, VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: privateKey } = env;
    try {
      if (!subject || !/^(mailto:[^\s@]+@[^\s@]+\.[^\s@]+|https:\/\/[^\s]+)$/.test(subject)) throw new Error();
      if (!publicKey && !privateKey) pushSubject = subject;
      else {
        if (!publicKey || !privateKey) throw new Error();
        assertVapidPair(publicKey, privateKey);
        push = { subject, publicKey, privateKey };
      }
    } catch { throw new Error('Bildirim için geçerli VAPID_SUBJECT ve (verildiyse) eşleşen iki VAPID anahtarı gerekli.'); }
  }
  return { appUrl, secret: env.BETTER_AUTH_SECRET, databasePath: resolve(env.DATABASE_PATH ?? 'data/gdg.sqlite'), port, host, production, resendKey: env.RESEND_API_KEY, mailFrom: env.MAIL_FROM, push, pushSubject };
}
