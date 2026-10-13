import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Plus,
  Trash2,
  Scissors,
  Copy,
  ClipboardPaste,
  FileText,
  Info,
  Ruler,
  Award,
  Calendar,
  CheckCircle2,
  Filter,
  Sparkles,
  Lock,
  Unlock,
} from 'lucide-react';
import { Concepto, LineaMedicion, ProyectoBC3, RelacionEstructura, FaseCertificacion } from '../types/bc3';
import { computeLineQuantity, getConceptType, getRelCertificationStats, round2, round4 } from '../utils/bc3Parser';
import {
  copyMeasurementLines,
  getMeasurementClipboard,
  getMeasurementClipboardAsync,
  hasMeasurementClipboard
} from '../utils/clipboardStore';

interface DetailPanelProps {
  project: ProyectoBC3 | null;
  currentNodeCode: string | null;
  selectedConceptCode: string | null;
  onUpdateMeasurements: (parentCode: string, childCode: string, lines: LineaMedicion[]) => void;
  onUpdateConceptText: (code: string, text: string) => void;
  viewMode: 'presupuesto' | 'certificacion';
  activeFaseId: string;
  onChangeActiveFase: (faseId: string) => void;
  onAddNewFase: (nombre: string, fecha: string) => void;
  onToggleFaseEstado?: (faseId: string) => void;
  onUpdateFaseFecha: (faseId: string, nuevaFecha: string) => void;
  onUpdateFaseNota: (parentCode: string, childCode: string, faseId: string, nota: string) => void;
  onDeleteFase: (faseId: string) => void;
  onGenerateMonthlyFases: (year?: number) => void;
  onUpdateCertificationDirect: (parentCode: string, childCode: string, faseId: string, cantidad: number) => void;
}

export const DetailPanel: React.FC<DetailPanelProps> = ({
  project,
  currentNodeCode,
  selectedConceptCode,
  onUpdateMeasurements,
  onUpdateConceptText,
  viewMode,
  activeFaseId,
  onChangeActiveFase,
  onAddNewFase,
  onToggleFaseEstado,
  onUpdateFaseFecha,
  onUpdateFaseNota,
  onDeleteFase,
  onGenerateMonthlyFases,
  onUpdateCertificationDirect,
}) => {
  const [activeTab, setActiveTab] = useState<'mediciones' | 'fases' | 'texto' | 'info'>('mediciones');
  const [selectedLineIndex, setSelectedLineIndex] = useState<number | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [filterFase, setFilterFase] = useState<string>('todas');
  const [editingFechaFaseId, setEditingFechaFaseId] = useState<string | null>(null);
  const [tempFechaVal, setTempFechaVal] = useState('');

  // Resizable columns for Mediciones table (persisted to localStorage)
  const [colWidths, setColWidths] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem('presto_mediciones_col_widths_v4');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      num: 36,
      fase: 85,
      espacio: 110,
      comentario: 260,
      n: 65,
      longitud: 70,
      anchura: 70,
      altura: 70,
      formula: 120,
      cantidad: 90,
    };
  });

  // Resizable columns for Fases de Certificación table (persisted to localStorage)
  const [fasesColWidths, setFasesColWidths] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem('presto_fases_col_widths_v2');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      m: 45,
      fecha: 130,
      canCert: 100,
      orCanCert: 100,
      porCertPres: 90,
      cert: 95,
      orCert: 105,
      nota: 240,
      estado: 95,
      del: 45,
    };
  });

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((cur) => (cur === msg ? null : cur));
    }, 2000);
  };

  const handleStartResize = (colKey: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = colWidths[colKey] || 75;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const newWidth = Math.max(30, startW + deltaX);
      setColWidths((prev) => {
        const next = { ...prev, [colKey]: newWidth };
        try {
          localStorage.setItem('presto_mediciones_col_widths_v4', JSON.stringify(next));
        } catch {}
        return next;
      });
    };

    const onMouseUp = () => {
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      showToast('Ancho de columna bloqueado');
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handleStartResizeFases = (colKey: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = fasesColWidths[colKey] || 90;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const newWidth = Math.max(35, startW + deltaX);
      setFasesColWidths((prev) => {
        const next = { ...prev, [colKey]: newWidth };
        try {
          localStorage.setItem('presto_fases_col_widths_v2', JSON.stringify(next));
        } catch {}
        return next;
      });
    };

    const onMouseUp = () => {
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      showToast('Ancho de columna bloqueado');
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const concept = selectedConceptCode && project ? project.conceptos[selectedConceptCode] : null;
  const itemType = concept && project ? getConceptType(project, concept.codigo, currentNodeCode) : 'partida';
  const isChapterOrSub = itemType === 'capitulo' || itemType === 'subcapitulo';

  // Robust currentRel search: check currentNodeCode first, then anywhere in project.estructuras
  const currentRel: RelacionEstructura | null = useMemo(() => {
    if (!project || !selectedConceptCode) return null;
    if (currentNodeCode && project.estructuras[currentNodeCode]) {
      const found = project.estructuras[currentNodeCode].find((r) => r.hijoCodigo === selectedConceptCode);
      if (found) return found;
    }
    for (const rels of Object.values(project.estructuras)) {
      const found = rels.find((r) => r.hijoCodigo === selectedConceptCode);
      if (found) return found;
    }
    return null;
  }, [project, currentNodeCode, selectedConceptCode]);

  const allLines = currentRel?.mediciones || [];

  // When in budget mode, only show budget measurements (fase === '0' or all budget lines)
  const isBudgetMode = viewMode === 'presupuesto';

  // Automatically keep filterFase in sync with activeFaseId in certification mode so new phases start at 0
  useEffect(() => {
    if (viewMode === 'certificacion' && activeFaseId) {
      setFilterFase(activeFaseId);
    } else if (viewMode === 'presupuesto') {
      setFilterFase('0');
    }
  }, [viewMode, activeFaseId]);

  const filteredLines = allLines.filter((l) => {
    if (isBudgetMode) return true; // In budget mode, all lines belong to budget
    if (filterFase === 'todas') return true;
    const lineFase = String(l.fase ?? '0');
    return lineFase === filterFase;
  });

  // Phases of project
  const phases = project?.fases || [
    { id: '1', numero: 1, nombre: 'Fase 1', fecha: '31-Ene-26', estado: 'abierta' },
    { id: '2', numero: 2, nombre: 'Fase 2', fecha: '28-Feb-26', estado: 'abierta' },
  ];

  // Update line cell
  const handleCellChange = (actualIndex: number, field: keyof LineaMedicion, value: string) => {
    if (!currentNodeCode || !selectedConceptCode || !currentRel) return;
    const targetLine = allLines[actualIndex];
    if (targetLine && targetLine.fase && targetLine.fase !== '0') {
      const p = phases.find((phase) => phase.id === String(targetLine.fase));
      if (p && p.estado === 'cerrada') {
        showToast('Esta línea pertenece a una fase cerrada y no se puede modificar');
        return;
      }
    }
    const newLines = [...allLines];
    const updatedLine = { ...newLines[actualIndex], [field]: value };
    updatedLine.cantidad = computeLineQuantity(updatedLine);
    newLines[actualIndex] = updatedLine;
    onUpdateMeasurements(currentNodeCode, selectedConceptCode, newLines);
  };

  const lastAddLineTimeRef = useRef<number>(0);

  // Add line (in budget mode: strictly phase '0' / Presupuesto; clean blank values; auto-focus next line!)
  const handleAddLine = () => {
    if (!currentNodeCode || !selectedConceptCode || !currentRel) return;

    // Prevent duplicate calls within 250ms (e.g. from rapid key events)
    const now = Date.now();
    if (now - lastAddLineTimeRef.current < 250) {
      return;
    }
    lastAddLineTimeRef.current = now;

    const targetFase = isBudgetMode ? '0' : (filterFase !== 'todas' ? filterFase : activeFaseId);
    if (targetFase !== '0') {
      const p = phases.find((phase) => phase.id === String(targetFase));
      if (p && p.estado === 'cerrada') {
        showToast('No se puede añadir medición: la fase seleccionada está cerrada');
        return;
      }
    }

    const newLineId = `line_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newLine: LineaMedicion = {
      id: newLineId,
      fase: targetFase,
      espacio: '',
      comentario: '',
      n: '',
      longitud: '',
      anchura: '',
      altura: '',
      formula: '',
      cantidad: 0,
    };
    const newLines = [...allLines, newLine];
    onUpdateMeasurements(currentNodeCode, selectedConceptCode, newLines);
    setSelectedLineIndex(newLines.length - 1);

    // Auto-focus the newly created line's comment input for fast data entry
    setTimeout(() => {
      const el = document.getElementById(`med_input_comentario_${newLineId}`) ||
                 document.getElementById(`med_input_espacio_${newLineId}`);
      if (el) {
        el.focus();
      }
    }, 40);
  };

  // Delete line (with Supr / Delete key support - strictly deletes line, NEVER parent concept)
  const handleDeleteLine = () => {
    if (!currentNodeCode || !selectedConceptCode || !currentRel) return;
    const effectiveIndex = selectedLineIndex !== null
      ? selectedLineIndex
      : (allLines.length > 0 ? allLines.length - 1 : null);

    if (effectiveIndex === null || !allLines[effectiveIndex]) return;

    const targetLine = allLines[effectiveIndex];
    if (targetLine && targetLine.fase && targetLine.fase !== '0') {
      const p = phases.find((phase) => phase.id === String(targetLine.fase));
      if (p && p.estado === 'cerrada') {
        showToast('No se puede eliminar: pertenece a una fase cerrada');
        return;
      }
    }
    const newLines = allLines.filter((_, idx) => idx !== effectiveIndex);
    onUpdateMeasurements(currentNodeCode, selectedConceptCode, newLines);
    if (effectiveIndex >= newLines.length) {
      setSelectedLineIndex(newLines.length > 0 ? newLines.length - 1 : null);
    } else {
      setSelectedLineIndex(effectiveIndex);
    }
    showToast('Línea de medición eliminada');
  };

  // Copy line
  const handleCopyLine = async () => {
    if (selectedLineIndex === null || !allLines[selectedLineIndex]) return;
    await copyMeasurementLines([allLines[selectedLineIndex]]);
    showToast('Línea copiada al portapapeles (Ctrl+C)');
  };

  // Cut line
  const handleCutLine = async () => {
    if (selectedLineIndex === null || !allLines[selectedLineIndex] || !currentNodeCode || !selectedConceptCode) return;
    await copyMeasurementLines([allLines[selectedLineIndex]]);
    handleDeleteLine();
    showToast('Línea cortada al portapapeles (Ctrl+X)');
  };

  // Paste line
  const handlePasteLine = async () => {
    const clipboard = (await getMeasurementClipboardAsync()) || getMeasurementClipboard();
    if (!clipboard.length || !currentNodeCode || !selectedConceptCode) {
      showToast('No hay líneas de medición en el portapapeles');
      return;
    }
    const newLines = [...allLines];
    const insertIdx = selectedLineIndex !== null ? selectedLineIndex + 1 : newLines.length;
    const toInsert = clipboard.map((c) => ({
      ...c,
      id: `line_pasted_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      fase: isBudgetMode ? '0' : c.fase || '0',
    }));
    newLines.splice(insertIdx, 0, ...toInsert);
    onUpdateMeasurements(currentNodeCode, selectedConceptCode, newLines);
    setSelectedLineIndex(insertIdx + toInsert.length - 1);
    showToast('Línea pegada (Ctrl+V)');
  };

  // Keyboard shortcuts (Ctrl+C, Ctrl+X, Ctrl+V, Delete/Supr)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (activeTab !== 'mediciones') return;
      if (e.defaultPrevented) return;

      const activeEl = document.activeElement as HTMLInputElement | HTMLTextAreaElement | null;
      const isInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');

      // Delete / Supr key handler: only delete measurement line if not typing inside an input
      const isDeleteKey = e.key === 'Delete' || e.key === 'Del' || e.key === 'Supr' || e.code === 'Delete';
      if (isDeleteKey) {
        if (!isInput && (selectedLineIndex !== null || allLines.length > 0)) {
          e.preventDefault();
          e.stopPropagation();
          (e as any).stopImmediatePropagation?.();
          handleDeleteLine();
          return;
        }
      }

      // Enter / Return key handler to create a new measurement line when navigating rows (inputs handle their own Enter)
      if ((e.key === 'Enter' || e.key === 'Return') && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
        if (!isInput && (selectedLineIndex !== null || allLines.length >= 0)) {
          e.preventDefault();
          e.stopPropagation();
          (e as any).stopImmediatePropagation?.();
          handleAddLine();
          return;
        }
      }

      if (!e.ctrlKey && !e.metaKey) return;

      if (isInput) {
        try {
          if (
            typeof activeEl.selectionStart === 'number' &&
            activeEl.selectionStart !== activeEl.selectionEnd
          ) {
            return;
          }
        } catch {}
      }

      const key = e.key.toLowerCase();
      if (key === 'c') {
        if (selectedLineIndex !== null && allLines[selectedLineIndex]) {
          e.preventDefault();
          handleCopyLine();
        }
      } else if (key === 'v') {
        if (hasMeasurementClipboard()) {
          e.preventDefault();
          handlePasteLine();
        }
      } else if (key === 'x') {
        if (selectedLineIndex !== null && allLines[selectedLineIndex]) {
          e.preventDefault();
          handleCutLine();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, selectedLineIndex, allLines]);

  const totalQuantity = isBudgetMode
    ? allLines.reduce((acc, l) => acc + (l.cantidad || 0), 0)
    : filteredLines.reduce((acc, l) => acc + (l.cantidad || 0), 0);
  const canPresTotal = round4(currentRel?.cantidad ?? allLines.reduce((acc, l) => acc + (l.cantidad || 0), 0));
  const precioUnitario = concept?.precio || 0;

  return (
    <div className="flex-1 flex flex-col h-full bg-white overflow-hidden select-none border-t border-slate-300 relative">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="absolute top-2 right-4 z-50 bg-slate-900 text-white text-xs px-3 py-1.5 rounded shadow-lg flex items-center space-x-1.5 animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Subheader tabs & actions */}
      <div className="bg-slate-100 border-b border-slate-300 flex items-center justify-between text-xs px-2 shrink-0">
        <div className="flex space-x-1">
          {/* Mediciones Tab */}
          <button
            onClick={() => setActiveTab('mediciones')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 font-medium border-b-2 transition-colors ${
              activeTab === 'mediciones'
                ? 'border-blue-600 text-blue-700 bg-white font-bold shadow-2xs'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Ruler className="w-3.5 h-3.5" />
            <span>Mediciones</span>
            {allLines.length > 0 && (
              <span className="text-[10px] bg-blue-100 text-blue-800 px-1.5 py-0.2 rounded-full tabular-nums">
                {allLines.length}
              </span>
            )}
          </button>

          {/* Fases Tab (Styled exactly as Presto Image 2) */}
          <button
            onClick={() => setActiveTab('fases')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 font-medium border-b-2 transition-colors ${
              activeTab === 'fases'
                ? 'border-blue-600 text-blue-700 bg-white font-bold shadow-2xs'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Award className="w-3.5 h-3.5 text-blue-600" />
            <span>Fases ({phases.length})</span>
          </button>

          {/* Texto Descriptivo Tab */}
          <button
            onClick={() => setActiveTab('texto')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 font-medium border-b-2 transition-colors ${
              activeTab === 'texto'
                ? 'border-blue-600 text-blue-700 bg-white font-bold shadow-2xs'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Texto Descriptivo (~T)</span>
            {concept?.texto && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
          </button>

          {/* Descompuestos / Info Tab */}
          <button
            onClick={() => setActiveTab('info')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 font-medium border-b-2 transition-colors ${
              activeTab === 'info'
                ? 'border-blue-600 text-blue-700 bg-white font-bold shadow-2xs'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Info className="w-3.5 h-3.5" />
            <span>Descompuestos / Info</span>
          </button>
        </div>

        {/* Selected item summary */}
        <div className="flex items-center space-x-3 text-slate-600 text-[11px]">
          {concept && (
            <div className="flex items-center space-x-1 truncate max-w-sm">
              <span className="font-mono font-bold text-slate-900">{concept.codigo}</span>
              <span className="text-slate-400">·</span>
              <span className="truncate">{concept.resumen || 'Sin resumen'}</span>
            </div>
          )}
        </div>
      </div>

      {/* Tab 1: Mediciones */}
      {activeTab === 'mediciones' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Actions Bar for Mediciones */}
          <div className="bg-slate-50 px-3 py-1 border-b border-slate-200 flex items-center justify-between text-xs gap-2">
            <div className="flex items-center space-x-1.5">
              <button
                onClick={handleAddLine}
                disabled={!selectedConceptCode || isChapterOrSub}
                className="flex items-center space-x-1 bg-white hover:bg-slate-100 disabled:opacity-40 text-blue-700 border border-slate-300 px-2 py-0.5 rounded font-medium shadow-2xs"
                title="Añadir nueva línea de medición en blanco"
              >
                <Plus className="w-3 h-3 text-blue-600" />
                <span>Añadir línea</span>
              </button>

              <button
                onClick={handleCopyLine}
                disabled={selectedLineIndex === null || isChapterOrSub}
                className="flex items-center space-x-1 bg-white hover:bg-slate-100 disabled:opacity-40 text-slate-700 border border-slate-300 px-2 py-0.5 rounded font-medium shadow-2xs"
                title="Copiar línea seleccionada (Ctrl+C)"
              >
                <Copy className="w-3 h-3" />
                <span>Copiar</span>
              </button>

              <button
                onClick={handleCutLine}
                disabled={selectedLineIndex === null || isChapterOrSub}
                className="flex items-center space-x-1 bg-white hover:bg-slate-100 disabled:opacity-40 text-slate-700 border border-slate-300 px-2 py-0.5 rounded font-medium shadow-2xs"
                title="Cortar línea seleccionada (Ctrl+X)"
              >
                <Scissors className="w-3 h-3" />
                <span>Cortar</span>
              </button>

              <button
                onClick={handlePasteLine}
                disabled={isChapterOrSub}
                className="flex items-center space-x-1 bg-white hover:bg-slate-100 disabled:opacity-40 text-slate-700 border border-slate-300 px-2 py-0.5 rounded font-medium shadow-2xs"
                title="Pegar línea desde el portapapeles (Ctrl+V)"
              >
                <ClipboardPaste className="w-3 h-3" />
                <span>Pegar</span>
              </button>

              <button
                onClick={handleDeleteLine}
                disabled={allLines.length === 0 || isChapterOrSub}
                className="flex items-center space-x-1 bg-white hover:bg-rose-50 disabled:opacity-40 text-rose-600 border border-slate-300 px-2 py-0.5 rounded font-medium shadow-2xs"
                title="Eliminar línea de medición seleccionada (Supr)"
              >
                <Trash2 className="w-3 h-3 text-rose-500" />
                <span>Borrar línea (Supr)</span>
              </button>
            </div>

            {/* Filter by Phase (Active only in certification mode) */}
            <div className="flex items-center space-x-2">
              {isBudgetMode ? (
                <div className="flex items-center space-x-1 text-slate-500 bg-slate-200/60 px-2 py-0.5 rounded font-medium text-[11px]">
                  <span>Modo: Presupuesto (Todas las unidades van a medición)</span>
                </div>
              ) : (
                <div className="flex items-center space-x-1 text-slate-600">
                  <Filter className="w-3 h-3 text-slate-400" />
                  <span className="text-[11px]">Filtrar fase:</span>
                  <select
                    value={filterFase}
                    onChange={(e) => setFilterFase(e.target.value)}
                    className="bg-white border border-slate-300 rounded px-1.5 py-0.5 text-xs text-slate-700 font-medium"
                  >
                    <option value="todas">Todas las fases</option>
                    <option value="0">Presupuesto</option>
                    {phases.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.nombre}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="font-mono text-xs font-semibold text-slate-700 bg-white border border-slate-300 px-2 py-0.5 rounded">
                Suma: <span className="text-blue-900 font-bold">{totalQuantity.toFixed(2)}</span> {concept?.unidad || ''}
              </div>
            </div>
          </div>

          {/* Measurements Table Grid */}
          <div className="flex-1 overflow-auto bg-white">
            {isChapterOrSub ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                Los capítulos y subcapítulos no tienen desglose de mediciones directas; su importe es la suma de sus conceptos subordinados.
              </div>
            ) : !selectedConceptCode ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                Selecciona una partida arriba para ver o editar sus líneas de medición.
              </div>
            ) : (
              <div className="flex-1 overflow-auto bg-white">
                <table
                  className="border-collapse text-left text-xs table-fixed"
                  style={{
                    width: `${Math.max(
                      (colWidths.num || 36) +
                        (colWidths.fase || 85) +
                        (colWidths.espacio || 110) +
                        (colWidths.comentario || 260) +
                        (colWidths.n || 65) +
                        (colWidths.longitud || 70) +
                        (colWidths.anchura || 70) +
                        (colWidths.altura || 70) +
                        (colWidths.formula || 120) +
                        (colWidths.cantidad || 90),
                      850
                    )}px`,
                    minWidth: '100%',
                  }}
                >
                <colgroup><col style={{ width: `${colWidths.num || 36}px` }} /><col style={{ width: `${colWidths.fase || 85}px` }} /><col style={{ width: `${colWidths.espacio || 110}px` }} /><col style={{ width: `${colWidths.comentario || 260}px` }} /><col style={{ width: `${colWidths.n || 65}px` }} /><col style={{ width: `${colWidths.longitud || 70}px` }} /><col style={{ width: `${colWidths.anchura || 70}px` }} /><col style={{ width: `${colWidths.altura || 70}px` }} /><col style={{ width: `${colWidths.formula || 120}px` }} /><col style={{ width: `${colWidths.cantidad || 90}px` }} /></colgroup>
                <thead className="bg-slate-100 text-slate-700 sticky top-0 font-semibold border-b border-slate-300 z-10 shadow-2xs select-none">
                  <tr>
                    {/* # */}
                    <th className="relative p-1.5 border-r border-slate-300 text-center font-mono text-slate-500">
                      <span>#</span>
                      <div
                        onMouseDown={(e) => handleStartResize('num', e)}
                        className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize hover:bg-blue-500/20 group flex items-center justify-end z-20"
                        title="Arrastra para redimensionar columna"
                      >
                        <div className="w-[2px] h-3.5 bg-slate-300 group-hover:bg-blue-600 transition-colors" />
                      </div>
                    </th>

                    {/* Fase */}
                    <th className="relative p-1.5 border-r border-slate-300 text-center">
                      <span>Fase</span>
                      <div
                        onMouseDown={(e) => handleStartResize('fase', e)}
                        className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize hover:bg-blue-500/20 group flex items-center justify-end z-20"
                        title="Arrastra para redimensionar columna"
                      >
                        <div className="w-[2px] h-3.5 bg-slate-300 group-hover:bg-blue-600 transition-colors" />
                      </div>
                    </th>

                    {/* Espacio */}
                    <th className="relative p-1.5 border-r border-slate-300">
                      <span>Espacio</span>
                      <div
                        onMouseDown={(e) => handleStartResize('espacio', e)}
                        className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize hover:bg-blue-500/20 group flex items-center justify-end z-20"
                        title="Arrastra para redimensionar columna"
                      >
                        <div className="w-[2px] h-3.5 bg-slate-300 group-hover:bg-blue-600 transition-colors" />
                      </div>
                    </th>

                    {/* Comentario */}
                    <th className="relative p-1.5 border-r border-slate-300">
                      <span>Comentario</span>
                      <div
                        onMouseDown={(e) => handleStartResize('comentario', e)}
                        className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize hover:bg-blue-500/20 group flex items-center justify-end z-20"
                        title="Arrastra para redimensionar columna"
                      >
                        <div className="w-[2px] h-3.5 bg-slate-300 group-hover:bg-blue-600 transition-colors" />
                      </div>
                    </th>

                    {/* N */}
                    <th className="relative p-1.5 border-r border-slate-300 text-right">
                      <span>N</span>
                      <div
                        onMouseDown={(e) => handleStartResize('n', e)}
                        className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize hover:bg-blue-500/20 group flex items-center justify-end z-20"
                        title="Arrastra para redimensionar columna"
                      >
                        <div className="w-[2px] h-3.5 bg-slate-300 group-hover:bg-blue-600 transition-colors" />
                      </div>
                    </th>

                    {/* Longitud */}
                    <th className="relative p-1.5 border-r border-slate-300 text-right">
                      <span>Longitud</span>
                      <div
                        onMouseDown={(e) => handleStartResize('longitud', e)}
                        className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize hover:bg-blue-500/20 group flex items-center justify-end z-20"
                        title="Arrastra para redimensionar columna"
                      >
                        <div className="w-[2px] h-3.5 bg-slate-300 group-hover:bg-blue-600 transition-colors" />
                      </div>
                    </th>

                    {/* Anchura */}
                    <th className="relative p-1.5 border-r border-slate-300 text-right">
                      <span>Anchura</span>
                      <div
                        onMouseDown={(e) => handleStartResize('anchura', e)}
                        className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize hover:bg-blue-500/20 group flex items-center justify-end z-20"
                        title="Arrastra para redimensionar columna"
                      >
                        <div className="w-[2px] h-3.5 bg-slate-300 group-hover:bg-blue-600 transition-colors" />
                      </div>
                    </th>

                    {/* Altura */}
                    <th className="relative p-1.5 border-r border-slate-300 text-right">
                      <span>Altura</span>
                      <div
                        onMouseDown={(e) => handleStartResize('altura', e)}
                        className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize hover:bg-blue-500/20 group flex items-center justify-end z-20"
                        title="Arrastra para redimensionar columna"
                      >
                        <div className="w-[2px] h-3.5 bg-slate-300 group-hover:bg-blue-600 transition-colors" />
                      </div>
                    </th>

                    {/* Fórmula */}
                    <th className="relative p-1.5 border-r border-slate-300">
                      <span>Fórmula</span>
                      <div
                        onMouseDown={(e) => handleStartResize('formula', e)}
                        className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize hover:bg-blue-500/20 group flex items-center justify-end z-20"
                        title="Arrastra para redimensionar columna"
                      >
                        <div className="w-[2px] h-3.5 bg-slate-300 group-hover:bg-blue-600 transition-colors" />
                      </div>
                    </th>

                    {/* Parcial / Cantidad */}
                    <th className="relative p-1.5 text-right font-bold bg-slate-100">
                      <span>Parcial</span>
                      <div
                        onMouseDown={(e) => handleStartResize('cantidad', e)}
                        className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize hover:bg-blue-500/20 group flex items-center justify-end z-20"
                        title="Arrastra para redimensionar columna"
                      >
                        <div className="w-[2px] h-3.5 bg-slate-300 group-hover:bg-blue-600 transition-colors" />
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredLines.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="p-6 text-center text-slate-400">
                        No hay líneas de medición en esta partida. Haz clic en "Añadir línea" para comenzar.
                      </td>
                    </tr>
                  ) : (
                    filteredLines.map((line, idx) => {
                      const actualIdx = allLines.findIndex((l) => l === line);
                      const isSelected = selectedLineIndex === actualIdx;
                      const lineFase = String(line.fase ?? '0');
                      const isLineLocked = Boolean(line.fase && line.fase !== '0' && phases.find((p) => p.id === String(line.fase))?.estado === 'cerrada');
                      const lineId = line.id || `idx_${actualIdx}`;

                      const handleInputKeyDown = (e: React.KeyboardEvent) => {
                        if (e.key === 'Enter' || e.key === 'Return') {
                          e.preventDefault();
                          e.stopPropagation();
                          handleAddLine();
                        }
                      };

                      return (
                        <tr
                          key={line.id || idx}
                          onClick={() => setSelectedLineIndex(actualIdx)}
                          className={`transition-colors ${
                            isLineLocked
                              ? 'bg-slate-100/70 text-slate-500'
                              : isSelected
                              ? 'bg-blue-100/80 font-medium'
                              : 'hover:bg-blue-50/40'
                          }`}
                        >
                          <td className="p-1 border-r border-slate-300 text-center font-mono text-[11px] text-slate-500">
                            <div className="flex items-center justify-center space-x-1">
                              <span>{idx + 1}</span>
                              {isLineLocked && (
                                <span title="Línea bloqueada: fase cerrada">
                                  <Lock className="w-3 h-3 text-rose-500" />
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Fase Cell: In budget mode, locked to 'Presupuesto' as requested by user! */}
                          <td className="p-1 border-r border-slate-300 text-center">
                            {isBudgetMode ? (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200" title="En modo presupuesto, todas las mediciones pertenecen a la medición inicial">
                                Presupuesto
                              </span>
                            ) : (
                              <select
                                value={lineFase}
                                disabled={isLineLocked}
                                onFocus={() => setSelectedLineIndex(actualIdx)}
                                onChange={(e) => handleCellChange(actualIdx, 'fase', e.target.value)}
                                className={`bg-transparent text-[11px] font-semibold text-blue-900 border-none outline-none cursor-pointer ${
                                  isLineLocked ? 'opacity-60 cursor-not-allowed' : ''
                                }`}
                              >
                                <option value="0">Presupuesto</option>
                                {phases.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    Fase {p.numero} {p.estado === 'cerrada' ? '(Cerrada)' : ''}
                                  </option>
                                ))}
                              </select>
                            )}
                          </td>

                          {/* Espacio Cell */}
                          <td className="p-0 border-r border-slate-300">
                            <input
                              type="text"
                              id={`med_input_espacio_${lineId}`}
                              value={line.espacio || ''}
                              disabled={isLineLocked}
                              onFocus={() => setSelectedLineIndex(actualIdx)}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedLineIndex(actualIdx);
                              }}
                              onChange={(e) => handleCellChange(actualIdx, 'espacio', e.target.value)}
                              onKeyDown={handleInputKeyDown}
                              placeholder=""
                              className={`w-full px-1.5 py-1 text-xs border-none outline-none focus:bg-white bg-transparent ${
                                isLineLocked ? 'cursor-not-allowed text-slate-500' : ''
                              }`}
                            />
                          </td>

                          {/* Comentario Cell */}
                          <td className="p-0 border-r border-slate-300">
                            <input
                              type="text"
                              id={`med_input_comentario_${lineId}`}
                              value={line.comentario || ''}
                              disabled={isLineLocked}
                              onFocus={() => setSelectedLineIndex(actualIdx)}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedLineIndex(actualIdx);
                              }}
                              onChange={(e) => handleCellChange(actualIdx, 'comentario', e.target.value)}
                              onKeyDown={handleInputKeyDown}
                              placeholder=""
                              className={`w-full px-1.5 py-1 text-xs border-none outline-none focus:bg-white bg-transparent ${
                                isLineLocked ? 'cursor-not-allowed text-slate-500' : ''
                              }`}
                            />
                          </td>

                          {/* N Cell */}
                          <td className="p-0 border-r border-slate-300">
                            <input
                              type="text"
                              id={`med_input_n_${lineId}`}
                              value={line.n ?? ''}
                              disabled={isLineLocked}
                              onFocus={() => setSelectedLineIndex(actualIdx)}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedLineIndex(actualIdx);
                              }}
                              onChange={(e) => handleCellChange(actualIdx, 'n', e.target.value)}
                              onKeyDown={handleInputKeyDown}
                              placeholder=""
                              className={`w-full px-1.5 py-1 text-xs text-right font-mono tabular-nums border-none outline-none focus:bg-white bg-transparent ${
                                isLineLocked ? 'cursor-not-allowed text-slate-500' : ''
                              }`}
                            />
                          </td>

                          {/* Longitud Cell */}
                          <td className="p-0 border-r border-slate-300">
                            <input
                              type="text"
                              id={`med_input_longitud_${lineId}`}
                              value={line.longitud ?? ''}
                              disabled={isLineLocked}
                              onFocus={() => setSelectedLineIndex(actualIdx)}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedLineIndex(actualIdx);
                              }}
                              onChange={(e) => handleCellChange(actualIdx, 'longitud', e.target.value)}
                              onKeyDown={handleInputKeyDown}
                              placeholder=""
                              className={`w-full px-1.5 py-1 text-xs text-right font-mono tabular-nums border-none outline-none focus:bg-white bg-transparent ${
                                isLineLocked ? 'cursor-not-allowed text-slate-500' : ''
                              }`}
                            />
                          </td>

                          {/* Anchura Cell */}
                          <td className="p-0 border-r border-slate-300">
                            <input
                              type="text"
                              id={`med_input_anchura_${lineId}`}
                              value={line.anchura ?? ''}
                              disabled={isLineLocked}
                              onFocus={() => setSelectedLineIndex(actualIdx)}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedLineIndex(actualIdx);
                              }}
                              onChange={(e) => handleCellChange(actualIdx, 'anchura', e.target.value)}
                              onKeyDown={handleInputKeyDown}
                              placeholder=""
                              className={`w-full px-1.5 py-1 text-xs text-right font-mono tabular-nums border-none outline-none focus:bg-white bg-transparent ${
                                isLineLocked ? 'cursor-not-allowed text-slate-500' : ''
                              }`}
                            />
                          </td>

                          {/* Altura Cell */}
                          <td className="p-0 border-r border-slate-300">
                            <input
                              type="text"
                              id={`med_input_altura_${lineId}`}
                              value={line.altura ?? ''}
                              disabled={isLineLocked}
                              onFocus={() => setSelectedLineIndex(actualIdx)}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedLineIndex(actualIdx);
                              }}
                              onChange={(e) => handleCellChange(actualIdx, 'altura', e.target.value)}
                              onKeyDown={handleInputKeyDown}
                              placeholder=""
                              className={`w-full px-1.5 py-1 text-xs text-right font-mono tabular-nums border-none outline-none focus:bg-white bg-transparent ${
                                isLineLocked ? 'cursor-not-allowed text-slate-500' : ''
                              }`}
                            />
                          </td>

                          {/* Fórmula Cell */}
                          <td className="p-0 border-r border-slate-300">
                            <input
                              type="text"
                              id={`med_input_formula_${lineId}`}
                              value={line.formula || ''}
                              disabled={isLineLocked}
                              onFocus={() => setSelectedLineIndex(actualIdx)}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedLineIndex(actualIdx);
                              }}
                              onChange={(e) => handleCellChange(actualIdx, 'formula', e.target.value)}
                              onKeyDown={handleInputKeyDown}
                              placeholder=""
                              className={`w-full px-1.5 py-1 text-xs font-mono text-slate-700 border-none outline-none focus:bg-white bg-transparent ${
                                isLineLocked ? 'cursor-not-allowed text-slate-500' : ''
                              }`}
                            />
                          </td>

                          {/* Parcial / Cantidad Cell */}
                          <td className="p-1 text-right font-mono font-semibold text-slate-900 tabular-nums">
                            {(line.cantidad ?? computeLineQuantity(line)).toFixed(2)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Fases de Certificación (MATCHING PRESTO IMAGE 2 EXACTLY!) */}
      {activeTab === 'fases' && (
        <div className="flex-1 flex flex-col bg-white overflow-hidden text-xs">
          {/* Presto Header Banner (Image 2: "Fases <Código> <Unidad> <Resumen>") */}
          <div className="bg-slate-100 border-b border-slate-300 px-3 py-2 flex flex-wrap items-center justify-between gap-2 shrink-0">
            <div className="flex items-center space-x-2">
              <span className="font-bold text-slate-900 text-sm">
                Fases {concept?.codigo} {concept?.unidad || ''} {concept?.resumen || ''}
              </span>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center space-x-1.5">
              <button
                onClick={() => onAddNewFase('', '')}
                className="flex items-center space-x-1 bg-white hover:bg-blue-50 text-blue-700 border border-slate-300 px-2.5 py-1 rounded font-medium shadow-2xs"
                title="Añadir una nueva fase correlativa a la tabla"
              >
                <Plus className="w-3.5 h-3.5 text-blue-600" />
                <span>+ Añadir Fase</span>
              </button>

              <button
                onClick={() => onGenerateMonthlyFases()}
                className="flex items-center space-x-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 px-2.5 py-1 rounded font-medium shadow-2xs"
                title="Generar 12 fases mensuales automáticas (31-Ene, 28-Feb, 31-Mar...)"
              >
                <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                <span>Generar 12 Fases Mensuales</span>
              </button>

              {onToggleFaseEstado && (
                <button
                  onClick={() => {
                    const currentPhase = phases.find((p) => p.id === activeFaseId);
                    onToggleFaseEstado(activeFaseId);
                    const willClose = currentPhase?.estado !== 'cerrada';
                    showToast(willClose ? `Fase ${currentPhase?.numero || activeFaseId} cerrada y bloqueada` : `Fase ${currentPhase?.numero || activeFaseId} reabierta`);
                  }}
                  className={`flex items-center space-x-1 px-2.5 py-1 rounded font-medium shadow-2xs border transition-colors ${
                    phases.find((p) => p.id === activeFaseId)?.estado === 'cerrada'
                      ? 'bg-amber-100 hover:bg-amber-200 text-amber-900 border-amber-300'
                      : 'bg-rose-50 hover:bg-rose-100 text-rose-800 border-rose-300'
                  }`}
                  title="Cerrar y bloquear todos los datos de esta certificación para evitar cambios"
                >
                  {phases.find((p) => p.id === activeFaseId)?.estado === 'cerrada' ? (
                    <>
                      <Unlock className="w-3.5 h-3.5 text-amber-700" />
                      <span>Reabrir Fase Activa</span>
                    </>
                  ) : (
                    <>
                      <Lock className="w-3.5 h-3.5 text-rose-600" />
                      <span>Cerrar Certificación Activa</span>
                    </>
                  )}
                </button>
              )}

              <button
                onClick={() => {
                  const currentPhase = phases.find((p) => p.id === activeFaseId);
                  if (currentPhase?.estado === 'cerrada') {
                    showToast('No se puede modificar: la fase activa está cerrada');
                    return;
                  }
                  if (currentNodeCode && selectedConceptCode) {
                    onUpdateCertificationDirect(currentNodeCode, selectedConceptCode, activeFaseId, canPresTotal);
                    showToast('Certificado el 100% de la partida');
                  }
                }}
                disabled={isChapterOrSub || phases.find((p) => p.id === activeFaseId)?.estado === 'cerrada'}
                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded font-medium shadow-2xs"
                title="Certificar el 100% del presupuesto en la fase activa"
              >
                Certificar 100%
              </button>

              <button
                onClick={() => {
                  const currentPhase = phases.find((p) => p.id === activeFaseId);
                  if (currentPhase?.estado === 'cerrada') {
                    showToast('No se puede modificar: la fase activa está cerrada');
                    return;
                  }
                  if (currentNodeCode && selectedConceptCode) {
                    onUpdateCertificationDirect(currentNodeCode, selectedConceptCode, activeFaseId, round4(canPresTotal * 0.5));
                    showToast('Certificado el 50% de la partida');
                  }
                }}
                disabled={isChapterOrSub || phases.find((p) => p.id === activeFaseId)?.estado === 'cerrada'}
                className="px-2.5 py-1 bg-white hover:bg-slate-50 disabled:opacity-40 text-slate-700 border border-slate-300 rounded font-medium shadow-2xs"
                title="Certificar el 50% del presupuesto en la fase activa"
              >
                Certificar 50%
              </button>
            </div>
          </div>

          {/* Subheader dropdown (Image 2: "Certificación ▼") */}
          <div className="bg-slate-50 px-3 py-1.5 border-b border-slate-200 flex items-center justify-between text-xs">
            <div className="flex items-center space-x-2">
              <select
                className="bg-white border border-slate-300 rounded px-2 py-0.5 font-medium text-slate-800 text-xs shadow-2xs cursor-pointer"
                defaultValue="certificacion"
              >
                <option value="certificacion">Certificación</option>
              </select>
              <span className="text-slate-400">·</span>
              <span className="text-slate-500 font-mono text-[11px]">
                Presupuesto: <strong className="text-slate-800">{canPresTotal.toFixed(2)} {concept?.unidad || ''}</strong> ({precioUnitario.toFixed(2)} €/ud) = <strong className="text-blue-900">{round2(canPresTotal * precioUnitario).toFixed(2)} €</strong>
              </span>
            </div>

            <div className="text-[11px] text-slate-500">
              Haz clic en cualquier fila para activar esa fase
            </div>
          </div>

          {/* Table matching Presto Image 2 layout */}
          <div className="flex-1 overflow-auto bg-white">
            <table className="w-full border-collapse text-xs table-fixed">
              <colgroup>
                <col style={{ width: `${fasesColWidths.m || 45}px` }} />
                <col style={{ width: `${fasesColWidths.fecha || 130}px` }} />
                <col style={{ width: `${fasesColWidths.canCert || 100}px` }} />
                <col style={{ width: `${fasesColWidths.orCanCert || 100}px` }} />
                <col style={{ width: `${fasesColWidths.porCertPres || 90}px` }} />
                <col style={{ width: `${fasesColWidths.cert || 95}px` }} />
                <col style={{ width: `${fasesColWidths.orCert || 105}px` }} />
                <col style={{ width: `${fasesColWidths.nota || 240}px` }} />
                <col style={{ width: `${fasesColWidths.estado || 95}px` }} />
                <col style={{ width: `${fasesColWidths.del || 45}px` }} />
              </colgroup>
              <thead className="bg-slate-100 text-slate-700 sticky top-0 font-semibold border-b border-slate-300 select-none shadow-2xs">
                <tr>
                  <th className="relative p-1.5 border-r border-slate-300 text-center font-mono text-slate-500">
                    <span>[M]</span>
                    <div
                      onMouseDown={(e) => handleStartResizeFases('m', e)}
                      className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize hover:bg-blue-500/20 group flex items-center justify-end z-20"
                      title="Arrastra para redimensionar columna"
                    >
                      <div className="w-[2px] h-3.5 bg-slate-300 group-hover:bg-blue-600 transition-colors" />
                    </div>
                  </th>
                  <th className="relative p-1.5 border-r border-slate-300 text-left">
                    <span>Fecha</span>
                    <div
                      onMouseDown={(e) => handleStartResizeFases('fecha', e)}
                      className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize hover:bg-blue-500/20 group flex items-center justify-end z-20"
                      title="Arrastra para redimensionar columna"
                    >
                      <div className="w-[2px] h-3.5 bg-slate-300 group-hover:bg-blue-600 transition-colors" />
                    </div>
                  </th>
                  <th className="relative p-1.5 border-r border-slate-300 text-right group" title={`Cantidad certificada en esta fase (${concept?.unidad || 'ud'})`}>
                    <span>CanCert ({concept?.unidad || 'ud'})</span>
                    <div
                      onMouseDown={(e) => handleStartResizeFases('canCert', e)}
                      className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize hover:bg-blue-500/20 group flex items-center justify-end z-20"
                      title="Arrastra para redimensionar columna"
                    >
                      <div className="w-[2px] h-3.5 bg-slate-300 group-hover:bg-blue-600 transition-colors" />
                    </div>
                  </th>
                  <th className="relative p-1.5 border-r border-slate-300 text-right" title={`Cantidad acumulada a origen (${concept?.unidad || 'ud'})`}>
                    <span>OrCanCert ({concept?.unidad || 'ud'})</span>
                    <div
                      onMouseDown={(e) => handleStartResizeFases('orCanCert', e)}
                      className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize hover:bg-blue-500/20 group flex items-center justify-end z-20"
                      title="Arrastra para redimensionar columna"
                    >
                      <div className="w-[2px] h-3.5 bg-slate-300 group-hover:bg-blue-600 transition-colors" />
                    </div>
                  </th>
                  <th className="relative p-1.5 border-r border-slate-300 text-right" title="% respecto al presupuesto">
                    <span>% CertPres</span>
                    <div
                      onMouseDown={(e) => handleStartResizeFases('porCertPres', e)}
                      className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize hover:bg-blue-500/20 group flex items-center justify-end z-20"
                      title="Arrastra para redimensionar columna"
                    >
                      <div className="w-[2px] h-3.5 bg-slate-300 group-hover:bg-blue-600 transition-colors" />
                    </div>
                  </th>
                  <th className="relative p-1.5 border-r border-slate-300 text-right" title="Importe en esta fase (€)">
                    <span>Cert (€)</span>
                    <div
                      onMouseDown={(e) => handleStartResizeFases('cert', e)}
                      className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize hover:bg-blue-500/20 group flex items-center justify-end z-20"
                      title="Arrastra para redimensionar columna"
                    >
                      <div className="w-[2px] h-3.5 bg-slate-300 group-hover:bg-blue-600 transition-colors" />
                    </div>
                  </th>
                  <th className="relative p-1.5 border-r border-slate-300 text-right" title="Importe acumulado a origen (€)">
                    <span>OrCert (€)</span>
                    <div
                      onMouseDown={(e) => handleStartResizeFases('orCert', e)}
                      className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize hover:bg-blue-500/20 group flex items-center justify-end z-20"
                      title="Arrastra para redimensionar columna"
                    >
                      <div className="w-[2px] h-3.5 bg-slate-300 group-hover:bg-blue-600 transition-colors" />
                    </div>
                  </th>
                  <th className="relative p-1.5 border-r border-slate-300 text-left" title="Nota o comentario de certificación para esta fase">
                    <span>Nota</span>
                    <div
                      onMouseDown={(e) => handleStartResizeFases('nota', e)}
                      className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize hover:bg-blue-500/20 group flex items-center justify-end z-20"
                      title="Arrastra para redimensionar columna"
                    >
                      <div className="w-[2px] h-3.5 bg-slate-300 group-hover:bg-blue-600 transition-colors" />
                    </div>
                  </th>
                  <th className="relative p-1.5 border-r border-slate-300 text-center" title="Cerrar y bloquear certificación">
                    <span>Estado</span>
                    <div
                      onMouseDown={(e) => handleStartResizeFases('estado', e)}
                      className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize hover:bg-blue-500/20 group flex items-center justify-end z-20"
                      title="Arrastra para redimensionar columna"
                    >
                      <div className="w-[2px] h-3.5 bg-slate-300 group-hover:bg-blue-600 transition-colors" />
                    </div>
                  </th>
                  <th className="p-1.5 text-center text-slate-400">
                    -
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {phases.map((phase, idx) => {
                  const isActive = phase.id === activeFaseId;
                  const isPhaseClosed = phase.estado === 'cerrada';

                  // Compute stats for this phase (including measurement lines assigned to this phase)
                  const phaseMedLines = (currentRel?.mediciones || []).filter((m) => String(m.fase) === String(phase.id));
                  const phaseCertLines = currentRel?.certificaciones?.[phase.id] || [];
                  const allPhaseLines = [...phaseMedLines, ...phaseCertLines];
                  const linesSum = allPhaseLines.reduce((s, l) => s + (l.cantidad || computeLineQuantity(l)), 0);
                  const directCant = currentRel?.cantidadesCertificadas?.[phase.id];
                  const canCert = round4(linesSum > 0 ? linesSum : (directCant !== undefined ? directCant : 0));

                  // Calculate OrCanCert (cumulative up to this phase)
                  let orCanCert = 0;
                  for (let i = 0; i <= idx; i++) {
                    const p = phases[i];
                    const pMedLines = (currentRel?.mediciones || []).filter((m) => String(m.fase) === String(p.id));
                    const pCertLines = currentRel?.certificaciones?.[p.id] || [];
                    const pLines = [...pMedLines, ...pCertLines];
                    const pSum = pLines.reduce((s, l) => s + (l.cantidad || computeLineQuantity(l)), 0);
                    const pDirect = currentRel?.cantidadesCertificadas?.[p.id];
                    orCanCert += pSum > 0 ? pSum : (pDirect !== undefined ? pDirect : 0);
                  }
                  orCanCert = round4(orCanCert);

                  const porCertPres = canPresTotal > 0 ? round2((orCanCert / canPresTotal) * 100) : 0;
                  const cert = round2(canCert * precioUnitario);
                  const orCert = round2(orCanCert * precioUnitario);

                  // Crucial requirement: for new or uncertified phases (canCert is 0 and no input yet),
                  // they MUST go to 0,00 / blank and not show/carry values of the previous certification!
                  const hasPhaseCert = canCert > 0;
                  const displayOrCanCert = hasPhaseCert ? orCanCert.toFixed(2) : '0,00';
                  const displayPorCertPres = hasPhaseCert ? `${porCertPres.toFixed(2)}%` : '0,00%';
                  const displayCert = hasPhaseCert ? cert.toFixed(2) : '0,00';
                  const displayOrCert = hasPhaseCert ? orCert.toFixed(2) : '0,00';

                  const nota = (currentRel?.notasCertificacion?.[phase.id] !== undefined)
                    ? currentRel.notasCertificacion[phase.id]
                    : (concept?.notasCertificacion?.[phase.id] !== undefined
                      ? concept.notasCertificacion[phase.id]
                      : (phase.observaciones || ''));

                  return (
                    <tr
                      key={phase.id}
                      onClick={() => onChangeActiveFase(phase.id)}
                      className={`cursor-pointer transition-colors ${
                        isActive
                          ? isPhaseClosed
                            ? 'bg-rose-100/60 font-semibold'
                            : 'bg-amber-100/70 font-semibold'
                          : isPhaseClosed
                          ? 'bg-slate-50/80 text-slate-600'
                          : 'hover:bg-amber-50/50'
                      }`}
                    >
                      {/* [M] with Presto arrow indicator on active row */}
                      <td className="p-1.5 border-r border-slate-300 text-center font-mono text-slate-700">
                        <div className="flex items-center justify-center space-x-1">
                          <span>{idx + 1}</span>
                          {isActive && <span className="text-amber-800 font-bold text-[10px]">▶</span>}
                        </div>
                      </td>

                      {/* Fecha (Presto styled: soft peach if active, editable unless closed) */}
                      <td className={`p-1 border-r border-slate-300 font-mono text-[11px] ${isActive ? 'bg-orange-200/50 text-orange-950 font-bold' : 'text-slate-800'}`}>
                        {editingFechaFaseId === phase.id && !isPhaseClosed ? (
                          <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="text"
                              value={tempFechaVal}
                              onChange={(e) => setTempFechaVal(e.target.value)}
                              onBlur={() => {
                                onUpdateFaseFecha(phase.id, tempFechaVal.trim() || phase.fecha);
                                setEditingFechaFaseId(null);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  onUpdateFaseFecha(phase.id, tempFechaVal.trim() || phase.fecha);
                                  setEditingFechaFaseId(null);
                                }
                                if (e.key === 'Escape') setEditingFechaFaseId(null);
                              }}
                              className="w-full bg-white border border-blue-500 px-1 py-0.5 rounded text-xs outline-none"
                              autoFocus
                            />
                          </div>
                        ) : (
                          <span
                            onDoubleClick={(e) => {
                              if (isPhaseClosed) return;
                              e.stopPropagation();
                              setEditingFechaFaseId(phase.id);
                              setTempFechaVal(phase.fecha);
                            }}
                            title={isPhaseClosed ? 'Fase cerrada y bloqueada' : 'Doble clic para editar fecha'}
                            className={isPhaseClosed ? 'text-slate-500' : ''}
                          >
                            {phase.fecha}
                          </span>
                        )}
                      </td>

                      {/* CanCert (Presto yellow spreadsheet editable cell unless closed) */}
                      <td className={`p-1 border-r border-slate-300 text-right font-mono tabular-nums text-slate-900 ${
                        isPhaseClosed ? 'bg-slate-100 text-slate-500' : 'bg-amber-50/60'
                      }`}>
                        <input
                          type="number"
                          step="any"
                          value={canCert ? canCert : ''}
                          placeholder="0,00"
                          disabled={isPhaseClosed}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            if (isPhaseClosed) return;
                            if (currentNodeCode && selectedConceptCode) {
                              const val = parseFloat(e.target.value);
                              onUpdateCertificationDirect(currentNodeCode, selectedConceptCode, phase.id, isNaN(val) ? 0 : val);
                            }
                          }}
                          className={`w-full text-right bg-transparent border-none outline-none focus:bg-white focus:ring-1 focus:ring-blue-500 rounded px-1 py-0.5 font-mono text-xs ${
                            isPhaseClosed ? 'cursor-not-allowed opacity-60 text-slate-500' : ''
                          }`}
                        />
                      </td>

                      {/* OrCanCert (Calculated cumulative - 0,00 if phase is not certified yet) */}
                      <td className="p-1.5 border-r border-slate-300 text-right font-mono tabular-nums text-slate-700 bg-amber-50/30"
                          title={hasPhaseCert ? `Acumulado a origen: ${orCanCert.toFixed(2)}` : 'Sin certificar en esta fase (0,00)'}>
                        {displayOrCanCert}
                      </td>

                      {/* PorCertPres (Calculated % - 0,00% if phase is not certified yet) */}
                      <td className="p-1.5 border-r border-slate-300 text-right font-mono tabular-nums text-slate-800 bg-amber-50/30">
                        <span className={hasPhaseCert && porCertPres >= 100 ? 'text-emerald-700 font-bold' : ''}>
                          {displayPorCertPres}
                        </span>
                      </td>

                      {/* Cert (Calculated amount this phase) */}
                      <td className="p-1.5 border-r border-slate-300 text-right font-mono tabular-nums font-semibold text-slate-900 bg-amber-50/30">
                        {displayCert}
                      </td>

                      {/* OrCert (Calculated amount to origin) */}
                      <td className="p-1.5 border-r border-slate-300 text-right font-mono tabular-nums font-bold text-slate-900 bg-amber-50/30"
                          title={hasPhaseCert ? `Importe a origen: ${orCert.toFixed(2)} €` : 'Sin certificar en esta fase (0,00 €)'}>
                        {displayOrCert}
                      </td>

                      {/* Nota (Editable text note - persists across phase and all navigation) */}
                      <td className="p-1 border-r border-slate-300">
                        <input
                          type="text"
                          value={nota}
                          placeholder=""
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            onUpdateFaseNota(currentNodeCode || '', selectedConceptCode || '', phase.id, e.target.value);
                          }}
                          className="w-full bg-transparent border-none outline-none focus:bg-white focus:ring-1 focus:ring-blue-500 rounded px-1.5 py-0.5 text-xs text-slate-700 font-sans"
                        />
                      </td>

                      {/* Estado / Cerrar Certificación Button */}
                      <td className="p-1 border-r border-slate-300 text-center" onClick={(e) => e.stopPropagation()}>
                        {onToggleFaseEstado && (
                          <button
                            onClick={() => {
                              onToggleFaseEstado(phase.id);
                              showToast(isPhaseClosed ? `Fase ${phase.numero} reabierta` : `Fase ${phase.numero} cerrada y bloqueada`);
                            }}
                            className={`px-2 py-0.5 rounded text-[11px] font-semibold flex items-center justify-center space-x-1 mx-auto transition-colors border shadow-2xs ${
                              isPhaseClosed
                                ? 'bg-rose-50 text-rose-800 border-rose-300 hover:bg-rose-100'
                                : 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                            }`}
                            title={isPhaseClosed ? 'Certificación cerrada y bloqueada (clic para reabrir)' : 'Cerrar y bloquear datos de esta certificación'}
                          >
                            {isPhaseClosed ? (
                              <>
                                <Lock className="w-3 h-3 text-rose-600" />
                                <span>Cerrada</span>
                              </>
                            ) : (
                              <>
                                <Unlock className="w-3 h-3 text-emerald-600" />
                                <span>Cerrar</span>
                              </>
                            )}
                          </button>
                        )}
                      </td>

                      {/* Delete phase button */}
                      <td className="p-1 text-center" onClick={(e) => e.stopPropagation()}>
                        {phases.length > 1 && (
                          <button
                            onClick={() => {
                              if (isPhaseClosed) {
                                showToast('No se puede eliminar una fase cerrada');
                                return;
                              }
                              onDeleteFase(phase.id);
                            }}
                            disabled={isPhaseClosed}
                            className={`p-0.5 rounded ${isPhaseClosed ? 'opacity-30 cursor-not-allowed text-slate-400' : 'text-slate-400 hover:text-rose-600'}`}
                            title={isPhaseClosed ? 'Fase cerrada' : 'Eliminar esta fase'}
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Texto Descriptivo */}
      {activeTab === 'texto' && (
        <div className="flex-1 flex flex-col p-4 bg-slate-50 overflow-hidden text-xs">
          {/* Short description card */}
          <div className="mb-3 bg-white border border-slate-200 rounded-lg p-2.5 shadow-2xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
              Descripción breve / Designación (Resumen):
            </span>
            <div className="font-semibold text-slate-800 text-xs select-text">
              {concept?.resumen || '(Sin descripción corta definida)'}
            </div>
          </div>

          <div className="mb-1.5 flex items-center justify-between text-slate-600">
            <span className="font-semibold text-slate-700">
              Pliego de condiciones / Texto largo descriptivo (~T en FIEBDC-3):
            </span>
            <span className="text-[11px] text-slate-400">
              Guarda automáticamente al escribir
            </span>
          </div>
          <textarea
            value={concept?.texto !== undefined && concept?.texto !== '' ? concept.texto : (concept?.resumen || '')}
            onChange={(e) => {
              if (selectedConceptCode) {
                onUpdateConceptText(selectedConceptCode, e.target.value);
              }
            }}
            placeholder="Especificaciones técnicas, prescripciones de materiales, modo de ejecución, criterios de medición y abono..."
            className="flex-1 w-full bg-white border border-slate-300 rounded-lg p-3 text-xs text-slate-800 leading-relaxed font-sans resize-none focus:outline-none focus:border-blue-500 shadow-2xs"
          />
        </div>
      )}

      {/* Tab 4: Descompuestos / Info */}
      {activeTab === 'info' && (
        <div className="flex-1 p-4 bg-slate-50 overflow-auto text-xs space-y-3">
          <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-2xs">
            <h4 className="font-bold text-slate-800 text-sm mb-2">Información del Concepto</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-slate-600">
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Código</span>
                <span className="font-mono font-bold text-slate-900 text-sm">{concept?.codigo || '-'}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Tipo de concepto</span>
                <span className="font-semibold text-slate-800 uppercase">{itemType}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Unidad</span>
                <span className="font-mono font-semibold text-slate-800">{concept?.unidad || '(Capítulo)'}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Precio Unitario</span>
                <span className="font-mono font-bold text-blue-900 text-sm">{(concept?.precio || 0).toFixed(2)} €</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
