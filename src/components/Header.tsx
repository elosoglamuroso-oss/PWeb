import React, { useRef } from 'react';
import {
  FileSpreadsheet,
  FolderOpen,
  Download,
  Save,
  Upload,
  FilePlus,
  Check,
  ClipboardList,
} from 'lucide-react';
import { ProyectoBC3 } from '../types/bc3';
import { exportBC3 } from '../utils/bc3Parser';

interface HeaderProps {
  project: ProyectoBC3 | null;
  onNewProject?: () => void;
  onOpenBC3File: (file: File) => void;
  onOpenPasteModal?: () => void;
  onOpenExcelModal: () => void;
  onLoadDemo?: () => void;
  onSaveJSON: () => void;
  onLoadJSON: (file: File) => void;
  onOpenDiagnostics?: () => void;
  hasDiagnostics?: boolean;
  lastSavedTimestamp?: number | null;
}

export const Header: React.FC<HeaderProps> = ({
  project,
  onNewProject,
  onOpenBC3File,
  onOpenExcelModal,
  onSaveJSON,
  onLoadJSON,
  onOpenDiagnostics,
  hasDiagnostics = false,
  lastSavedTimestamp,
}) => {
  const bc3InputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);

  const rootConcept = project && project.codigoRaiz ? project.conceptos[project.codigoRaiz] : null;
  const projectTitle = rootConcept?.resumen || rootConcept?.codigo || 'Sin proyecto abierto';
  const totalConcepts = project ? Object.keys(project.conceptos).length : 0;

  const handleBc3Change = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onOpenBC3File(file);
    }
    e.target.value = '';
  };

  const handleJsonChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onLoadJSON(file);
    }
    e.target.value = '';
  };

  const handleExportBC3 = () => {
    if (!project) return;
    const content = exportBC3(project);
    // Standard UTF-8 blob to ensure all accents and symbols (m², m³, €, #) export losslessly
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectTitle.replace(/[^a-zA-Z0-9_-]/g, '_') || 'presupuesto'}.bc3`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <header className="bg-slate-900 text-white px-4 py-2 flex items-center justify-between border-b border-slate-800 text-xs shrink-0 select-none shadow-sm">
      <div className="flex items-center space-x-3 min-w-0">
        <div className="flex items-center space-x-2">
          <div className="w-6 h-6 rounded bg-blue-600 flex items-center justify-center font-bold text-white text-xs shadow-inner">
            P
          </div>
          <span className="font-bold text-sm tracking-tight text-white">PrestoWeb</span>
        </div>
        <span className="text-slate-600">|</span>
        <div className="flex items-center space-x-2 truncate">
          <span className="font-semibold text-slate-200 truncate max-w-xs md:max-w-md lg:max-w-xl" title={projectTitle}>
            {projectTitle}
          </span>
          {totalConcepts > 0 && (
            <span className="text-slate-400 text-[11px] tabular-nums whitespace-nowrap">
              ({totalConcepts.toLocaleString()} conceptos)
            </span>
          )}
        </div>

        {/* Autosave status indicator */}
        {lastSavedTimestamp && (
          <div className="hidden lg:flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] text-slate-400 bg-slate-800/80 border border-slate-700/50">
            <Check className="w-3 h-3 text-emerald-400" />
            <span className="tabular-nums">Guardado en navegador</span>
          </div>
        )}
      </div>

      <div className="flex items-center space-x-1.5 shrink-0">
        <input
          type="file"
          ref={bc3InputRef}
          accept=".bc3,.txt,.fie"
          className="hidden"
          onChange={handleBc3Change}
        />
        <input
          type="file"
          ref={jsonInputRef}
          accept=".json"
          className="hidden"
          onChange={handleJsonChange}
        />

        {/* Diagnostics button */}
        {hasDiagnostics && onOpenDiagnostics && (
          <button
            onClick={onOpenDiagnostics}
            className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 hover:text-amber-200 px-2.5 py-1.5 rounded font-medium border border-amber-900/60 transition-colors cursor-pointer"
            title="Ver informe diagnóstico de la última importación BC3"
          >
            <ClipboardList className="w-3.5 h-3.5 text-amber-400" />
            <span>Informe BC3</span>
          </button>
        )}

        {/* New & BC3 Operations */}
        {onNewProject && (
          <button
            onClick={onNewProject}
            className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 px-2.5 py-1.5 rounded font-medium border border-slate-700 transition-colors cursor-pointer"
            title="Crear un presupuesto nuevo en blanco"
          >
            <FilePlus className="w-3.5 h-3.5 text-blue-400" />
            <span>Nuevo</span>
          </button>
        )}

        <button
          onClick={() => bc3InputRef.current?.click()}
          className="flex items-center space-x-1.5 bg-blue-600 hover:bg-blue-500 text-white px-2.5 py-1.5 rounded font-medium transition-colors cursor-pointer"
          title="Cargar archivo .BC3 o .FIE desde tu ordenador con análisis en segundo plano"
        >
          <FolderOpen className="w-3.5 h-3.5" />
          <span>Abrir BC3</span>
        </button>

        {/* Excel Import */}
        <button
          onClick={onOpenExcelModal}
          className="flex items-center space-x-1.5 bg-emerald-700 hover:bg-emerald-600 text-white px-2.5 py-1.5 rounded font-medium transition-colors"
          title="Importación masiva desde Excel (.xlsx, .xls, .csv o portapapeles)"
        >
          <FileSpreadsheet className="w-3.5 h-3.5" />
          <span>Importar Excel</span>
        </button>

        <div className="h-4 w-px bg-slate-700 mx-1" />

        {/* Export buttons */}
        <button
          onClick={handleExportBC3}
          disabled={!project}
          className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 px-2 py-1.5 rounded font-medium border border-slate-700 transition-colors"
          title="Descargar archivo FIEBDC-3 (.bc3)"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Exportar BC3</span>
        </button>

        <button
          onClick={onSaveJSON}
          disabled={!project}
          className="flex items-center space-x-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 px-2 py-1.5 rounded font-medium border border-slate-700 transition-colors"
          title="Guardar estado del proyecto en JSON"
        >
          <Save className="w-3.5 h-3.5 text-amber-400" />
          <span>JSON</span>
        </button>

        <button
          onClick={() => jsonInputRef.current?.click()}
          className="flex items-center space-x-1 bg-slate-800 hover:bg-slate-700 text-slate-200 px-2 py-1.5 rounded font-medium border border-slate-700 transition-colors"
          title="Cargar proyecto JSON guardado"
        >
          <Upload className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
};
