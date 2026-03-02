import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { Toaster } from './components/ui/sonner'
import { InAppNotificationsViewport } from './components/ui/in-app-notifications'
import { Toaster as SileoToaster } from 'sileo'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <InAppNotificationsViewport />
    <Toaster position="top-right" />
    <SileoToaster
      position="top-center"
      theme="light"
      options={{ fill: "#1a1a2e" }}
    />
  </StrictMode>,
)
