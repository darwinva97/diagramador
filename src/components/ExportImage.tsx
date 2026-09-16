/**
 * Botón de imagen de la barra superior: PNG a la definición que elijas, SVG,
 * copiar al portapapeles e imprimir. El trabajo lo hace `lib/image.ts`.
 */
import { useEffect } from 'react';
import { copyImage, exportImage, useExport } from '../lib/image';
import { openMenu, type MenuItem } from './ContextMenu';
import { useStore } from '../store';

export function ExportImageButton() {
  const { busy, error, aviso } = useExport();
  const hayDiagrama = useStore(s => !!s.data.currentDiagramId);

  // el aviso se va solo; el error se queda hasta el siguiente intento
  useEffect(() => {
    if (!aviso) return;
    const t = window.setTimeout(() => useExport.setState({ aviso: null }), 5000);
    return () => window.clearTimeout(t);
  }, [aviso]);

  const menu = (e: React.MouseEvent) => {
    const items: MenuItem[] = [
      { label: '🖼 PNG ×2', hint: 'nítido', title: 'El doble de píxeles que en pantalla: bien para presentaciones y documentos', onClick: () => void exportImage('png', 2) },
      { label: '🖼 PNG ×3', hint: 'máxima', title: 'Máxima definición; en diagramas grandes se ajusta a lo que el navegador aguante', onClick: () => void exportImage('png', 3) },
      { label: '🖼 PNG ×1', title: 'Tamaño real del diagrama al 100 %', onClick: () => void exportImage('png', 1) },
      { label: '📋 Copiar al portapapeles', title: 'PNG ×2 listo para pegar en un chat o un documento', onClick: () => void copyImage(2) },
      { label: '◇ SVG', title: 'Escalable: no pierde definición por mucho que se amplíe', onClick: () => void exportImage('svg') },
      { sep: true },
      { label: '🖨 Imprimir o guardar en PDF', hint: 'Ctrl+P', onClick: () => window.print() },
    ];
    openMenu(e, items, 'Imagen del diagrama');
  };

  return (
    <>
      <button className="btn" onClick={menu} onContextMenu={menu} disabled={!hayDiagrama || busy}
        title="Imagen del diagrama: PNG a buena definición, SVG, portapapeles o impresión">
        {busy ? '⟳ Generando…' : '🖼 Imagen'}
      </button>
      {(error || aviso) && (
        <div className={'export-note' + (error ? ' warn' : '')} onClick={() => useExport.setState({ error: null, aviso: null })}>
          {error ? `⚠ ${error}` : aviso}
        </div>
      )}
    </>
  );
}
