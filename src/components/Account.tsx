import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { actions } from '../actions';
import { useAuth, login, register, logout, changePassword, deleteAccount, listKeys, createKey, deleteKey, pullAll, pushAll, platformAvailable, apiUrl, type ApiKeyInfo, type NewApiKey } from '../cloud';
import { exportAll, exportDiagram } from '../lib/io';
import { Avatar } from './People';
import { ASSIGN_LABEL } from '../types';
import { targetDiagram, targetName } from '../lib/model';
import { Link, NavLink, useNavigate, useParams } from 'react-router';
import { accountPath, diagramPath } from '../routes';

const TABS: { key: string; label: string }[] = [
  { key: 'perfil', label: '👤 Perfil' }, { key: 'keys', label: '🔑 API keys' }, { key: 'diagramas', label: '◫ Diagramas' },
  { key: 'bibliotecas', label: '📚 Bibliotecas' }, { key: 'tipos', label: '🏷 Tipos' }, { key: 'personas', label: '👥 Personas' }, { key: 'config', label: '⚙ Configuración' }, { key: 'agentes', label: '🤖 Agentes / API' },
];

export function Account() {
  const { tab = 'perfil' } = useParams<{ tab: string }>();
  const auth = useAuth();
  return (
    <div className="account">
      <aside className="account-nav">
        <Link className="btn" to="/">← Volver al tablero</Link>
        <div className="account-user">{auth.status === 'auth' ? auth.user?.email : 'Sin sesión (modo local)'}</div>
        {TABS.map(t => <NavLink key={t.key} className={({ isActive }) => 'nav-item' + (isActive ? ' on' : '')} to={accountPath(t.key)}>{t.label}</NavLink>)}
        <SyncStatus />
      </aside>
      <section className="account-body">
        {tab === 'perfil' && <Perfil />}
        {tab === 'keys' && <ApiKeys />}
        {tab === 'diagramas' && <Diagramas />}
        {tab === 'bibliotecas' && <Bibliotecas />}
        {tab === 'tipos' && <Tipos />}
        {tab === 'personas' && <Personas />}
        {tab === 'config' && <Config />}
        {tab === 'agentes' && <Agentes />}
      </section>
    </div>
  );
}

function SyncStatus() {
  const a = useAuth();
  if (a.status !== 'auth') return <div className="sync muted">Los datos se guardan sólo en este navegador. Inicia sesión para sincronizarlos y usar la API.</div>;
  return (
    <div className="sync">
      {a.error ? <span className="warn">⚠ {a.error}</span>
        : a.syncing ? <span>⟳ Sincronizando…</span>
        : a.pending > 0 ? <span>● {a.pending} cambio(s) pendiente(s)</span>
        : <span className="ok">✓ Sincronizado{a.lastSync ? ` · ${new Date(a.lastSync).toLocaleTimeString()}` : ''}</span>}
    </div>
  );
}

// ------------------------------------------------------------------ Perfil / acceso
function Perfil() {
  const auth = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState(''); const [pass, setPass] = useState(''); const [pass2, setPass2] = useState('');
  const [msg, setMsg] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const [cur, setCur] = useState(''); const [next, setNext] = useState('');

  if (!platformAvailable()) return <><h2>Cuenta</h2><p className="muted">La plataforma (cuentas y API) sólo está disponible cuando la app se sirve desde el servidor, p. ej. <b>https://draw.bezenti.com</b>. Abierta como archivo local funciona en modo local.</p></>;

  if (auth.status !== 'auth') {
    const submit = async (e: React.FormEvent) => {
      e.preventDefault(); setMsg(null); setBusy(true);
      try {
        if (mode === 'register') { if (pass !== pass2) throw new Error('Las contraseñas no coinciden'); await register(email, pass); }
        else await login(email, pass);
      } catch (err) { setMsg((err as Error).message); } finally { setBusy(false); }
    };
    return (
      <div className="auth-box">
        <h2>{mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}</h2>
        <p className="muted">Con una cuenta tus diagramas y librerías se guardan en la nube, se sincronizan entre dispositivos y puedes crear API keys para que agentes o scripts trabajen con ellos.</p>
        <form onSubmit={submit}>
          <label>Correo<input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /></label>
          <label>Contraseña<input type="password" required minLength={8} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={pass} onChange={e => setPass(e.target.value)} /></label>
          {mode === 'register' && <label>Repite la contraseña<input type="password" required minLength={8} value={pass2} onChange={e => setPass2(e.target.value)} /></label>}
          {msg && <div className="warn">{msg}</div>}
          <button className="btn primary" disabled={busy} type="submit">{busy ? '…' : mode === 'login' ? 'Entrar' : 'Registrarme'}</button>
        </form>
        <p className="muted">{mode === 'login' ? '¿No tienes cuenta?' : '¿Ya tienes cuenta?'} <button className="link" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setMsg(null); }}>{mode === 'login' ? 'Crear una' : 'Iniciar sesión'}</button></p>
        <p className="muted">Al iniciar sesión por primera vez, si la cuenta está vacía se suben los datos de este navegador; si ya tiene datos, se cargan aquí.</p>
      </div>
    );
  }

  const u = auth.user!;
  return (
    <>
      <h2>Perfil</h2>
      <div className="card">
        <div><b>Correo:</b> {u.email}</div>
        <div className="muted">Cuenta creada el {new Date(u.createdAt).toLocaleString()} · id {u.id}</div>
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn" onClick={() => pullAll().then(() => setMsg('Datos descargados de la cuenta')).catch(e => setMsg(e.message))}>⤓ Descargar de la cuenta</button>
          <button className="btn" onClick={() => pushAll().then(() => setMsg('Datos locales subidos')).catch(e => setMsg(e.message))}>⤒ Subir datos locales</button>
          <button className="btn" onClick={() => logout()}>Cerrar sesión</button>
        </div>
        {msg && <div className="muted" style={{ marginTop: 6 }}>{msg}</div>}
      </div>
      <h3>Cambiar contraseña</h3>
      <form className="card" onSubmit={async e => { e.preventDefault(); try { await changePassword(cur, next); setMsg('Contraseña cambiada'); setCur(''); setNext(''); } catch (err) { setMsg((err as Error).message); } }}>
        <label>Actual<input type="password" value={cur} onChange={e => setCur(e.target.value)} autoComplete="current-password" /></label>
        <label>Nueva (mín. 8)<input type="password" minLength={8} value={next} onChange={e => setNext(e.target.value)} autoComplete="new-password" /></label>
        <button className="btn" type="submit" disabled={!cur || next.length < 8}>Cambiar</button>
      </form>
      <h3>Zona de peligro</h3>
      <div className="card">
        <button className="btn danger" onClick={async () => { if (confirm('¿Eliminar tu cuenta y TODOS sus datos en la nube? Los datos de este navegador se conservan.')) await deleteAccount(); }}>Eliminar cuenta</button>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ API keys
function ApiKeys() {
  const auth = useAuth();
  const [keys, setKeys] = useState<ApiKeyInfo[]>([]); const [name, setName] = useState('');
  const [created, setCreated] = useState<NewApiKey | null>(null); const [err, setErr] = useState<string | null>(null);
  const refresh = () => listKeys().then(setKeys).catch(e => setErr(e.message));
  useEffect(() => { if (auth.status === 'auth') void refresh(); }, [auth.status]);
  if (auth.status !== 'auth') return <><h2>API keys</h2><p className="muted">Inicia sesión para crear API keys.</p></>;
  return (
    <>
      <h2>API keys</h2>
      <p className="muted">Una API key da acceso completo a tu cuenta por la API REST (crear diagramas, librerías, tipos, componentes, relaciones…). Envíala en la cabecera <code>Authorization: Bearer &lt;key&gt;</code>. Se muestra una sola vez.</p>
      <form className="row card" onSubmit={async e => { e.preventDefault(); setErr(null); try { const k = await createKey(name || 'API key'); setCreated(k); setName(''); await refresh(); } catch (e2) { setErr((e2 as Error).message); } }}>
        <label>Nombre<input value={name} placeholder="p. ej. agente Claude" onChange={e => setName(e.target.value)} /></label>
        <button className="btn primary" type="submit">+ Crear API key</button>
      </form>
      {created && (
        <div className="card keybox">
          <b>Nueva clave “{created.name}”</b> — cópiala ahora, no se volverá a mostrar:
          <div className="row"><input readOnly value={created.key} onFocus={e => e.currentTarget.select()} className="code" />
            <button className="btn" onClick={() => navigator.clipboard?.writeText(created.key)}>Copiar</button></div>
          <div className="muted">Prueba: <code>curl -H "Authorization: Bearer {created.key.slice(0, 12)}…" {apiUrl('/auth/me')}</code></div>
        </div>
      )}
      {err && <div className="warn">{err}</div>}
      <table className="table">
        <thead><tr><th>Nombre</th><th>Prefijo</th><th>Creada</th><th>Último uso</th><th /></tr></thead>
        <tbody>
          {keys.length === 0 && <tr><td colSpan={5} className="muted">Todavía no hay API keys.</td></tr>}
          {keys.map(k => (
            <tr key={k.id}><td>{k.name}</td><td><code>{k.prefix}…</code></td><td>{new Date(k.createdAt).toLocaleString()}</td><td>{k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : '—'}</td>
              <td><button className="btn danger" onClick={async () => { if (confirm(`¿Revocar la clave “${k.name}”?`)) { await deleteKey(k.id); await refresh(); } }}>Revocar</button></td></tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

// ------------------------------------------------------------------ Diagramas
function Diagramas() {
  const data = useStore(s => s.data); const navigate = useNavigate();
  const open = (id: string) => { actions.setCurrent(id); navigate(diagramPath(id)); };
  return (
    <>
      <div className="row between"><h2>Diagramas ({data.diagrams.length})</h2><button className="btn primary" onClick={() => { actions.newDiagram(); }}>+ Nuevo diagrama</button></div>
      <table className="table">
        <thead><tr><th>Nombre</th><th>Capas</th><th>Etapas</th><th>Instancias</th><th>Relaciones</th><th /></tr></thead>
        <tbody>
          {data.diagrams.map(d => (
            <tr key={d.id} className={d.id === data.currentDiagramId ? 'on' : ''}>
              <td><b>{d.name}</b>{d.description && <div className="muted small">{d.description.slice(0, 120)}</div>}</td>
              <td>{d.layers.length}</td><td>{d.stages.length}</td><td>{d.placements.length}</td><td>{d.relations.length}</td>
              <td className="actions-cell">
                <button className="btn" onClick={() => open(d.id)}>Abrir</button>
                <button className="btn" onClick={() => { actions.setCurrent(d.id); actions.duplicateDiagram(); }}>Duplicar</button>
                <button className="btn" onClick={() => exportDiagram(data, d)}>Exportar</button>
                <button className="btn danger" onClick={() => { actions.setCurrent(d.id); actions.deleteDiagram(); }}>Eliminar</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

// ------------------------------------------------------------------ Personas
function Personas() {
  const data = useStore(s => s.data);
  const select = useStore(s => s.select);
  const setUI = useStore(s => s.setUI);
  const navigate = useNavigate();
  const abrir = (id: string) => { select({ kind: 'person', id }); setUI({ tab: 'people', sidebarOpen: true, inspectorOpen: true }); navigate('/'); };
  const gente = [...data.people].sort((a, b) => a.name.localeCompare(b.name));
  const papeles = [...new Set(gente.flatMap(p => p.assignments.map(a => a.role)))].sort();
  return (
    <>
      <div className="row between"><h2>Personas ({gente.length})</h2><button className="btn primary" onClick={() => { actions.addPerson(); navigate('/'); }}>+ Nueva persona</button></div>
      <p className="muted">Quién participa en cada parte de la arquitectura y con qué papel. Se asignan desde el inspector de un componente o del diagrama, y con el clic derecho en una capa, una etapa o un tipo.</p>
      {gente.length === 0 && <p className="muted">Todavía no hay ninguna.</p>}
      {gente.length > 0 && (
        <table className="table">
          <thead><tr><th /><th>Nombre</th><th>Cargo</th><th>Equipo</th><th>Correo</th><th>Participa en</th><th /></tr></thead>
          <tbody>
            {gente.map(p => (
              <tr key={p.id}>
                <td><Avatar p={p} size={26} /></td>
                <td><b>{p.name}</b></td><td>{p.title || '—'}</td><td>{p.team || '—'}</td><td className="muted small">{p.email || '—'}</td>
                <td className="muted small">
                  {p.assignments.length === 0 ? '—' : p.assignments.slice(0, 4).map(a => {
                    const dg = targetDiagram(data, a);
                    return <div key={a.id}><b>{a.role}</b> · {ASSIGN_LABEL[a.kind].toLowerCase()} “{targetName(data, a) ?? '?'}”{dg ? ` (${dg.name})` : ''}</div>;
                  })}
                  {p.assignments.length > 4 && <div>y {p.assignments.length - 4} más…</div>}
                </td>
                <td className="actions-cell">
                  <button className="btn" onClick={() => abrir(p.id)}>Abrir</button>
                  <button className="btn danger" onClick={() => actions.deletePerson(p.id)}>Eliminar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {papeles.length > 0 && (
        <>
          <h3>Por papel</h3>
          <table className="table">
            <thead><tr><th>Papel</th><th>Personas</th></tr></thead>
            <tbody>
              {papeles.map(r => (
                <tr key={r}><td><b>{r}</b></td>
                  <td>{gente.filter(p => p.assignments.some(a => a.role === r)).map(p => (
                    <button key={p.id} className="person-chip as-button" onClick={() => abrir(p.id)}><Avatar p={p} size={18} />{p.name}</button>
                  ))}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}

// ------------------------------------------------------------------ Bibliotecas
function Bibliotecas() {
  const data = useStore(s => s.data); const setUI = useStore(s => s.setUI); const navigate = useNavigate();
  const uses = (libId: string) => { const lib = data.libraries.find(l => l.id === libId)!; const ids = new Set(lib.components.map(c => c.id)); return data.diagrams.filter(d => d.placements.some(p => ids.has(p.componentId))).length; };
  return (
    <>
      <div className="row between"><h2>Bibliotecas de componentes ({data.libraries.length})</h2><button className="btn primary" onClick={actions.newLibrary}>+ Nueva biblioteca</button></div>
      <table className="table">
        <thead><tr><th>Nombre</th><th>Tipos</th><th>Componentes</th><th>Usada en diagramas</th><th /></tr></thead>
        <tbody>
          {data.libraries.map(l => (
            <tr key={l.id}><td><b>{l.name}</b></td><td>{l.types.length}</td><td>{l.components.length}</td><td>{uses(l.id)}</td>
              <td className="actions-cell">
                <button className="btn" onClick={() => { setUI({ libFilter: l.id, tab: 'comps', sidebarOpen: true }); navigate('/'); }}>Ver en el tablero</button>
                <button className="btn" onClick={() => actions.renameLibrary(l.id)}>Renombrar</button>
                <button className="btn danger" onClick={() => actions.deleteLibrary(l.id)}>Eliminar</button>
              </td></tr>
          ))}
        </tbody>
      </table>
      <p className="muted">Las bibliotecas son globales: cualquier diagrama puede usar sus componentes y tipos. Un componente colocado en varios diagramas es el mismo (edítalo y cambia en todos); usa “Desvincular” en el inspector si quieres separarlo.</p>
    </>
  );
}

// ------------------------------------------------------------------ Tipos
function Tipos() {
  const data = useStore(s => s.data); const setUI = useStore(s => s.setUI); const navigate = useNavigate(); const select = useStore(s => s.select);
  const types = data.libraries.flatMap(l => l.types.map(t => ({ t, lib: l })));
  const used = (tid: string) => data.libraries.flatMap(l => l.components).filter(c => c.typeId === tid).length;
  return (
    <>
      <div className="row between"><h2>Tipos de componente ({types.length})</h2><div className="row"><button className="btn" onClick={actions.addType}>+ Tipo</button><button className="btn primary" onClick={actions.addApiType}>+ Tipo API (contrato)</button></div></div>
      <table className="table">
        <thead><tr><th /><th>Nombre</th><th>Biblioteca</th><th>Campos</th><th>Componentes</th><th /></tr></thead>
        <tbody>
          {types.map(({ t, lib }) => (
            <tr key={t.id}><td><span className="swatch" style={{ background: t.color }} />{t.icon}</td><td><b>{t.name}</b></td><td>{lib.name}</td>
              <td className="muted small">{t.fields.map(f => f.label).join(', ') || '—'}</td><td>{used(t.id)}</td>
              <td className="actions-cell">
                <button className="btn" onClick={() => { select({ kind: 'type', id: t.id }); setUI({ inspectorOpen: true, tab: 'types' }); navigate('/'); }}>Editar</button>
                <button className="btn danger" onClick={() => actions.deleteType(t.id)}>Eliminar</button>
              </td></tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

// ------------------------------------------------------------------ Configuración
function Config() {
  const ui = useStore(s => s.ui); const setUI = useStore(s => s.setUI); const data = useStore(s => s.data);
  return (
    <>
      <h2>Configuración</h2>
      <div className="card">
        <label>Tema<select value={ui.theme} onChange={e => setUI({ theme: e.target.value as typeof ui.theme })}><option value="system">Según el sistema</option><option value="light">Claro</option><option value="dark">Oscuro</option></select></label>
        <div className="row">
          <label>Ancho librería (px)<input type="number" min={200} max={720} value={ui.sidebarW} onChange={e => setUI({ sidebarW: Number(e.target.value) || 280 })} /></label>
          <label>Ancho inspector (px)<input type="number" min={260} max={720} value={ui.inspectorW} onChange={e => setUI({ inspectorW: Number(e.target.value) || 320 })} /></label>
        </div>
        <h4>Flecha por defecto</h4>
        <div className="row">
          <label>Estilo<select value={ui.link.style} onChange={e => setUI({ link: { ...ui.link, style: e.target.value as typeof ui.link.style } })}><option value="solid">Directa</option><option value="dashed">Troceada</option><option value="dotted">Punteada</option></select></label>
          <label>Color<input type="color" value={ui.link.color} onChange={e => setUI({ link: { ...ui.link, color: e.target.value } })} /></label>
          <label>Grosor<input type="number" min={1} max={8} value={ui.link.width} onChange={e => setUI({ link: { ...ui.link, width: Number(e.target.value) || 2 } })} /></label>
        </div>
      </div>
      <h3>Datos</h3>
      <div className="card row">
        <button className="btn" onClick={() => exportAll(data)}>⤒ Exportar todo (JSON)</button>
        <button className="btn" onClick={actions.importJson}>⤓ Importar JSON</button>
        <button className="btn danger" onClick={() => { if (confirm('¿Borrar TODOS los datos guardados en este navegador? (Si tienes cuenta, la nube no se toca.)')) { localStorage.removeItem('diagramador.v2'); location.reload(); } }}>Borrar datos locales</button>
      </div>
      <h3>Atajos</h3>
      <ul className="help">
        <li>Ctrl+Z deshacer · Supr borrar selección · Esc deseleccionar / salir de zen</li>
        <li>Ctrl+B librería · Ctrl+J inspector · Ctrl+Shift+F zen · flechas mueven la instancia seleccionada (Shift = 1 px)</li>
      </ul>
    </>
  );
}

// ------------------------------------------------------------------ Agentes / API
function Agentes() {
  const base = apiUrl('');
  return (
    <>
      <h2>Agentes y API REST</h2>
      <p>Toda la funcionalidad está disponible por API. Un agente de IA (o cualquier script) sólo necesita tu <b>API key</b>: con ella puede crear y editar diagramas, bibliotecas, tipos, componentes, instancias y relaciones.</p>
      <div className="card">
        <div><b>Base URL:</b> <code>{base}</code></div>
        <div><b>Autenticación:</b> <code>Authorization: Bearer dgk_…</code></div>
        <div><b>Guía para agentes (Markdown):</b> <a href="/agent.md" target="_blank" rel="noreferrer">{location.origin}/agent.md</a> — dásela al agente junto con la API key.</div>
        <div><b>Especificación OpenAPI:</b> <a href="/openapi.json" target="_blank" rel="noreferrer">{location.origin}/openapi.json</a></div>
      </div>
      <h3>Ejemplo</h3>
      <pre className="code-block">{`# quién soy
curl -H "Authorization: Bearer $DIAGRAMADOR_API_KEY" ${base}/auth/me

# crear un diagrama desde la plantilla Aliados
curl -X POST -H "Authorization: Bearer $DIAGRAMADOR_API_KEY" -H "Content-Type: application/json" \\
  -d '{"name":"Mi arquitectura"}' ${base}/templates/aliados/apply

# listar diagramas
curl -H "Authorization: Bearer $DIAGRAMADOR_API_KEY" ${base}/diagrams`}</pre>
      <h3>Recursos</h3>
      <ul className="help">
        <li><code>/libraries</code> · <code>/libraries/:id/types</code> · <code>/libraries/:id/components</code></li>
        <li><code>/diagrams</code> · <code>/diagrams/:id/layers</code> · <code>/stages</code> · <code>/placements</code> · <code>/relations</code></li>
        <li><code>/export</code>, <code>/diagrams/:id/export</code>, <code>/import</code>, <code>/templates/aliados/apply</code>, <code>/api-keys</code></li>
      </ul>
      <p className="muted">Instrucciones típicas para un agente: “Usa la API de Drawer en {base} con la key X. Lee primero {location.origin}/agent.md.”</p>
    </>
  );
}
