import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    // Load from .env files (local dev); Netlify injects process.env at build time
    const env = loadEnv(mode, process.cwd(), '');
    const getEnv = (key: string) => process.env[key] ?? env[key];

    if (getEnv('GEMINI_API_KEY')) {
      console.log('✓ GEMINI_API_KEY found in environment');
    } else {
      console.warn('⚠ GEMINI_API_KEY not set. Set it in .env.local (local) or Netlify env (deploy).');
    }

    return {
      server: {
        port: 3000,
        host: '127.0.0.1',
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(getEnv('GEMINI_API_KEY') || getEnv('CLAUDE_API_KEY')),
        'process.env.GEMINI_API_KEY': JSON.stringify(getEnv('GEMINI_API_KEY')),
        'process.env.CLAUDE_API_KEY': JSON.stringify(getEnv('CLAUDE_API_KEY')),
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      optimizeDeps: {
        exclude: []
      }
    };
});
