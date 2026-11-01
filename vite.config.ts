import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // 让 react / @xyflow/react 只预打包一份，避免 dev 下出现两份 React 导致
  // 节点测量（handleBounds）拿不到句柄、连线不渲染。
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-dom/client', '@xyflow/react'],
  },
})
