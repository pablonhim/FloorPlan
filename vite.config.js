import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/** The latest commits, for the History panel's "Releases" list: [{ hash, date, subject }] (none without git). */
function revisions() {
  try {
    const out = execSync('git log -40 --date=iso-strict --format=%h%x1f%ad%x1f%s', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return out.trim().split('\n').filter(Boolean).map((l) => { const [hash, date, subject] = l.split('\x1f'); return { hash, date, subject }; });
  } catch {
    // a build without the repository's history (Vercel still names the commit it builds)
    const sha = process.env.VERCEL_GIT_COMMIT_SHA, msg = process.env.VERCEL_GIT_COMMIT_MESSAGE;
    return sha && msg ? [{ hash: sha.slice(0, 7), date: new Date().toISOString(), subject: msg.split('\n')[0] }] : [];
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: { __REVISIONS__: JSON.stringify(revisions()) },
});
