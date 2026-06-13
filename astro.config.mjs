// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

// dhosae.in — astro configuration
// Server-rendered so the private /studio can write to the database and the
// homepage/reading pages reflect edits instantly.
//
// Adapter is chosen automatically: the Vercel adapter when building ON Vercel
// (Vercel sets the VERCEL env var), the Node adapter for local dev/preview.
// No manual edits needed to deploy. See DEPLOY.md.
const onVercel = !!process.env.VERCEL;
const adapter = onVercel
  ? (await import('@astrojs/vercel')).default()
  : node({ mode: 'standalone' });

export default defineConfig({
  site: 'https://dhosae.in',
  output: 'server',
  adapter,
  trailingSlash: 'ignore',
  build: {
    inlineStylesheets: 'auto',
  },
  devToolbar: {
    enabled: false,
  },
});
