import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import './redesign.css'
import './components/layout/refinement.css'
import './components/ui/components.css'
import './components/research/research.css'
import './components/research/chart-levels.css'
import './components/portfolio/portfolio.css'
import './components/portfolio/rebalance.css'
import AppearanceProvider from './theme/AppearanceProvider.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppearanceProvider><App /></AppearanceProvider>
  </React.StrictMode>,
)
