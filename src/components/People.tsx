/**
 * Personas: avatar, chips de participación y el diálogo para asignar a alguien
 * a un componente, un diagrama, una capa, una etapa o un tipo.
 */
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { useStore } from '../store';
import { actions } from '../actions';
import { initials, participants } from '../lib/model';
import { ROLES, type AssignKind, type Person } from '../types';

export function Avatar({ p, size = 22, title }: { p: Person; size?: number; title?: string }) {
  return (
    <span className="avatar" title={title ?? `${p.name}${p.title ? ` · ${p.title}` : ''}`}
      style={{ ['--pc' as string]: p.color ?? '#94a3b8', width: size, height: size, fontSize: Math.round(size * 0.42) }}>
      {initials(p.name)}
    </span>
  );
}

// ---------------------------------------------------------------- diálogo de asignación
interface PickerState { kind: AssignKind; targetId: string; label: string }
const usePicker = create<{ open: PickerState | null }>(() => ({ open: null }));
/** Abre el diálogo para asignar personas a algo. */
export const openAssign = (kind: AssignKind, targetId: string, label: string) =>
  usePicker.setState({ open: { kind, targetId, label } });

export function AssignDialog() {
  const open = usePicker(s => s.open);
  const people = useStore(s => s.data.people);
  const data = useStore(s => s.data);
  const [q, setQ] = useState('');
  const [role, setRole] = useState('Owner');
  const close = () => usePicker.setState({ open: null });

  useEffect(() => { if (open) { setQ(''); setRole('Owner'); } }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open]);

  if (!open) return null;
  const yaEstan = participants(data, open.kind, open.targetId);
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const lista = people.filter(p => !q.trim() || [p.name, p.email, p.title, p.team].some(v => norm(String(v ?? '')).includes(norm(q))));
  const sugerencias = [...new Set([...ROLES, ...actions.usedRoles()])];

  return (
    <div className="modal-bg" onClick={close}>
      <div className="modal narrow" role="dialog" aria-label="Asignar persona" onClick={e => e.stopPropagation()}>
        <div className="row between"><h2>Personas en “{open.label}”</h2><button className="btn" onClick={close} title="Cerrar (Esc)">✕</button></div>

        {yaEstan.length > 0 && (
          <div className="assigned">
            {yaEstan.map(({ person, assignment }) => (
              <span key={assignment.id} className="person-chip">
                <Avatar p={person} size={18} />
                {person.name}
                <input className="role-inline" list="roles-sugeridos" value={assignment.role}
                  onChange={e => actions.updateAssignment(person.id, assignment.id, { role: e.target.value })} />
                <button className="x" title="Quitar" onClick={() => actions.unassign(person.id, assignment.id)}>×</button>
              </span>
            ))}
          </div>
        )}

        <div className="row">
          <label style={{ flex: 2 }}>Papel
            <input list="roles-sugeridos" value={role} onChange={e => setRole(e.target.value)} placeholder="Owner, Líder técnico…" />
          </label>
          <label style={{ flex: 3 }}>Buscar persona
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Nombre, correo, equipo…" autoFocus />
          </label>
        </div>
        <datalist id="roles-sugeridos">{sugerencias.map(r => <option key={r} value={r} />)}</datalist>

        <div className="picker-list">
          {lista.length === 0 && <div className="empty-sm">No hay personas que coincidan.</div>}
          {lista.map(p => {
            const ya = yaEstan.some(x => x.person.id === p.id && x.assignment.role === role);
            return (
              <button key={p.id} className="picker-item" disabled={ya}
                title={ya ? `Ya está aquí como ${role}` : `Añadir como ${role || 'Participante'}`}
                onClick={() => actions.assign(p.id, open.kind, open.targetId, role.trim() || 'Participante')}>
                <Avatar p={p} size={26} />
                <span className="txt"><b>{p.name}</b><small>{[p.title, p.team, p.email].filter(Boolean).join(' · ') || 'Sin datos'}</small></span>
                <span className="plus">{ya ? '✓' : '+'}</span>
              </button>
            );
          })}
        </div>
        <button className="btn primary" onClick={() => { const id = actions.addPerson(q.trim() || undefined); actions.assign(id, open.kind, open.targetId, role.trim() || 'Participante'); close(); }}>
          + Crear persona{q.trim() ? ` “${q.trim()}”` : ''} y asignarla
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- resumen reutilizable
/** Fila de personas de algo, con botón para gestionar. Se usa en el inspector. */
export function PeopleOf({ kind, targetId, label }: { kind: AssignKind; targetId: string; label: string }) {
  const data = useStore(s => s.data);
  const select = useStore(s => s.select);
  const lista = participants(data, kind, targetId);
  return (
    <>
      <h4>Personas ({lista.length})</h4>
      <div className="people-row">
        {lista.length === 0 && <span className="muted">Nadie asignado todavía.</span>}
        {lista.map(({ person, assignment }) => (
          <button key={assignment.id} className="person-chip as-button" onClick={() => select({ kind: 'person', id: person.id })}
            title={`${person.name} · ${assignment.role}${person.email ? ` · ${person.email}` : ''}`}>
            <Avatar p={person} size={18} />
            {person.name}<small>{assignment.role}</small>
          </button>
        ))}
      </div>
      <button className="btn" onClick={() => openAssign(kind, targetId, label)}>👥 Asignar personas…</button>
    </>
  );
}
