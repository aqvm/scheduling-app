import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/scheduling-app/',
  plugins: [react()]
});
