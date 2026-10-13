import React, { useState } from 'react';
import { ChevronRight, ChevronDown, FolderTree, FolderGit2, Layers, FolderOpen, PanelLeftClose } from 'lucide-react';
import { ProyectoBC3 } from '../types/bc3';
import { getConceptType } from '../utils/bc3Parser';

interface ProjectTreeSidebarProps {
  project: ProyectoBC3 | null;
  currentNodeCode: string | null;
  onSelectNode: (code: string) => void;
  isOpen: boolean;
  onToggleOpen: () => void;
}

export const ProjectTreeSidebar: React.FC<ProjectTreeSidebarProps> = ({
  project,
  currentNodeCode,
  onSelectNode,
  isOpen,
  onToggleOpen,
}) => {
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({
    '0##': true,
    '1#': true,
    '2#': true,
    '__ROOT__': true,
  });

  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('presto_sidebar_width');
      if (saved) return parseInt(saved, 10);
    } catch {}
    return 260;
  });

  const handleStartResize = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = sidebarWidth;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const newWidth = Math.min(500, Math.max(160, startW + deltaX));
      setSidebarWidth(newWidth);
      try {
        localStorage.setItem('presto_sidebar_width', String(newWidth));
      } catch {}
    };

    const onMouseUp = () => {
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  if (!isOpen) return null;
  if (!project || !project.codigoRaiz) {
    return (
      <aside
        style={{ width: `${sidebarWidth}px` }}
        className="bg-slate-50 border-r border-slate-200 p-3 text-xs text-slate-400 flex flex-col justify-between shrink-0 relative"
      >
        <div>
          <div className="font-semibold text-slate-500 mb-2 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5" />
            <span>Árbol de Capítulos</span>
          </div>
          <p className="text-[11px] leading-relaxed">Carga un archivo BC3 o importa un presupuesto para explorar la estructura jerárquica.</p>
        </div>
        <div
          onMouseDown={handleStartResize}
          className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-blue-500/20 z-30 flex items-center justify-end"
          title="Arrastra para redimensionar el ancho del árbol"
        >
          <div className="w-0.5 h-full bg-slate-200 hover:bg-blue-600 transition-colors" />
        </div>
      </aside>
    );
  }

  const toggleExpand = (code: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedNodes((prev) => ({ ...prev, [code]: !prev[code] }));
  };

  const renderNode = (code: string, depth: number = 0, parentCode?: string | null) => {
    const concept = project.conceptos[code];
    if (!concept) return null;

    const childrenRels = project.estructuras[code] || [];
    // Filter only children that are chapters or subchapters
    const chapterChildren = childrenRels.filter((rel) => {
      const childCode = rel.hijoCodigo;
      const type = getConceptType(project, childCode, code);
      return type === 'capitulo' || type === 'subcapitulo' || project.estructuras[childCode] !== undefined;
    });

    const hasChildren = chapterChildren.length > 0;
    const isExpanded = expandedNodes[code] ?? (depth < 2);
    const isSelected = currentNodeCode === code;
    const itemType = getConceptType(project, code, parentCode);

    return (
      <div key={code} className="select-none text-xs">
        <div
          onClick={() => onSelectNode(code)}
          className={`flex items-center py-1 px-1.5 rounded cursor-pointer transition-colors group ${
            isSelected
              ? 'bg-blue-100 text-blue-900 font-semibold'
              : 'hover:bg-slate-200/70 text-slate-700'
          }`}
          style={{ paddingLeft: `${Math.max(4, depth * 14)}px` }}
        >
          {hasChildren ? (
            <button
              onClick={(e) => toggleExpand(code, e)}
              className="p-0.5 mr-0.5 rounded hover:bg-slate-300/60 text-slate-500"
            >
              {isExpanded ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
            </button>
          ) : (
            <span className="w-4 mr-0.5" />
          )}

          {/* Distinct icons & badges for Chapter vs Subchapter */}
          {itemType === 'capitulo' ? (
            <div className="flex items-center space-x-1 mr-1.5 shrink-0" title="Capítulo">
              <FolderTree className="w-3.5 h-3.5 text-amber-600 fill-amber-100" />
              <span className="text-[8px] font-bold px-1 py-0.2 rounded bg-amber-100 text-amber-800 border border-amber-300 font-mono">
                CAP
              </span>
            </div>
          ) : (
            <div className="flex items-center space-x-1 mr-1.5 shrink-0" title="Subcapítulo">
              <FolderGit2 className="w-3.5 h-3.5 text-indigo-600 fill-indigo-100" />
              <span className="text-[8px] font-bold px-1 py-0.2 rounded bg-indigo-100 text-indigo-800 border border-indigo-300 font-mono">
                SUB
              </span>
            </div>
          )}

          <div className="flex-1 truncate min-w-0 pr-1">
            <span className="font-mono text-[11px] text-slate-500 mr-1 font-normal">
              {concept.codigo}
            </span>
            <span className="truncate text-slate-800" title={concept.resumen || concept.codigo}>
              {concept.resumen || concept.codigo}
            </span>
          </div>

          {concept.importePresupuestado !== undefined && (
            <span className="text-[10px] tabular-nums font-mono text-slate-400 group-hover:text-slate-600 ml-1 shrink-0">
              {concept.importePresupuestado.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
            </span>
          )}
        </div>

        {hasChildren && isExpanded && (
          <div className="border-l border-slate-200 ml-2">
            {chapterChildren.map((rel) => renderNode(rel.hijoCodigo, depth + 1, code))}
          </div>
        )}
      </div>
    );
  };

  return (
    <aside
      style={{ width: `${sidebarWidth}px` }}
      className="bg-slate-50 border-r border-slate-200 flex flex-col shrink-0 h-full overflow-hidden shadow-inner relative"
    >
      <div className="p-2.5 border-b border-slate-200 flex items-center justify-between bg-slate-100">
        <div className="font-semibold text-xs text-slate-700 flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-slate-600" />
          <span>Estructura de Capítulos</span>
        </div>
        <button
          onClick={onToggleOpen}
          className="text-slate-400 hover:text-slate-700 hover:bg-slate-200 p-1 rounded transition-colors"
          title="Ocultar árbol lateral (Ctrl+B)"
        >
          <PanelLeftClose className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
        {renderNode(project.codigoRaiz, 0, null)}
      </div>

      <div className="p-2 border-t border-slate-200 bg-slate-100 text-[11px] text-slate-500 text-center">
        Haz clic para navegar a cualquier capítulo
      </div>

      {/* Right draggable border resizer */}
      <div
        onMouseDown={handleStartResize}
        className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-blue-500/20 z-30 flex items-center justify-end group"
        title="Arrastra para redimensionar el ancho del árbol"
      >
        <div className="w-0.5 h-full bg-slate-300 group-hover:bg-blue-600 transition-colors" />
      </div>
    </aside>
  );
};
