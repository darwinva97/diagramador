import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router';
import App from './App';
import './styles.css';

const enServidor = location.protocol.startsWith('http');

// PWA: service worker sólo en producción y servido por HTTP(S)
if (import.meta.env.PROD && enServidor && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(err => console.warn('SW no registrado', err)); });
}

// Abierto como archivo suelto (file://) no hay servidor que haga el fallback a index.html:
// las rutas tienen que viajar en el hash.
const Router = enServidor ? BrowserRouter : HashRouter;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Router>
      <App />
    </Router>
  </React.StrictMode>,
);
