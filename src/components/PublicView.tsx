/**
 * Vista pública de un diagrama (`/p/:id`): sólo lectura, sin sesión y sin edición.
 * Carga los datos de la ruta pública del Worker en un store aparte para no tocar
 * lo que el visitante tenga guardado en su navegador.
 */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { Board } from './Board';
import { PublicPanel } from './PublicPanel';
import { API_BASE } from '../cloud';
import { useStore } from '../store';
import { normalize } from '../lib/model';
import type { AppData, Diagram, Library, Person, StyleRule } from '../types';

interface Respuesta { diagram: Diagram; libraries: Library[]; people: Person[]; rules: StyleRule[] }

export function PublicView() {
  const { id } = useParams<{ id: string }>();
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'error'>('cargando');
  const [error, setError] = useState('');
  const [nombre, setNombre] = useState('');
  const [panel, setPanel] = useState(true);

  useEffect(() => {
    let vivo = true;
    document.body.classList.add('read-only');
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/public/diagrams/${id}`);
        const txt = await res.text();
        const data = txt ? (JSON.parse(txt) as Partial<Respuesta> & { error?: string }) : {};
        if (!res.ok || !data.diagram) throw new Error(data.error || `Error ${res.status}`);
        if (!vivo) return;
        const app: AppData = normalize({
          libraries: data.libraries ?? [], diagrams: [data.diagram],
          people: data.people ?? [], rules: data.rules ?? [], currentDiagramId: data.diagram.id,
        });
        // el visitante puede tener sus propios diagramas en este navegador: la vista
        // pública persiste en otra clave para no pisarlos
        useStore.persist.setOptions({ name: 'drawer.public' });
        useStore.setState({ data: app, sel: null, cell: null, past: [], future: [] });
        setNombre(data.diagram.name);
        document.title = `${data.diagram.name} · Drawer`;
        setEstado('listo');
      } catch (e) {
        if (vivo) { setError((e as Error).message); setEstado('error'); }
      }
    })();
    return () => { vivo = false; document.body.classList.remove('read-only'); };
  }, [id]);

  if (estado === 'cargando') return <div className="public-msg">Cargando el diagrama…</div>;
  if (estado === 'error') {
    return (
      <div className="public-msg">
        <h2>No se puede mostrar</h2>
        <p className="muted">{error}</p>
        <p className="muted">El enlace puede haber caducado o su autor puede haber dejado de publicarlo.</p>
      </div>
    );
  }
  return (
    <>
      <header id="topbar" className="public">
        <div className="brand">◫ Drawer</div>
        <span className="pub-name">{nombre}</span>
        <span className="pub-tag">sólo lectura</span>
        <span className="spacer" />
        <button className="btn" onClick={() => setPanel(!panel)} title="Mostrar u ocultar la ficha de detalle">
          {panel ? '◨ Ocultar detalle' : '◧ Ver detalle'}
        </button>
        <a className="btn" href="/" target="_blank" rel="noreferrer">Abrir Drawer</a>
      </header>
      <main className="public-main">
        <Board />
        {panel && <PublicPanel />}
      </main>
    </>
  );
}
