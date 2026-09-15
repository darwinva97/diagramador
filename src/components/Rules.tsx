/**
 * Editor de reglas de estilo: condiciones, qué se pinta y prioridad.
 * La resolución en sí vive en `lib/rules.ts`; aquí sólo se edita y se explica.
 */
import { useStore } from '../store';
import { actions } from '../actions';
import { findType } from '../lib/model';
import { overriddenBy, resolveStyle, ruleImpact, styleToCss } from '../lib/rules';
import {
  OPS_SIN_VALOR, RULE_OPS, RULE_SOURCES, STYLE_PARTS,
  type Condition, type RuleOp, type RuleSource, type RuleStyle, type StyleRule,
} from '../types';

const DEFECTO: Record<string, string | number | boolean> = {
  bg: '#dcfce7', text: '#0f172a', border: '#16a34a', borderWidth: 2, borderStyle: 'solid',
  accent: '#16a34a', accentWidth: 5, top: '#16a34a', topWidth: 4, opacity: 0.5,
  glow: '#16a34a', badge: '#dc2626', badgeText: '!', icon: '🔶', bold: true, strike: true,
};

/** Muestra pequeña de cómo queda un componente con ese estilo. */
export function RulePreview({ style, label = 'Ejemplo' }: { style: RuleStyle; label?: string }) {
  const css = styleToCss(style);
  return (
    <div className="rule-preview">
      <div className={'comp static' + (css.className ? ' ' + css.className : '')} style={{ ...css.style, ['--c' as string]: '#94a3b8' }}>
        <div className="comp-head">
          <span className="icon">{style.icon || '▫️'}</span>
          <span className="txt"><span className="label">{label}</span></span>
          {style.badge && <span className="r-badge" style={{ background: style.badge }}>{style.badgeText ?? ''}</span>}
        </div>
      </div>
    </div>
  );
}

function CondRow({ rule, idx, cond }: { rule: StyleRule; idx: number; cond: Condition }) {
  const data = useStore(s => s.data);
  const snapshot = useStore(s => s.snapshot);
  // claves de campo disponibles en todos los tipos, para elegir sin escribir a mano
  const claves = [...new Map(data.libraries.flatMap(l => l.types).flatMap(t => t.fields.map(f => [f.key, f.label] as const))).entries()];
  const upd = (patch: Partial<Condition>) => actions.updateCondition(rule.id, idx, patch);
  const sinValor = OPS_SIN_VALOR.includes(cond.op);
  // valores ya usados en ese campo, para ofrecerlos
  const valores = cond.source === 'field' && cond.key
    ? [...new Set(data.libraries.flatMap(l => l.components).map(c => String(c.fields[cond.key!] ?? '')).filter(Boolean))].sort()
    : [];
  return (
    <div className="cond-row">
      <select value={cond.source} onChange={e => upd({ source: e.target.value as RuleSource })}>
        {Object.entries(RULE_SOURCES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      {cond.source === 'field' && (
        <input list={`claves-${rule.id}-${idx}`} value={cond.key ?? ''} placeholder="clave del campo"
          onFocus={snapshot} onChange={e => upd({ key: e.target.value })} />
      )}
      <datalist id={`claves-${rule.id}-${idx}`}>{claves.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</datalist>
      <select value={cond.op} onChange={e => upd({ op: e.target.value as RuleOp })}>
        {Object.entries(RULE_OPS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      {!sinValor && (
        <input list={`vals-${rule.id}-${idx}`} value={cond.value ?? ''} placeholder={cond.op === 'in' ? 'valor 1, valor 2…' : 'valor'}
          onFocus={snapshot} onChange={e => upd({ value: e.target.value })} />
      )}
      <datalist id={`vals-${rule.id}-${idx}`}>{valores.map(v => <option key={v} value={v} />)}</datalist>
      <button className="btn icon danger" title="Quitar condición" onClick={() => actions.deleteCondition(rule.id, idx)}>×</button>
    </div>
  );
}

export function RulePanel({ r }: { r: StyleRule }) {
  const data = useStore(s => s.data);
  const snapshot = useStore(s => s.snapshot);
  const select = useStore(s => s.select);
  const afecta = ruleImpact(data, r);
  const pisadas = overriddenBy(data, r);
  const orden = [...data.rules].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
  const pos = orden.findIndex(x => x.id === r.id);

  const activa = (k: keyof RuleStyle) => r.style[k] !== undefined;
  const alternar = (k: keyof RuleStyle) => actions.setRuleStyle(r.id, { [k]: activa(k) ? undefined : DEFECTO[k] } as RuleStyle, true);

  return (
    <>
      <div className="insp-head" style={{ ['--c' as string]: r.style.accent ?? r.style.border ?? r.style.bg ?? '#94a3b8' }}>
        <span className="icon big">🎨</span><h3>Regla de estilo</h3>
      </div>
      <label>Nombre<input value={r.name} onFocus={snapshot} onChange={e => actions.updateRule(r.id, { name: e.target.value })} /></label>
      <div className="row">
        <label className="chk"><input type="checkbox" checked={r.enabled} onChange={e => actions.updateRule(r.id, { enabled: e.target.checked }, true)} /> Activa</label>
        <label>Prioridad<input type="number" value={r.priority} onFocus={snapshot}
          onChange={e => actions.updateRule(r.id, { priority: Number(e.target.value) || 0 })} title="Mayor número = manda sobre las demás" /></label>
        <button className="btn icon" disabled={pos <= 0} onClick={() => actions.moveRule(r.id, -1)} title="Menos prioridad">↓</button>
        <button className="btn icon" disabled={pos < 0 || pos >= orden.length - 1} onClick={() => actions.moveRule(r.id, 1)} title="Más prioridad">↑</button>
      </div>
      <label>Se aplica en
        <select value={r.diagramId ?? ''} onChange={e => actions.updateRule(r.id, { diagramId: e.target.value || null }, true)}>
          <option value="">Todos los diagramas</option>
          {data.diagrams.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      </label>

      <h4>Condiciones ({r.conditions.length})</h4>
      <label>Debe cumplirse
        <select value={r.match} onChange={e => actions.updateRule(r.id, { match: e.target.value as 'all' | 'any' }, true)}>
          <option value="all">Todas las condiciones</option>
          <option value="any">Alguna condición</option>
        </select>
      </label>
      {r.conditions.map((c, i) => <CondRow key={i} rule={r} idx={i} cond={c} />)}
      <button className="btn" onClick={() => actions.addCondition(r.id)}>+ Añadir condición</button>
      <div className={'notice' + (afecta ? ' ok' : '')}>
        {r.conditions.length === 0
          ? 'Sin condiciones la regla no pinta nada. Añade al menos una.'
          : `Ahora mismo casa con ${afecta} componente(s).`}
      </div>

      <h4>Qué se pinta</h4>
      <RulePreview style={r.style} />
      <div className="style-grid">
        {STYLE_PARTS.map(({ key, label, kind }) => (
          <div key={key} className={'style-row' + (activa(key) ? ' on' : '')}>
            <label className="chk"><input type="checkbox" checked={activa(key)} onChange={() => alternar(key)} /> {label}</label>
            {activa(key) && kind === 'color' && (
              <input type="color" value={String(r.style[key] ?? '#000000')} onFocus={snapshot}
                onChange={e => actions.setRuleStyle(r.id, { [key]: e.target.value } as RuleStyle)} />
            )}
            {activa(key) && kind === 'number' && (
              <input type="number" step={key === 'opacity' ? 0.1 : 1} min={0} max={key === 'opacity' ? 1 : 20}
                value={Number(r.style[key] ?? 0)} onFocus={snapshot}
                onChange={e => actions.setRuleStyle(r.id, { [key]: Number(e.target.value) } as RuleStyle)} />
            )}
            {activa(key) && kind === 'text' && (
              <input value={String(r.style[key] ?? '')} maxLength={key === 'icon' ? 4 : 6} onFocus={snapshot}
                onChange={e => actions.setRuleStyle(r.id, { [key]: e.target.value } as RuleStyle)} />
            )}
            {activa(key) && kind === 'select' && (
              <select value={String(r.style[key] ?? 'solid')} onChange={e => actions.setRuleStyle(r.id, { [key]: e.target.value } as RuleStyle, true)}>
                <option value="solid">Continuo</option><option value="dashed">Troceado</option><option value="dotted">Punteado</option>
              </select>
            )}
          </div>
        ))}
      </div>

      {pisadas.length > 0 && (
        <>
          <h4>Se la pisan ({pisadas.length})</h4>
          <div className="muted small">Estas reglas tienen más prioridad y ganan en las propiedades indicadas.</div>
          {pisadas.map(({ rule, props }) => (
            <div key={rule.id} className="assign-row">
              <button className="chip-btn" onClick={() => select({ kind: 'rule', id: rule.id })}>{rule.name} <small>({rule.priority})</small></button>
              <span className="muted small">{props.join(', ')}</span>
            </div>
          ))}
        </>
      )}

      <div className="actions">
        <button className="btn" onClick={() => actions.duplicateRule(r.id)}>⧉ Duplicar</button>
        <button className="btn danger" onClick={() => actions.deleteRule(r.id)}>Eliminar regla</button>
      </div>
    </>
  );
}

/** Reglas que están pintando un componente concreto, para el inspector del componente. */
export function RulesOf({ componentId }: { componentId: string }) {
  const data = useStore(s => s.data);
  const select = useStore(s => s.select);
  const comp = data.libraries.flatMap(l => l.components).find(c => c.id === componentId);
  if (!comp) return null;
  const { style, rules } = resolveStyle(data, comp);
  if (rules.length === 0) return null;
  return (
    <>
      <h4>Reglas que lo pintan ({rules.length})</h4>
      <RulePreview style={style} label={comp.name} />
      <div className="people-row">
        {rules.map(r => (
          <button key={r.id} className="chip-btn" onClick={() => select({ kind: 'rule', id: r.id })}
            title={`Prioridad ${r.priority}. Las últimas mandan.`}>{r.name}</button>
        ))}
      </div>
    </>
  );
}

/** Atajo: crear una regla por cada valor de un campo de tipo lista. */
export function RulesFromFieldButton() {
  const data = useStore(s => s.data);
  const campos = [...new Map(data.libraries.flatMap(l => l.types).flatMap(t =>
    t.fields.filter(f => f.kind === 'select').map(f => [f.key, f] as const))).values()];
  if (campos.length === 0) return null;
  const crear = (key: string) => {
    const f = campos.find(x => x.key === key)!;
    const deOpciones = (f.options ?? '').split(',').map(x => x.trim()).filter(Boolean);
    const deDatos = [...new Set(data.libraries.flatMap(l => l.components).map(c => String(c.fields[key] ?? '')).filter(Boolean))];
    const valores = [...new Set([...deOpciones, ...deDatos])];
    const n = actions.rulesFromField(key, f.label, valores);
    if (n === 0) alert(`El campo "${f.label}" no tiene valores con los que crear reglas.`);
  };
  return (
    <select className="examples" value="" onChange={e => { if (e.target.value) crear(e.target.value); e.target.value = ''; }}
      title="Crea una regla por cada valor del campo elegido, con un color distinto">
      <option value="">⚡ Reglas desde un campo…</option>
      {campos.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
    </select>
  );
}

/** Tipo del componente, usado por la lista del panel lateral. */
export const typeNameOf = (data: ReturnType<typeof useStore.getState>['data'], typeId: string | null) =>
  findType(data, typeId)?.name ?? '';
