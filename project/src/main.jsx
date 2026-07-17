import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import RefereeApp from './pages/RefereeApp.jsx'
import './index.css'

// El botón "Árbitro" del Header abre una pestaña nueva a #/referee — se
// resuelve acá (sin librería de routing) para no tocar el resto de la app.
const isRefereeWindow = window.location.hash.startsWith('#/referee');

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {isRefereeWindow ? <RefereeApp /> : <App />}
  </React.StrictMode>
)
