/**
 * Compartir un diagrama para lectura.
 *
 * El interruptor vive aquí y no en cada sitio que lo ofrece (barra superior, lista de
 * diagramas de la cuenta, inspector), porque lo importante no es la casilla sino lo que
 * hay alrededor: qué se publica, qué no, y que el enlace lo sirve tu cuenta, así que sin
 * sesión iniciada no funciona.
 */
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { Link } from 'react-router';
import { useStore } from '../store';
import { actions } from '../actions';
import { useAuth } from '../cloud';
import { accountPath } from '../routes';

const useShare = create<{ id: string | null }>(() => ({ id: null }));
/** Abre el diálogo de compartir sobre un diagrama. */
export const openShare = (id: string) => useShare.setState({ id });
const close = () => useShare.setState({ id: null });

export const publicUrl = (id: string) => `${location.origin}/p/${id}`;

/** Chip de estado para listas y barras: dice si ese diagrama está publicado. */
export function ShareButton({ id, className = 'btn' }: { id: string; className?: string }) {
  const publico = useStore(s => !!s.data.diagrams.find(d => d.id === id)?.public);
  return (
    <button className={className + (publico ? ' on' : '')} onClick={() => openShare(id)}
      title={publico ? 'Publicado para lectura: copiar o quitar el enlace' : 'Compartir con un enlace de sólo lectura'}>
      {publico ? '🔗 Público' : '🔗 Compartir'}
    </button>
  );
}

export function ShareDialog() {
  const id = useShare(s => s.id);
  const d = useStore(s => s.data.diagrams.find(x => x.id === id));
  const auth = useAuth();
  const [copiado, setCopiado] = useState(false);

  useEffect(() => { setCopiado(false); }, [id]);
  useEffect(() => {
    if (!id) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [id]);

  if (!id || !d) return null;
  const url = publicUrl(d.id);
  const sinCuenta = auth.status !== 'auth';
  const copiar = () => { void navigator.clipboard?.writeText(url); setCopiado(true); };

  return (
    <div className="modal-bg" onClick={close}>
      <div className="modal narrow" role="dialog" aria-label="Compartir diagrama" onClick={e => e.stopPropagation()}>
        <div className="row between"><h2>Compartir “{d.name}”</h2><button className="btn" onClick={close} title="Cerrar (Esc)">✕</button></div>

        <label className="chk big">
          <input type="checkbox" checked={!!d.public} onChange={e => actions.setPublic(d.id, e.target.checked)} />
          Público para lectura
        </label>
        <div className="muted small">Cualquiera con el enlace puede verlo, sin cuenta y sin poder cambiar nada.</div>

        {d.public && (
          <div className="share-box">
            <div className="row">
              <input readOnly value={url} onFocus={e => e.currentTarget.select()} />
              <button className="btn primary" onClick={copiar}>{copiado ? '✓ Copiado' : 'Copiar'}</button>
              <a className="btn" href={`/p/${d.id}`} target="_blank" rel="noreferrer">Abrir</a>
            </div>
            <h4>Qué se publica</h4>
            <ul className="help">
              <li>Este diagrama: capas, etapas, grupos, componentes y relaciones.</li>
              <li>Las personas asignadas, con su nombre y su papel, <b>sin el correo</b>.</li>
              <li>Las reglas de estilo, para que se pinte igual que aquí.</li>
              <li>No se publican tus otros diagramas, ni tus API keys, ni tu cuenta.</li>
            </ul>
          </div>
        )}

        {sinCuenta ? (
          <div className="notice">
            El enlace lo sirve tu cuenta, así que hace falta <Link to={accountPath('perfil')} onClick={close}>iniciar sesión</Link> para
            que funcione. Sin cuenta, marcar la casilla no publica nada: para compartir sin cuenta, usa <b>⤒ Diagrama</b> o el
            botón <b>🖼 Imagen</b>.
          </div>
        ) : !auth.online ? (
          <div className="notice">Sin conexión: el cambio se guarda aquí y se publicará en cuanto vuelva la red.</div>
        ) : auth.pending > 0 || auth.syncing ? (
          <div className="notice">Sincronizando con tu cuenta… el enlace funcionará en unos segundos.</div>
        ) : d.public ? (
          <div className="notice ok">Publicado y sincronizado: el enlace ya funciona.</div>
        ) : null}
      </div>
    </div>
  );
}
