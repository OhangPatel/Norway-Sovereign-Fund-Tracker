import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Serves the app in dev (npm run dev) and bundles it for production (npm run build).
// `public/` is copied to the site root, so data.json is reachable at /data.json.
export default defineConfig({
  plugins: [react()],
  server: { port: 8080, open: true },
});
