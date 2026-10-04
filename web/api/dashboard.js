// Vercel Function behind the hosted dashboard (/api/dashboard).
// It forwards the request to the n8n workflow with the dashboard key, so the key stays
// on the server, and asks for the site password when SITE_PASSWORD is set.
//
// Environment variables (Vercel → Project → Settings → Environment Variables):
//   N8N_URL        your n8n address, e.g. https://yourname.app.n8n.cloud
//   N8N_KEY        the Value of the workflow's "Dashboard key" credential
//   SITE_PASSWORD  optional; visitors must enter it before they see any data
import { timingSafeEqual } from 'node:crypto';

const matches = (given, expected) => {
  const a = Buffer.from(String(given));
  const b = Buffer.from(String(expected));
  return a.length === b.length && timingSafeEqual(a, b);
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const { N8N_URL, N8N_KEY, SITE_PASSWORD } = process.env;

  if (!N8N_URL || !N8N_KEY) {
    res.status(500).json({ message: 'The server is missing N8N_URL or N8N_KEY. Add them in the Vercel project settings.' });
    return;
  }
  if (SITE_PASSWORD && !matches(req.headers['x-site-password'] ?? '', SITE_PASSWORD)) {
    res.status(401).json({ message: 'Password required.' });
    return;
  }

  try {
    const upstream = await fetch(`${N8N_URL.replace(/\/+$/, '')}/webhook/maternal-health-atlas`, {
      headers: { 'X-Dashboard-Key': N8N_KEY, Accept: 'application/json' },
    });
    res.status(upstream.status);
    res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'application/json');
    res.send(await upstream.text());
  } catch {
    res.status(502).json({ message: 'Could not reach the n8n workflow.' });
  }
}
