import { resolve } from 'node:path';

export interface Config {
  appUrl: string;
  secret: string;
  databasePath: string;
  port: number;
  production: boolean;
  resendKey?: string;
  mailFrom?: string;
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
  return { appUrl, secret: env.BETTER_AUTH_SECRET, databasePath: resolve(env.DATABASE_PATH ?? 'data/gdg.sqlite'), port, production, resendKey: env.RESEND_API_KEY, mailFrom: env.MAIL_FROM };
}
