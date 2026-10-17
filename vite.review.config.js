import { defineConfig, mergeConfig } from 'vite';
import appConfig from './vite.config.js';

// Run the real interface against a separate browser origin with no cloud env.
// envPrefix also excludes inherited VITE_* values from the client bundle.
export default mergeConfig(appConfig, defineConfig({
  envDir: false,
  envPrefix: 'AETHER_REVIEW_PUBLIC_',
  server: { host: '127.0.0.1', port: 5174, strictPort: true },
}));
