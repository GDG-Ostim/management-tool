import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import webpush from 'web-push';

// Never print private key material or replace an existing installation's key pair.
const directory = resolve('secrets');
await mkdir(directory, { recursive: true });
const path = resolve(directory, 'vapid.env');
const keys = webpush.generateVAPIDKeys();
await writeFile(path, `PUSH_ENABLED=false\nVAPID_SUBJECT=\nVAPID_PUBLIC_KEY=${keys.publicKey}\nVAPID_PRIVATE_KEY=${keys.privateKey}\n`, { flag: 'wx', mode: 0o600 });
console.log(`Anahtarlar kaydedildi: ${path}. VAPID_SUBJECT alanını doldurup sunucunun ortam ayarlarına aktar. Bu dosyayı paylaşma veya Git'e ekleme.`);
