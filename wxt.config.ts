import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

export default defineConfig({
  manifestVersion: 3,
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'FollowMirror',
    description: 'Meta 데이터 사본의 팔로워/팔로잉 관계를 사용자 브라우저에서만 비교합니다.',
    permissions: ['storage', 'sidePanel'],
    action: {
      default_title: 'FollowMirror',
    },
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
