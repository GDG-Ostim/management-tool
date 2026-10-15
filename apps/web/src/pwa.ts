import { useSyncExternalStore } from 'react';

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let prompt: InstallPrompt | null = null;
let installed = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(listener => listener());
const standalone = matchMedia('(display-mode: standalone)');
const isInstalled = () => standalone.matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault(); prompt = event as InstallPrompt; emit();
});
window.addEventListener('appinstalled', () => { installed = true; prompt = null; emit(); });
standalone.addEventListener('change', emit);

export function useInstallation() {
  const state = useSyncExternalStore(
    listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    () => installed || isInstalled() ? 'installed' : prompt ? 'available' : 'manual',
  );
  return { state, async install() {
    const event = prompt;
    if (!event) return;
    prompt = null; emit();
    await event.prompt();
    await event.userChoice;
  } };
}

if (import.meta.env.PROD && 'serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(() => {
      console.warn('Uygulama kurulumu için çevrimdışı destek başlatılamadı.');
    });
  });
}
