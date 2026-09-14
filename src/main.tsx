import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

// PWA: service worker sólo en producción y servido por http(s) (no en file://)
if (import.meta.env.PROD && 'serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(err => console.warn('SW no registrado', err)); });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
