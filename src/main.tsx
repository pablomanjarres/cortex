import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { applyStoredThemePreference } from '@/lib/theme'
import { App } from './App'
import './index.css'

applyStoredThemePreference()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <TooltipProvider>
        <App />
      </TooltipProvider>
    </HashRouter>
  </StrictMode>,
)

// Register service worker for PWA (browser/mobile only, not Electron)
if ('serviceWorker' in navigator && !window.electronAPI) {
  navigator.serviceWorker.register('./sw.js')
}
