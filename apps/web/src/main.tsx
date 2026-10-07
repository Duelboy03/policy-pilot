import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { EngineProvider, SettingsProvider } from './hooks/app'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <EngineProvider>
      <SettingsProvider>
        <App />
      </SettingsProvider>
    </EngineProvider>
  </StrictMode>,
)
