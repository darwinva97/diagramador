/**
 * Reglas de estilo condicional: deciden cómo se pinta cada componente según sus datos.
 *
 * Una regla casa cuando sus condiciones se cumplen (todas o alguna). Las que casan se
 * aplican de menor a mayor `priority`, así que **la de mayor prioridad manda** sobre las
 * propiedades que también define; las que no toca las conserva la anterior.
 */
import type { AppData, Component, Condition, RuleStyle, StyleRule } from '../types';
import { OPS_SIN_VALOR } from '../types';
import { findType, libOfComp } from './model';

const norm = (v: unknown) => String(v ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

/** Texto plano de un valor de campo, sirva del tipo que sirva (lista, clave→valor, JSON…). */
export function fieldText(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.map(x => (x && typeof x === 'object' && 'key' in (x as object))
    ? `${(x as { key: string }).key}=${(x as { value: string }).value}` : String(x)).join(', ');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/** Valores que la condición debe comparar (una condición sobre personas produce varios). */
function valuesOf(d: AppData, c: Component, cond: Condition): string[] {
  switch (cond.source) {
    case 'field': return [fieldText(c.fields[cond.key ?? ''])];
    case 'name': return [c.name];
    case 'description': return [c.description ?? ''];
    case 'type': return [findType(d, c.typeId)?.name ?? ''];
    case 'library': return [libOfComp(d, c.id)?.name ?? ''];
    case 'people': return d.people.filter(p => p.assignments.some(a => a.kind === 'component' && a.targetId === c.id)).map(p => p.name);
    case 'role': return d.people.flatMap(p => p.assignments.filter(a => a.kind === 'component' && a.targetId === c.id).map(a => a.role));
  }
}

function compare(raw: string, cond: Condition): boolean {
  const cs = !!cond.caseSensitive;
  const a = cs ? raw.trim() : norm(raw);
  const b = cs ? (cond.value ?? '').trim() : norm(cond.value);
  switch (cond.op) {
    case 'eq': return a === b;
    case 'ne': return a !== b;
    case 'contains': return !!b && a.includes(b);
    case 'notContains': return !b || !a.includes(b);
    case 'in': return (cond.value ?? '').split(',').map(x => cs ? x.trim() : norm(x)).filter(Boolean).includes(a);
    case 'empty': return a === '';
    case 'notEmpty': return a !== '';
    case 'gt': return Number(raw) > Number(cond.value);
    case 'lt': return Number(raw) < Number(cond.value);
    case 'regex': try { return new RegExp(cond.value ?? '', cs ? '' : 'i').test(raw); } catch { return false; }
  }
}

/** ¿Se cumple la condición? Con varios valores (personas, papeles) basta con que uno case. */
export function condMatches(d: AppData, c: Component, cond: Condition): boolean {
  const vals = valuesOf(d, c, cond);
  if (vals.length === 0) return OPS_SIN_VALOR.includes(cond.op) ? compare('', cond) : cond.op === 'ne' || cond.op === 'notContains';
  return vals.some(v => compare(v, cond));
}

export function ruleMatches(d: AppData, c: Component, rule: StyleRule, diagramId?: string | null): boolean {
  if (!rule.enabled) return false;
  if (rule.diagramId && diagramId && rule.diagramId !== diagramId) return false;
  if (rule.conditions.length === 0) return false; // una regla sin condiciones no pinta nada
  return rule.match === 'any'
    ? rule.conditions.some(x => condMatches(d, c, x))
    : rule.conditions.every(x => condMatches(d, c, x));
}

/** Reglas que casan con un componente, ya ordenadas de menor a mayor prioridad. */
export function matchingRules(d: AppData, c: Component, diagramId?: string | null): StyleRule[] {
  return (d.rules ?? [])
    .filter(r => ruleMatches(d, c, r, diagramId))
    .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
}

/** Estilo final: se fusionan las reglas por prioridad, y la última gana propiedad a propiedad. */
export function resolveStyle(d: AppData, c: Component, diagramId?: string | null): { style: RuleStyle; rules: StyleRule[] } {
  const rules = matchingRules(d, c, diagramId);
  const style: RuleStyle = {};
  for (const r of rules)
    for (const [k, v] of Object.entries(r.style))
      if (v !== undefined && v !== '') (style as Record<string, unknown>)[k] = v;
  return { style, rules };
}

/** Cuántos componentes casan con una regla (para enseñarlo mientras se edita). */
export function ruleImpact(d: AppData, rule: StyleRule): number {
  return d.libraries.flatMap(l => l.components).filter(c => ruleMatches(d, c, rule)).length;
}

/** Propiedades que otra regla de mayor prioridad le está pisando a ésta. */
export function overriddenBy(d: AppData, rule: StyleRule): { rule: StyleRule; props: string[] }[] {
  const mias = Object.keys(rule.style).filter(k => (rule.style as Record<string, unknown>)[k] !== undefined);
  return (d.rules ?? [])
    .filter(r => r.id !== rule.id && r.enabled && (r.priority ?? 0) > (rule.priority ?? 0))
    .map(r => ({ rule: r, props: mias.filter(k => (r.style as Record<string, unknown>)[k] !== undefined) }))
    .filter(x => x.props.length > 0);
}

/** Estilo en línea + clases para pintar un componente del tablero. */
export function styleToCss(s: RuleStyle): { style: React.CSSProperties; className: string } {
  const css: Record<string, string | number> = {};
  if (s.bg) css['--r-bg'] = s.bg;
  if (s.text) css['--r-text'] = s.text;
  if (s.border) css['--r-border'] = s.border;
  if (s.borderWidth !== undefined) css['--r-border-w'] = `${s.borderWidth}px`;
  if (s.borderStyle) css['--r-border-s'] = s.borderStyle;
  if (s.accent) css['--r-accent'] = s.accent;
  if (s.accentWidth !== undefined) css['--r-accent-w'] = `${s.accentWidth}px`;
  if (s.top) css['--r-top'] = s.top;
  if (s.topWidth !== undefined) css['--r-top-w'] = `${s.topWidth}px`;
  if (s.opacity !== undefined) css['--r-opacity'] = s.opacity;
  if (s.glow) css['--r-glow'] = s.glow;
  const cls = [s.bg && 'r-bg', s.text && 'r-text', s.border && 'r-border', s.accent && 'r-accent',
    s.top && 'r-top', s.opacity !== undefined && 'r-opacity', s.glow && 'r-glow',
    s.bold && 'r-bold', s.strike && 'r-strike'].filter(Boolean).join(' ');
  return { style: css as React.CSSProperties, className: cls };
}
