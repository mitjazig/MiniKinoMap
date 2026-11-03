import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ command }) => ({
  base: process.env.VITE_BASE || (command === 'build' ? '/MiniKinoMap/' : '/'),
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'node',
    include: ['src/tests/**/*.test.ts'],
  },
}));
