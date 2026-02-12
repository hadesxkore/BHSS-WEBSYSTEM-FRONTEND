import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { Toaster } from './components/ui/sonner'
import { InAppNotificationsViewport } from './components/ui/in-app-notifications'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <InAppNotificationsViewport />
    <Toaster position="top-right" />
  </StrictMode>,
)
