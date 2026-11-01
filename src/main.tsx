import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// 不开 StrictMode：React Flow 的 store 在 StrictMode 双挂载下会漏掉首帧的连线测量
createRoot(document.getElementById('root')!).render(<App />)
