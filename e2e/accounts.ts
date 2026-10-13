// Test-only accounts for the temporary e2e database; never used outside the e2e server.
export const admin = { name: 'E2E Başkan', email: 'baskan@e2e.test', password: 'E2e-Baskan-Sifresi-2026' };

export const people = {
  lead: { name: 'Mehmet Komite', email: 'lead@e2e.test', password: 'E2e-Lead-Sifresi-2026' },
  member: { name: 'Zeynep Üye', email: 'member@e2e.test', password: 'E2e-Member-Sifresi-2026' },
  outsider: { name: 'Can Medya', email: 'outsider@e2e.test', password: 'E2e-Outsider-Sifresi-2026' },
};
