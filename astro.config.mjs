// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

// dhosae.in — astro configuration
// Server-rendered so the private /studio can write to the database and the
// homepage/reading pages reflect edits instantly.
//
// Adapter is chosen automatically: the Netlify adapter when building ON Netlify
// (Netlify sets the NETLIFY env var), the Node adapter for local dev/preview.
// No manual edits needed to deploy. See DEPLOY.md.
const onNetlify = !!process.env.NETLIFY;
const adapter = onNetlify
  ? (await import('@astrojs/netlify')).default()
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
