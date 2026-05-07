import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

export default defineConfig({
  manifestVersion: 3,
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Who Unfollowed Me?',
    description:
      'See who you follow that does not follow you back — analyzed locally from your own data export.',
    permissions: ['storage', 'sidePanel'],
    action: {
      default_title: 'Who Unfollowed Me?',
    },
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
