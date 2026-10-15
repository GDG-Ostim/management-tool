/** Only in-app destinations may survive the login redirect. Never accept protocol-relative URLs. */
export function safeReturnPath(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/';
  try {
    const url = new URL(value, location.origin);
    if (url.origin !== location.origin || !['/', '/panolar', '/profilim', '/raporlar', '/komiteler', '/kullanicilar'].includes(url.pathname)) return '/';
    return `${url.pathname}${url.search}`;
  } catch { return '/'; }
}

export const loginPath = () => `/giris?next=${encodeURIComponent(safeReturnPath(location.pathname + location.search))}`;
