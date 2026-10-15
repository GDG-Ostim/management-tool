import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { root } from './vault.mjs';

const routes = {
  auth: ['Mimari/Kimlik ve Kurulum', 'Ürün/Roller ve Yetkiler', 'Mimari/Sistem'],
  permissions: ['Ürün/Roller ve Yetkiler', 'Mimari/Veri Modeli'],
  tasks: ['Ürün/Görev Akışı', 'Ürün/Roller ve Yetkiler', 'Mimari/Veri Modeli'],
  reports: ['Ürün/Raporlar', 'Ürün/Roller ve Yetkiler', 'Mimari/Veri Modeli'],
  ui: ['Tasarım/Arayüz', 'Tasarım/Ekranlar', 'Ürün/PWA ve Bildirimler', 'Tasarım/Maskot ve Varlıklar'],
  ops: ['Operasyon/Çalıştırma ve Teslim', 'Operasyon/GitHub İşleri', 'Sistem/AI Çalışma Düzeni'],
};
const topic = process.argv[2];
if (!topic) {
  console.log(await readFile(resolve(root, 'vault/Sistem/AI Başlangıç.md'), 'utf8'));
  console.log(`Rotalar: ${Object.keys(routes).join(', ')}. Örnek: npm run context -- tasks`);
} else if (!Object.hasOwn(routes, topic)) {
  console.error(`Bilinmeyen rota: ${topic}. Rotalar: ${Object.keys(routes).join(', ')}`);
  process.exitCode = 1;
} else {
  const index = JSON.parse(await readFile(resolve(root, 'vault/context-index.json'), 'utf8'));
  for (const note of routes[topic]) {
    const entry = index.find(e => e.path === `vault/${note}.md`);
    if (!entry) throw new Error(`İndekste eksik rota: ${note}`);
    console.log(`${entry.path}\n  ${entry.ozet}`);
  }
  console.log('Yalnız bu işe gereken notları aç; kaynak belgeler: vault/Sistem/Teknik Kaynaklar.md');
}
