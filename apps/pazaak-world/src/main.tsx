import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AnimatedBackground } from './components/AnimatedBackground.tsx'

const normalizedPath = window.location.pathname.replace(/\/+$/u, '') || '/'
const isDiscordBotsHubPath = normalizedPath === '/bots'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {!isDiscordBotsHubPath ? <AnimatedBackground /> : null}
    <div className="app-shell">
      <App />
    </div>
  </StrictMode>,
)
