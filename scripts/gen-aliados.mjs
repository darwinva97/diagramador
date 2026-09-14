// Genera ejemplos/aliados.json a partir de la imagen de referencia (arquitectura "Aliados").
// Ejecutar: node scripts/gen-aliados.mjs
import { writeFileSync } from 'node:fs';

const LIB = 'lib-aliados';
const types = {
  sub:  { id: 'ty-subproceso', name: 'Subproceso', color: '#ca8a04', icon: '⇨', fields: [
    { key: 'descripcion', label: 'Descripción', kind: 'textarea' }, { key: 'responsable', label: 'Responsable', kind: 'text' } ] },
  api:  { id: 'ty-api', name: 'API', color: '#2563eb', icon: '🔌', fields: [
    { key: 'capa', label: 'Capa', kind: 'select', options: 'EXP, PROC, SD, SYS' },
    { key: 'estado', label: 'Estado', kind: 'select', options: 'Existente, Nuevo, Modificado' },
    { key: 'endpoint', label: 'Endpoint', kind: 'text' }, { key: 'version', label: 'Versión', kind: 'text' } ] },
  ms:   { id: 'ty-microservicio', name: 'Microservicio', color: '#0f766e', icon: '⚙️', fields: [
    { key: 'capa', label: 'Capa', kind: 'select', options: 'EXP, PROC, SD, SYS' },
    { key: 'estado', label: 'Estado', kind: 'select', options: 'Existente, Nuevo, Modificado' },
    { key: 'tecnologia', label: 'Tecnología', kind: 'text' }, { key: 'repositorio', label: 'Repositorio', kind: 'url' } ] },
  sys:  { id: 'ty-backend', name: 'Sistema backend', color: '#7c3aed', icon: '🖥️', fields: [
    { key: 'proveedor', label: 'Proveedor / plataforma', kind: 'text' },
    { key: 'estado', label: 'Estado', kind: 'select', options: 'Existente, Nuevo, Modificado' } ] },
  sto:  { id: 'ty-almacenamiento', name: 'Almacenamiento', color: '#059669', icon: '🗄️', fields: [
    { key: 'tipo', label: 'Tipo', kind: 'select', options: 'Base de datos, Storage, MFT, Tópico' },
    { key: 'motor', label: 'Motor / tecnología', kind: 'text' } ] },
};

const components = [];
const C = (id, name, t, fields = {}, description = '') => { components.push({ id, name, typeId: types[t].id, description, fields }); return id; };
// Color en la imagen -> estado (supuesto): gris = Existente, amarillo = Nuevo, celeste = Modificado
const EXI = 'Existente', NUE = 'Nuevo', MOD = 'Modificado';

// Subprocesos
C('sp-registro', 'Registro de Prospectos', 'sub'); C('sp-consentimiento', 'Consentimiento PDP', 'sub');
C('sp-consulta', 'Consulta de Campaña', 'sub'); C('sp-validacion', 'Validación Base Negativa', 'sub'); C('sp-reglas', 'Aplicar Reglas de Riesgo', 'sub');
C('sp-simular', 'Simular condiciones', 'sub'); C('sp-derivar', 'Derivar lead', 'sub'); C('sp-lectura', 'Lectura de estado', 'sub');
// APIs / microservicios de experiencia
C('aexp-registro', '[API EXP] Registro de Prospecto', 'api', { capa: 'EXP', estado: EXI }); C('mexp-registro', '[MIC EXP] Registro de Prospecto', 'ms', { capa: 'EXP', estado: EXI });
C('aexp-consentimiento', '[API EXP] Consentimiento PDP', 'api', { capa: 'EXP', estado: EXI }); C('mexp-consentimiento', '[MIC EXP] Consentimiento PDP', 'ms', { capa: 'EXP', estado: EXI });
C('aexp-consulta', '[API EXP] Consulta campaña', 'api', { capa: 'EXP', estado: NUE }); C('mexp-consulta', '[MIC EXP] Consulta campaña', 'ms', { capa: 'EXP', estado: NUE });
C('aexp-validacion', '[API EXP] Validación Base Negativa', 'api', { capa: 'EXP', estado: NUE }); C('mexp-validacion', '[MIC EXP] Validación Base Negativa', 'ms', { capa: 'EXP', estado: NUE });
C('aexp-reglas', '[API EXP] Aplicar Reglas de Riesgo', 'api', { capa: 'EXP', estado: NUE }); C('mexp-reglas', '[MIC EXP] Aplicar Reglas de Riesgo', 'ms', { capa: 'EXP', estado: NUE });
C('aexp-simular', '[API EXP] Simular condiciones', 'api', { capa: 'EXP', estado: NUE }); C('mexp-simular', '[MIC EXP] Simular condiciones', 'ms', { capa: 'EXP', estado: NUE });
C('aexp-derivar', '[API EXP] Derivar a CRM', 'api', { capa: 'EXP', estado: NUE }); C('mexp-derivar', '[MIC EXP] Derivar a CRM', 'ms', { capa: 'EXP', estado: NUE });
C('aexp-lectura', '[API EXP] Lectura de Estado', 'api', { capa: 'EXP', estado: NUE }); C('mexp-lectura', '[MIC EXP] Lectura de Estado', 'ms', { capa: 'EXP', estado: NUE });
// Proceso
C('aproc-riesgos', '[API PROC] Evaluación de Riesgos', 'api', { capa: 'PROC', estado: MOD }); C('mproc-riesgos', '[MSI PROC] Evaluación de Riesgos', 'ms', { capa: 'PROC', estado: MOD });
C('aproc-simulador', '[API PROC] Simulador', 'api', { capa: 'PROC', estado: MOD }); C('mproc-simulador', '[MSI PROC] Simulador', 'ms', { capa: 'PROC', estado: MOD });
// Negocio (SD)
C('asd-party', '[API SD] Party Reference Data Directory', 'api', { capa: 'SD', estado: EXI }); C('msd-party', '[MS SD] Party Reference Data Directory', 'ms', { capa: 'SD', estado: EXI });
C('asd-customer', '[API SD] Customer Agreement', 'api', { capa: 'SD', estado: EXI }); C('msd-customer', '[MS SD] Customer Agreement', 'ms', { capa: 'SD', estado: EXI });
C('asd-lead', '[API SD] Lead & Opportunity Management', 'api', { capa: 'SD', estado: MOD }, 'Se usa en Evaluación y en Derivación (misma API).');
C('msd-lead', '[MS SD] Lead & Opportunity Management', 'ms', { capa: 'SD', estado: MOD });
// Sistema (SYS)
C('asys-party', '[API SYS] Party Reference Data Directory', 'api', { capa: 'SYS', estado: EXI }); C('asys-customer', '[API SYS] Customer Agreement', 'api', { capa: 'SYS', estado: EXI });
C('asys-lead', '[API SYS] Lead & Opportunity Management', 'api', { capa: 'SYS', estado: NUE }); C('asys-lectura', '[API SYS] Lectura de estado', 'api', { capa: 'SYS', estado: NUE });
C('msys-alta-persona', '[MS SYS] Alta Persona', 'ms', { capa: 'SYS', estado: EXI }); C('msys-alta-direcciones', '[MS SYS] Alta Direcciones - Referencias', 'ms', { capa: 'SYS', estado: EXI });
C('msys-geo', '[MS SYS] Geolocalización', 'ms', { capa: 'SYS', estado: EXI }); C('msys-leypdp', '[MS SYS] Ley PDP', 'ms', { capa: 'SYS', estado: EXI });
C('msys-lead', '[MS SYS] Lead & Opportunity Management', 'ms', { capa: 'SYS', estado: NUE }); C('msys-lectura', '[MS SYS] Lectura estado', 'ms', { capa: 'SYS', estado: NUE });
// Backend
C('be-bd-aliados', 'BD Aliados', 'sto', { tipo: 'Base de datos' }); C('be-mft', 'MFT', 'sto', { tipo: 'MFT' }); C('be-crm-analitica', 'CRM / Analítica', 'sys');
C('be-clientes', 'Clientes', 'sys'); C('be-distribuidor', 'Distribuidor Leads', 'sys'); C('be-riesgos', 'RIESGOS', 'sys'); C('be-activos', 'Activos', 'sys');
C('be-crm', 'CRM', 'sys'); C('be-analitica', 'Plataforma Analítica', 'sys'); C('be-eventos', 'Plataforma Eventos', 'sys'); C('be-topico', 'Tópico estado', 'sto', { tipo: 'Tópico' });

// ---- Diagrama
const stages = [
  { id: 'st-aliados', name: 'Aliados', width: 940 }, { id: 'st-consentimiento', name: 'Consentimiento', width: 320 },
  { id: 'st-evaluacion', name: 'Evaluación', width: 940 }, { id: 'st-simulacion', name: 'Simulación', width: 300 },
  { id: 'st-derivacion', name: 'Derivación', width: 640 },
];
const layers = [
  { id: 'ly-sub', name: 'Sub Procesos', color: '#fef9c3' },
  { id: 'ly-api-exp', name: 'APIs Experiencia (+ microservicios)', color: '#e0f2fe' },
  { id: 'ly-api-proc', name: 'APIs Proceso (+ microservicios)', color: '#ccfbf1' },
  { id: 'ly-api-sd', name: 'APIs Negocio (+ microservicios)', color: '#e0f2fe' },
  { id: 'ly-api-sys', name: 'APIs Sistema SYS (+ microservicios)', color: '#ccfbf1' },
  { id: 'ly-backend', name: 'BACKEND', color: '#ede9fe' },
];
const S = Object.fromEntries(stages.map(s => [s.name.split(' ')[0].normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(), s.id]));
const placements = [];
// P(id de instancia, componente, capa, etapa, columna horizontal 0..2, fila vertical 0..2)
const P = (pid, cid, ly, st, col = 0, row = 0) => { placements.push({ id: pid, componentId: cid, layerId: ly, stageId: st, x: 8 + col * 304, y: 8 + row * 40, parentId: null }); return pid; };
// IN(id de instancia, componente, instancia contenedora): subcomponente dentro de otra instancia
const IN = (pid, cid, parentPid) => { const par = placements.find(p => p.id === parentPid); placements.push({ id: pid, componentId: cid, layerId: par.layerId, stageId: par.stageId, x: 0, y: 0, parentId: parentPid }); return pid; };
const A = S.aliados, CO = S.consentimiento, E = S.evaluacion, SI = S.simulacion, D = S.derivacion;

// Sub procesos
P('p-sp-registro', 'sp-registro', 'ly-sub', A); P('p-sp-consentimiento', 'sp-consentimiento', 'ly-sub', CO);
P('p-sp-consulta', 'sp-consulta', 'ly-sub', E, 0); P('p-sp-validacion', 'sp-validacion', 'ly-sub', E, 1); P('p-sp-reglas', 'sp-reglas', 'ly-sub', E, 2);
P('p-sp-simular', 'sp-simular', 'ly-sub', SI); P('p-sp-derivar', 'sp-derivar', 'ly-sub', D, 0); P('p-sp-lectura', 'sp-lectura', 'ly-sub', D, 1);
// APIs de experiencia, cada una con su microservicio dentro
P('p-aexp-registro', 'aexp-registro', 'ly-api-exp', A); IN('p-mexp-registro', 'mexp-registro', 'p-aexp-registro');
P('p-aexp-consentimiento', 'aexp-consentimiento', 'ly-api-exp', CO); IN('p-mexp-consentimiento', 'mexp-consentimiento', 'p-aexp-consentimiento');
P('p-aexp-consulta', 'aexp-consulta', 'ly-api-exp', E, 0); IN('p-mexp-consulta', 'mexp-consulta', 'p-aexp-consulta');
P('p-aexp-validacion', 'aexp-validacion', 'ly-api-exp', E, 1); IN('p-mexp-validacion', 'mexp-validacion', 'p-aexp-validacion');
P('p-aexp-reglas', 'aexp-reglas', 'ly-api-exp', E, 2); IN('p-mexp-reglas', 'mexp-reglas', 'p-aexp-reglas');
P('p-aexp-simular', 'aexp-simular', 'ly-api-exp', SI); IN('p-mexp-simular', 'mexp-simular', 'p-aexp-simular');
P('p-aexp-derivar', 'aexp-derivar', 'ly-api-exp', D, 0); IN('p-mexp-derivar', 'mexp-derivar', 'p-aexp-derivar');
P('p-aexp-lectura', 'aexp-lectura', 'ly-api-exp', D, 1); IN('p-mexp-lectura', 'mexp-lectura', 'p-aexp-lectura');
// Proceso
P('p-aproc-riesgos', 'aproc-riesgos', 'ly-api-proc', E, 1); IN('p-mproc-riesgos', 'mproc-riesgos', 'p-aproc-riesgos');
P('p-aproc-simulador', 'aproc-simulador', 'ly-api-proc', SI); IN('p-mproc-simulador', 'mproc-simulador', 'p-aproc-simulador');
// Negocio (SD)
P('p-asd-party', 'asd-party', 'ly-api-sd', A); IN('p-msd-party', 'msd-party', 'p-asd-party');
P('p-asd-customer', 'asd-customer', 'ly-api-sd', CO); IN('p-msd-customer', 'msd-customer', 'p-asd-customer');
P('p-asd-lead-eval', 'asd-lead', 'ly-api-sd', E, 0);                                        // misma API en dos etapas (clon)
P('p-asd-lead-deriv', 'asd-lead', 'ly-api-sd', D, 0); IN('p-msd-lead', 'msd-lead', 'p-asd-lead-deriv');
// Sistema (SYS)
P('p-asys-party', 'asys-party', 'ly-api-sys', A);
IN('p-msys-alta-persona', 'msys-alta-persona', 'p-asys-party'); IN('p-msys-alta-direcciones', 'msys-alta-direcciones', 'p-asys-party'); IN('p-msys-geo', 'msys-geo', 'p-asys-party');
P('p-asys-customer', 'asys-customer', 'ly-api-sys', CO); IN('p-msys-leypdp', 'msys-leypdp', 'p-asys-customer');
P('p-asys-lead', 'asys-lead', 'ly-api-sys', D, 0); IN('p-msys-lead', 'msys-lead', 'p-asys-lead');
P('p-asys-lectura', 'asys-lectura', 'ly-api-sys', D, 1); IN('p-msys-lectura', 'msys-lectura', 'p-asys-lectura');
// BACKEND
P('p-be-bd-aliados', 'be-bd-aliados', 'ly-backend', A, 0); P('p-be-mft', 'be-mft', 'ly-backend', A, 1); P('p-be-crm-analitica', 'be-crm-analitica', 'ly-backend', A, 2);
P('p-be-clientes', 'be-clientes', 'ly-backend', CO); P('p-be-distribuidor', 'be-distribuidor', 'ly-backend', E, 0); P('p-be-riesgos', 'be-riesgos', 'ly-backend', E, 1);
P('p-be-activos', 'be-activos', 'ly-backend', SI); P('p-be-crm', 'be-crm', 'ly-backend', D, 0, 0); P('p-be-analitica', 'be-analitica', 'ly-backend', D, 0, 1);
P('p-be-eventos', 'be-eventos', 'ly-backend', D, 1, 0); IN('p-be-topico', 'be-topico', 'p-be-eventos');

// ---- Relaciones (las flechas salen del microservicio interno hacia la API siguiente)
const relations = [];
const GRIS = '#475569', ROJO = '#b91c1c';
const R = (from, to, label = '', style = 'solid', color = GRIS) =>
  relations.push({ id: `r-${from.slice(2)}--${to.slice(2)}`, from, to, style, dir: 'fwd', color, width: 2, label });
const chain = (...ids) => ids.slice(1).forEach((id, i) => R(ids[i], id));

// Aliados
R('p-sp-registro', 'p-aexp-registro'); R('p-mexp-registro', 'p-asd-party', 'Registro de Prospecto'); R('p-msd-party', 'p-asys-party');
R('p-msys-alta-persona', 'p-be-bd-aliados'); R('p-msys-alta-direcciones', 'p-be-mft'); R('p-msys-geo', 'p-be-crm-analitica');
R('p-sp-registro', 'p-be-bd-aliados', 'registro directo', 'dashed', ROJO);
// Consentimiento
R('p-sp-consentimiento', 'p-aexp-consentimiento'); R('p-mexp-consentimiento', 'p-asd-customer', 'Marca PDP');
R('p-msd-customer', 'p-asys-customer'); R('p-msys-leypdp', 'p-be-clientes');
// Evaluación
R('p-sp-consulta', 'p-aexp-consulta'); R('p-mexp-consulta', 'p-asd-lead-eval', 'Consulta campaña'); R('p-asd-lead-eval', 'p-be-distribuidor');
R('p-sp-validacion', 'p-aexp-validacion'); R('p-mexp-validacion', 'p-aproc-riesgos');
R('p-sp-reglas', 'p-aexp-reglas'); R('p-mexp-reglas', 'p-aproc-riesgos');
R('p-mproc-riesgos', 'p-be-riesgos');
// Simulación
chain('p-sp-simular', 'p-aexp-simular'); R('p-mexp-simular', 'p-aproc-simulador'); R('p-mproc-simulador', 'p-be-activos');
// Derivación
R('p-sp-derivar', 'p-aexp-derivar'); R('p-mexp-derivar', 'p-asd-lead-deriv'); R('p-msd-lead', 'p-asys-lead'); R('p-msys-lead', 'p-be-crm');
R('p-be-crm', 'p-be-crm-analitica', 'sincroniza', 'dashed');
R('p-sp-lectura', 'p-aexp-lectura'); R('p-mexp-lectura', 'p-asys-lectura', 'lectura de estado');
R('p-msys-lectura', 'p-be-topico'); R('p-be-analitica', 'p-be-eventos', 'publica estado', 'dashed');

const out = {
  app: 'diagramador', version: 1, exportedAt: new Date().toISOString(),
  libraries: [{ id: LIB, name: 'Arquitectura Aliados', types: Object.values(types), components }],
  diagrams: [{
    id: 'diag-aliados', name: 'Aliados: registro, evaluación, simulación y derivación',
    description: 'Transcrito de la imagen de referencia. Capas: subprocesos → APIs de experiencia, proceso, negocio (SD) y sistema (SYS) → backend. Cada API contiene como subcomponente su microservicio. El campo "Estado" reproduce el color original (gris = existente, amarillo = nuevo, celeste = modificado).',
    layers, stages, placements, relations,
  }],
};
writeFileSync(new URL('../ejemplos/aliados.json', import.meta.url), JSON.stringify(out, null, 2));
console.log(`componentes=${components.length} instancias=${placements.length} relaciones=${relations.length}`);
