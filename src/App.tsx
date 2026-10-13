import React, { useState, useEffect, useRef } from 'react';
import { PanelLeftOpen, Loader2, CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { Header } from './components/Header';
import { ProjectTreeSidebar } from './components/ProjectTreeSidebar';
import { BudgetTable } from './components/BudgetTable';
import { DetailPanel } from './components/DetailPanel';
import { NewItemModal } from './components/NewItemModal';
import { ExcelImportModal } from './components/ExcelImportModal';
import { PasteBc3Modal } from './components/PasteBc3Modal';
import { ImportDiagnosticsModal } from './components/ImportDiagnosticsModal';
import { ProyectoBC3, LineaMedicion, Concepto, RelacionEstructura, FaseCertificacion, ImportDiagnostics } from './types/bc3';
import {
  parseBC3,
  recalculateBudget,
  round2,
  round4,
  createEmptyProject,
  getPrestoPhaseDate,
  getNextPhaseDate,
  wouldCreateCycle,
} from './utils/bc3Parser';
import { parseBC3FileWithWorker } from './utils/bc3WorkerClient';
import { loadProjectFromDB, saveProjectToDB } from './utils/dbStorage';
import {
  copyConceptItem,
  getConceptClipboard,
  getConceptClipboardAsync,
  hasConceptClipboard,
  clearConceptClipboard,
  setConceptClipboardDirectly,
  parseConceptFromText,
  CopiedConceptData,
} from './utils/clipboardStore';
import { SAMPLE_BC3_DATA } from './data/sampleBc3';

export default function App() {
  const [project, setProject] = useState<ProyectoBC3 | null>(null);
  const [currentNodeCode, setCurrentNodeCode] = useState<string | null>(null);
  const [selectedConceptCode, setSelectedConceptCode] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'presupuesto' | 'certificacion'>('presupuesto');
  const [activeFaseId, setActiveFaseId] = useState<string>('1');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [, setClipboardVersion] = useState(0);

  // Persistence & Autosave state
  const [lastSavedTimestamp, setLastSavedTimestamp] = useState<number | null>(null);
  const isInitialLoadDone = useRef(false);

  // Import diagnostics state
  const [importDiagnostics, setImportDiagnostics] = useState<ImportDiagnostics | null>(null);
  const [diagnosticsFileName, setDiagnosticsFileName] = useState<string>('archivo.bc3');
  const [isDiagnosticsModalOpen, setIsDiagnosticsModalOpen] = useState(false);

  // Background Worker Parsing Progress
  const [loadingProgress, setLoadingProgress] = useState<{
    isLoading: boolean;
    percent: number;
    message: string;
    fileName: string;
  }>({
    isLoading: false,
    percent: 0,
    message: '',
    fileName: '',
  });

  // Toast notification state
  const [toast, setToast] = useState<{
    id: number;
    message: string;
    type: 'success' | 'error' | 'info';
  } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Date.now();
    setToast({ id, message, type });
    setTimeout(() => {
      setToast((cur) => (cur?.id === id ? null : cur));
    }, 4500);
  };

  // Splitter height percentage for upper panel
  const [upperSplitPercent, setUpperSplitPercent] = useState(52);
  const isDraggingSplitter = useRef(false);

  // Modals state
  const [newItemModal, setNewItemModal] = useState<{
    isOpen: boolean;
    type: 'capitulo' | 'subcapitulo' | 'partida';
  }>({
    isOpen: false,
    type: 'partida',
  });
  const [isExcelModalOpen, setIsExcelModalOpen] = useState(false);
  const [isPasteModalOpen, setIsPasteModalOpen] = useState(false);

  // P0 Item 7 & 8: Real Autosave recovery from IndexedDB on startup
  useEffect(() => {
    async function initProject() {
      try {
        const stored = await loadProjectFromDB();
        if (stored && stored.project && stored.project.codigoRaiz) {
          recalculateBudget(stored.project);
          setProject(stored.project);
          setCurrentNodeCode(stored.project.codigoRaiz);
          const rootRels = stored.project.estructuras[stored.project.codigoRaiz || ''] || [];
          setSelectedConceptCode(rootRels[0]?.hijoCodigo || null);
          setLastSavedTimestamp(stored.savedAt);
        } else {
          // Initialize clean project only if nothing is in IndexedDB
          const initialProject = createEmptyProject();
          setProject(initialProject);
          setCurrentNodeCode(initialProject.codigoRaiz);
          setSelectedConceptCode(null);
          const ts = await saveProjectToDB(initialProject);
          setLastSavedTimestamp(ts);
        }
      } catch (err) {
        console.error('Error inicializando proyecto desde IndexedDB:', err);
        const initialProject = createEmptyProject();
        setProject(initialProject);
        setCurrentNodeCode(initialProject.codigoRaiz);
      } finally {
        isInitialLoadDone.current = true;
      }
    }

    initProject();
  }, []);

  // Debounced Autosave to IndexedDB whenever project updates
  useEffect(() => {
    if (!isInitialLoadDone.current || !project || !project.codigoRaiz) return;

    const timer = setTimeout(async () => {
      try {
        const ts = await saveProjectToDB(project);
        setLastSavedTimestamp(ts);
      } catch (err) {
        console.error('Error en autosave de IndexedDB:', err);
      }
    }, 1200);

    return () => clearTimeout(timer);
  }, [project]);

  // Sync clipboard state across browser tabs and windows when window regains focus or storage changes
  useEffect(() => {
    const handleSync = () => {
      setClipboardVersion((v) => v + 1);
    };
    window.addEventListener('focus', handleSync);
    window.addEventListener('storage', handleSync);
    return () => {
      window.removeEventListener('focus', handleSync);
      window.removeEventListener('storage', handleSync);
    };
  }, []);

  // Native global paste event handler
  useEffect(() => {
    const handleGlobalPaste = async (e: ClipboardEvent) => {
      const activeEl = document.activeElement as HTMLElement | null;
      const isInput =
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          (activeEl as any).isContentEditable);
      if (isInput) return;

      const isLowerPanel = activeEl?.closest('#lower-detail-panel');
      if (isLowerPanel) return;

      if (!currentNodeCode || !project) return;

      const clipText = e.clipboardData?.getData('text/plain') || e.clipboardData?.getData('text');
      if (clipText && clipText.trim()) {
        const parsed = parseConceptFromText(clipText);
        if (parsed) {
          e.preventDefault();
          e.stopPropagation();
          const ok = await handlePasteConcept(currentNodeCode, parsed);
          if (ok) {
            setConceptClipboardDirectly(parsed);
            setClipboardVersion((v) => v + 1);
            return;
          }
        }
      }

      const syncedClip = getConceptClipboard();
      if (syncedClip && syncedClip.concepto) {
        e.preventDefault();
        e.stopPropagation();
        await handlePasteConcept(currentNodeCode, syncedClip);
      }
    };

    window.addEventListener('paste', handleGlobalPaste);
    return () => window.removeEventListener('paste', handleGlobalPaste);
  }, [currentNodeCode, project]);

  // Splitter drag listener
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingSplitter.current) return;
      const container = document.getElementById('main-workspace');
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const relativeY = e.clientY - rect.top;
      const percentage = (relativeY / rect.height) * 100;
      if (percentage >= 15 && percentage <= 85) {
        setUpperSplitPercent(percentage);
      }
    };

    const handleMouseUp = () => {
      if (isDraggingSplitter.current) {
        isDraggingSplitter.current = false;
        document.body.style.cursor = 'default';
        document.body.style.userSelect = 'auto';
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // Keyboard shortcut Ctrl+B or Cmd+B to toggle tree sidebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        setIsSidebarOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const startSplitterDrag = () => {
    isDraggingSplitter.current = true;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  };

  // P0 Item 1 & 2 + P1 Item 14: Web Worker parsing + encoding detection + safe state replacement
  const handleOpenBC3File = async (file: File) => {
    setLoadingProgress({
      isLoading: true,
      percent: 5,
      message: 'Leyendo archivo en memoria...',
      fileName: file.name,
    });

    try {
      const { project: parsed, diagnostics } = await parseBC3FileWithWorker(
        file,
        file.name,
        (percent, message) => {
          setLoadingProgress((prev) => ({
            ...prev,
            percent,
            message,
          }));
        }
      );

      // Validate project before replacing current state (P1 Item 14)
      if (!parsed || !parsed.codigoRaiz || Object.keys(parsed.conceptos).length === 0) {
        throw new Error('El archivo no contiene un presupuesto FIEBDC-3 válido o carece de conceptos.');
      }

      setProject(parsed);
      setCurrentNodeCode(parsed.codigoRaiz);
      const rootRels = parsed.estructuras[parsed.codigoRaiz || ''] || [];
      setSelectedConceptCode(rootRels[0]?.hijoCodigo || null);

      setImportDiagnostics(diagnostics);
      setDiagnosticsFileName(file.name);
      setIsDiagnosticsModalOpen(true);

      const ts = await saveProjectToDB(parsed);
      setLastSavedTimestamp(ts);
      showToast(`Presupuesto "${file.name}" cargado correctamente`, 'success');
    } catch (err: any) {
      console.error('Error al analizar BC3:', err);
      showToast('Error al analizar el fichero BC3: ' + (err?.message || String(err)), 'error');
    } finally {
      setLoadingProgress((prev) => ({ ...prev, isLoading: false }));
    }
  };

  // Import raw BC3 text
  const handleImportRawText = async (text: string) => {
    try {
      const { project: parsed, diagnostics } = parseBC3(text, 'Texto directo');
      if (!parsed || !parsed.codigoRaiz || Object.keys(parsed.conceptos).length === 0) {
        throw new Error('El texto no contiene una estructura FIEBDC-3 reconocible.');
      }
      setProject(parsed);
      setCurrentNodeCode(parsed.codigoRaiz);
      const rootRels = parsed.estructuras[parsed.codigoRaiz || ''] || [];
      setSelectedConceptCode(rootRels[0]?.hijoCodigo || null);

      setImportDiagnostics(diagnostics);
      setDiagnosticsFileName('Texto BC3 importado');
      setIsDiagnosticsModalOpen(true);

      const ts = await saveProjectToDB(parsed);
      setLastSavedTimestamp(ts);
      showToast('Texto BC3 importado correctamente', 'success');
    } catch (err: any) {
      showToast('Error al analizar texto BC3: ' + (err?.message || String(err)), 'error');
    }
  };

  // Load demo sample
  const handleLoadDemo = () => {
    handleImportRawText(SAMPLE_BC3_DATA);
  };

  // Save / Load JSON
  const handleSaveJSON = () => {
    if (!project) return;
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `presupuesto_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('JSON exportado correctamente', 'success');
  };

  const handleLoadJSON = async (file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        if (!data || !data.codigoRaiz || !data.conceptos || !data.estructuras) {
          throw new Error('El archivo JSON no tiene la estructura de un proyecto PrestoWeb válido.');
        }
        recalculateBudget(data);
        setProject(data);
        setCurrentNodeCode(data.codigoRaiz);
        const rootRels = data.estructuras[data.codigoRaiz || ''] || [];
        setSelectedConceptCode(rootRels[0]?.hijoCodigo || null);
        const ts = await saveProjectToDB(data);
        setLastSavedTimestamp(ts);
        showToast('Proyecto JSON cargado', 'success');
      } catch (err: any) {
        showToast('Error al cargar archivo JSON: ' + (err.message || String(err)), 'error');
      }
    };
    reader.readAsText(file);
  };

  // Import from Excel
  const handleImportProjectFromExcel = async (newProject: ProyectoBC3, mode: 'replace' | 'append') => {
    if (mode === 'replace' || !project) {
      recalculateBudget(newProject);
      setProject(newProject);
      setCurrentNodeCode(newProject.codigoRaiz);
      const rootRels = newProject.estructuras[newProject.codigoRaiz || ''] || [];
      setSelectedConceptCode(rootRels[0]?.hijoCodigo || null);
      await saveProjectToDB(newProject);
      showToast('Proyecto reemplazado desde Excel', 'success');
    } else {
      if (!currentNodeCode) return;
      const merged: ProyectoBC3 = {
        ...project,
        conceptos: { ...project.conceptos, ...newProject.conceptos },
        estructuras: { ...project.estructuras },
      };

      Object.entries(newProject.estructuras).forEach(([k, rels]) => {
        if (k === newProject.codigoRaiz) {
          if (!merged.estructuras[currentNodeCode]) merged.estructuras[currentNodeCode] = [];
          merged.estructuras[currentNodeCode] = [...merged.estructuras[currentNodeCode], ...rels];
        } else {
          merged.estructuras[k] = rels;
        }
      });

      recalculateBudget(merged);
      setProject(merged);
      await saveProjectToDB(merged);
      showToast('Datos anexados desde Excel', 'success');
    }
  };

  // Up level navigation
  const handleGoUpLevel = () => {
    if (!project || !project.codigoRaiz || currentNodeCode === project.codigoRaiz) return;
    let parent: string | null = null;
    for (const [p, rels] of Object.entries(project.estructuras)) {
      if (rels.some((r) => r.hijoCodigo === currentNodeCode)) {
        parent = p;
        break;
      }
    }
    if (parent) {
      setCurrentNodeCode(parent);
      setSelectedConceptCode(null);
    }
  };

  // Navigation into node
  const handleNavigateToNode = (code: string) => {
    setCurrentNodeCode(code);
    const rels = project?.estructuras[code] || [];
    setSelectedConceptCode(rels[0]?.hijoCodigo || null);
  };

  // Update concept text
  const handleUpdateConceptText = (code: string, newText: string) => {
    if (!project) return;
    const co = project.conceptos[code];
    if (!co) return;
    const updated = {
      ...project,
      conceptos: {
        ...project.conceptos,
        [code]: { ...co, texto: newText },
      },
    };
    setProject(updated);
  };

  // Update measurement lines
  const handleUpdateMeasurements = (parentCode: string, childCode: string, newLines: LineaMedicion[]) => {
    if (!project) return;
    const rels = project.estructuras[parentCode] || [];
    const updatedRels = rels.map((r) => {
      if (r.hijoCodigo === childCode) {
        return { ...r, mediciones: newLines };
      }
      return r;
    });

    const updated = {
      ...project,
      estructuras: {
        ...project.estructuras,
        [parentCode]: updatedRels,
      },
    };
    recalculateBudget(updated);
    setProject(updated);
  };

  // Update concept field
  const handleUpdateConceptField = (code: string, field: keyof Concepto, value: any) => {
    if (!project) return;
    const co = project.conceptos[code];
    if (!co) return;
    const updated = {
      ...project,
      conceptos: {
        ...project.conceptos,
        [code]: { ...co, [field]: value },
      },
    };
    if (field === 'precio') {
      recalculateBudget(updated);
    }
    setProject(updated);
  };

  // Update relation field
  const handleUpdateRelField = (
    parentCode: string,
    childCode: string,
    field: keyof RelacionEstructura,
    value: any
  ) => {
    if (!project) return;
    const rels = project.estructuras[parentCode] || [];
    const updatedRels = rels.map((r) => {
      if (r.hijoCodigo === childCode) {
        return { ...r, [field]: value };
      }
      return r;
    });

    const updated = {
      ...project,
      estructuras: {
        ...project.estructuras,
        [parentCode]: updatedRels,
      },
    };
    recalculateBudget(updated);
    setProject(updated);
  };

  // Delete concept
  const handleDeleteConcept = (code: string) => {
    if (!project || !currentNodeCode) return;
    const rels = project.estructuras[currentNodeCode] || [];
    const updatedRels = rels.filter((r) => r.hijoCodigo !== code);

    const updated = {
      ...project,
      estructuras: {
        ...project.estructuras,
        [currentNodeCode]: updatedRels,
      },
    };
    recalculateBudget(updated);
    setProject(updated);
    if (selectedConceptCode === code) {
      setSelectedConceptCode(updatedRels[0]?.hijoCodigo || null);
    }
    showToast(`Elemento ${code} eliminado.`, 'info');
  };

  // Add certification phase
  const handleAddNewFase = (nombre: string, fecha: string) => {
    if (!project) return;
    const currentPhases = project.fases || [];
    const nextNum = currentPhases.length + 1;
    const newId = String(nextNum);
    const nextDate = getNextPhaseDate(currentPhases);

    const newFase: FaseCertificacion = {
      id: newId,
      numero: nextNum,
      nombre: nombre && nombre.trim() ? nombre.trim() : `Fase ${nextNum}`,
      fecha: fecha && fecha.trim() ? fecha.trim() : nextDate,
      estado: 'abierta',
      observaciones: '',
    };
    const updated = {
      ...project,
      fases: [...currentPhases, newFase],
      faseActivaId: newId,
    };
    setProject(updated);
    setActiveFaseId(newId);
    showToast(`Fase ${nextNum} creada`, 'success');
  };

  // Toggle phase lock
  const handleToggleFaseEstado = (faseId: string) => {
    if (!project) return;
    const phases = project.fases || [];
    const updatedPhases = phases.map((f) => {
      if (f.id === faseId) {
        const nextEstado: 'abierta' | 'cerrada' = f.estado === 'cerrada' ? 'abierta' : 'cerrada';
        return { ...f, estado: nextEstado };
      }
      return f;
    });
    setProject({ ...project, fases: updatedPhases });
  };

  // Update phase date
  const handleUpdateFaseFecha = (faseId: string, nuevaFecha: string) => {
    if (!project) return;
    const phases = project.fases || [];
    const updatedPhases = phases.map((f) => (f.id === faseId ? { ...f, fecha: nuevaFecha } : f));
    setProject({ ...project, fases: updatedPhases });
  };

  // Update phase note
  const handleUpdateFaseNota = (parentCode: string, childCode: string, faseId: string, nota: string) => {
    if (!project) return;

    let updatedEstructuras = { ...project.estructuras };
    let relFound = false;

    if (childCode) {
      if (parentCode && updatedEstructuras[parentCode]) {
        updatedEstructuras[parentCode] = updatedEstructuras[parentCode].map((rel) => {
          if (rel.hijoCodigo === childCode) {
            relFound = true;
            return {
              ...rel,
              notasCertificacion: {
                ...(rel.notasCertificacion || {}),
                [faseId]: nota,
              },
            };
          }
          return rel;
        });
      }

      if (!relFound) {
        for (const [pCode, rels] of Object.entries(updatedEstructuras)) {
          if (rels.some((r) => r.hijoCodigo === childCode)) {
            updatedEstructuras[pCode] = rels.map((rel) => {
              if (rel.hijoCodigo === childCode) {
                return {
                  ...rel,
                  notasCertificacion: {
                    ...(rel.notasCertificacion || {}),
                    [faseId]: nota,
                  },
                };
              }
              return rel;
            });
          }
        }
      }
    }

    let updatedConceptos = { ...project.conceptos };
    if (childCode && updatedConceptos[childCode]) {
      updatedConceptos[childCode] = {
        ...updatedConceptos[childCode],
        notasCertificacion: {
          ...(updatedConceptos[childCode].notasCertificacion || {}),
          [faseId]: nota,
        },
      };
    }

    const phases = project.fases || [];
    const updatedPhases = phases.map((f) => (f.id === faseId && !childCode ? { ...f, observaciones: nota } : f));

    setProject({
      ...project,
      fases: updatedPhases,
      estructuras: updatedEstructuras,
      conceptos: updatedConceptos,
    });
  };

  // Delete phase
  const handleDeleteFase = (faseId: string) => {
    if (!project) return;
    const phases = project.fases || [];
    if (phases.length <= 1) {
      showToast('Debe existir al menos una fase de certificación.', 'error');
      return;
    }
    const filtered = phases.filter((f) => f.id !== faseId);
    const renumbered = filtered.map((f, idx) => ({ ...f, numero: idx + 1, nombre: `Fase ${idx + 1}` }));
    const newActive = renumbered[0].id;
    setProject({ ...project, fases: renumbered, faseActivaId: newActive });
    setActiveFaseId(newActive);
  };

  // Generate 12 monthly phases
  const handleGenerateMonthlyFases = (year: number = new Date().getFullYear()) => {
    if (!project) return;
    const months = [
      { num: 1, name: 'Ene', days: 31 },
      { num: 2, name: 'Feb', days: 28 },
      { num: 3, name: 'Mar', days: 31 },
      { num: 4, name: 'Abr', days: 30 },
      { num: 5, name: 'May', days: 31 },
      { num: 6, name: 'Jun', days: 30 },
      { num: 7, name: 'Jul', days: 31 },
      { num: 8, name: 'Ago', days: 31 },
      { num: 9, name: 'Sep', days: 30 },
      { num: 10, name: 'Oct', days: 31 },
      { num: 11, name: 'Nov', days: 30 },
      { num: 12, name: 'Dic', days: 31 },
    ];
    const yrShort = String(year).slice(-2);
    const newPhases: FaseCertificacion[] = months.map((m) => ({
      id: String(m.num),
      numero: m.num,
      nombre: `Certificación ${m.num} (${m.name})`,
      fecha: `${m.days}-${m.name}-${yrShort}`,
      estado: 'abierta',
      observaciones: '',
    }));
    setProject({ ...project, fases: newPhases, faseActivaId: '1' });
    setActiveFaseId('1');
    showToast('12 fases mensuales generadas.', 'success');
  };

  // Direct certification update
  const handleUpdateCertificationDirect = (
    parentCode: string,
    childCode: string,
    faseId: string,
    cantidad: number
  ) => {
    if (!project) return;
    let updatedEstructuras = { ...project.estructuras };
    let foundInParent = false;

    if (parentCode && updatedEstructuras[parentCode]) {
      updatedEstructuras[parentCode] = updatedEstructuras[parentCode].map((rel) => {
        if (rel.hijoCodigo === childCode) {
          foundInParent = true;
          return {
            ...rel,
            cantidadesCertificadas: {
              ...(rel.cantidadesCertificadas || {}),
              [faseId]: cantidad,
            },
          };
        }
        return rel;
      });
    }

    if (!foundInParent) {
      for (const [pCode, rels] of Object.entries(updatedEstructuras)) {
        if (rels.some((r) => r.hijoCodigo === childCode)) {
          updatedEstructuras[pCode] = rels.map((rel) => {
            if (rel.hijoCodigo === childCode) {
              return {
                ...rel,
                cantidadesCertificadas: {
                  ...(rel.cantidadesCertificadas || {}),
                  [faseId]: cantidad,
                },
              };
            }
            return rel;
          });
          break;
        }
      }
    }

    const updated = {
      ...project,
      estructuras: updatedEstructuras,
    };
    recalculateBudget(updated);
    setProject(updated);
  };

  // Copy concept
  const handleCopyConcept = async (code: string) => {
    if (!project) return;
    const co = project.conceptos[code];
    if (!co) return;

    let rel: RelacionEstructura | undefined = undefined;
    if (currentNodeCode && project.estructuras[currentNodeCode]) {
      rel = project.estructuras[currentNodeCode].find((r) => r.hijoCodigo === code);
    }
    if (!rel) {
      for (const parentKey of Object.keys(project.estructuras)) {
        const found = (project.estructuras[parentKey] || []).find((r) => r.hijoCodigo === code);
        if (found) {
          rel = found;
          break;
        }
      }
    }
    if (!rel) {
      rel = {
        hijoCodigo: code,
        multiplicador: 1,
        cantidadBase: 1,
        cantidad: 1,
        importe: co.precio || 0,
        mediciones: [],
        certificaciones: {},
      };
    }

    const subEstructuras: Record<string, RelacionEstructura[]> = {};
    const subConceptos: Record<string, Concepto> = {};

    function collectChildren(parent: string) {
      const children = project!.estructuras[parent] || [];
      if (children.length > 0) {
        subEstructuras[parent] = [...children];
        children.forEach((cr) => {
          if (project!.conceptos[cr.hijoCodigo]) {
            subConceptos[cr.hijoCodigo] = { ...project!.conceptos[cr.hijoCodigo] };
          }
          collectChildren(cr.hijoCodigo);
        });
      }
    }
    collectChildren(code);

    const payload: CopiedConceptData = {
      concepto: { ...co },
      relacion: {
        ...rel,
        mediciones: (rel.mediciones || []).map((m) => ({
          ...m,
          id: `line_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        })),
        certificaciones: { ...(rel.certificaciones || {}) },
        cantidadesCertificadas: { ...(rel.cantidadesCertificadas || {}) },
      },
      subEstructuras,
      subConceptos,
      sourceParentCode: currentNodeCode || '',
      isCut: false,
    };

    await copyConceptItem(payload);
    setClipboardVersion((v) => v + 1);
    showToast(`Elemento "${co.codigo}" copiado al portapapeles`, 'info');
  };

  // Cut concept
  const handleCutConcept = async (code: string) => {
    await handleCopyConcept(code);
    const clipboard = getConceptClipboard();
    if (clipboard) {
      clipboard.isCut = true;
      await copyConceptItem(clipboard);
      setClipboardVersion((v) => v + 1);
      showToast(`Elemento "${code}" cortado`, 'info');
    }
  };

  // P0 Item 9 & 10: Cycle Protection & Subtree Remap on Paste
  const handlePasteConcept = async (
    targetParentCode: string,
    providedData?: CopiedConceptData
  ): Promise<boolean> => {
    if (!project) return false;
    const clipboard = providedData || (await getConceptClipboardAsync()) || getConceptClipboard();
    if (!clipboard || !clipboard.concepto) {
      return false;
    }

    const sourceCode = clipboard.concepto.codigo;

    // P0 Item 9: Check cycle prevention
    if (wouldCreateCycle(project.estructuras, targetParentCode, sourceCode)) {
      showToast(
        'Operación denegada: no se puede pegar este concepto dentro de sí mismo o de uno de sus descendientes (crearía un ciclo infinito).',
        'error'
      );
      return false;
    }

    let targetCode = sourceCode;
    const targetRels = project.estructuras[targetParentCode] || [];

    // If an item with this code already exists in this parent, generate an incremental unique code
    const needsRename = targetRels.some((r) => r.hijoCodigo === targetCode);
    if (needsRename) {
      let counter = 1;
      let candidate = `${targetCode}_C${counter}`;
      while (
        targetRels.some((r) => r.hijoCodigo === candidate) ||
        project.conceptos[candidate] !== undefined
      ) {
        counter++;
        candidate = `${targetCode}_C${counter}`;
      }
      targetCode = candidate;
    }

    // P0 Item 10: Code remapping dictionary for renamed subtrees
    const codeMap: Record<string, string> = {
      [sourceCode]: targetCode,
    };

    // If renamed, clone sub-concepts with unique candidate names to avoid breaking or hijacking existing nodes
    if (targetCode !== sourceCode && clipboard.subConceptos) {
      Object.keys(clipboard.subConceptos).forEach((subOldCode) => {
        let subCounter = 1;
        let candidateSub = `${subOldCode}_C${subCounter}`;
        while (project.conceptos[candidateSub] !== undefined || codeMap[subOldCode] !== undefined) {
          subCounter++;
          candidateSub = `${subOldCode}_C${subCounter}`;
        }
        codeMap[subOldCode] = candidateSub;
      });
    }

    // Clone root concept
    const pastedConcept: Concepto = {
      ...clipboard.concepto,
      codigo: targetCode,
      resumen:
        targetCode !== sourceCode
          ? `${clipboard.concepto.resumen} (Copia)`
          : clipboard.concepto.resumen,
    };

    // Clone relation and measurements
    const clonedMediciones = (clipboard.relacion.mediciones || []).map((m) => ({
      ...m,
      id: `line_pasted_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    }));

    const totalCant =
      clonedMediciones.length > 0
        ? clonedMediciones.reduce((s, l) => s + (l.cantidad || 0), 0)
        : (clipboard.relacion.cantidad ?? 1);

    const pastedRel: RelacionEstructura = {
      ...clipboard.relacion,
      hijoCodigo: targetCode,
      mediciones: clonedMediciones,
      cantidad: totalCant,
      importe: round2(totalCant * (pastedConcept.precio || 0)),
      certificaciones: {},
      cantidadesCertificadas: {},
      notasCertificacion: {},
    };

    // Build updated concepts map
    const updatedConceptos = {
      ...project.conceptos,
      [targetCode]: pastedConcept,
    };

    if (clipboard.subConceptos) {
      Object.entries(clipboard.subConceptos).forEach(([oldChildCode, subCo]) => {
        const remappedChildCode = codeMap[oldChildCode] || oldChildCode;
        updatedConceptos[remappedChildCode] = {
          ...subCo,
          codigo: remappedChildCode,
          resumen: targetCode !== sourceCode ? `${subCo.resumen} (Copia)` : subCo.resumen,
        };
      });
    }

    // P0 Item 10: Remap subtree structures so parents and children link to new codes!
    const cleanSubEstructuras: Record<string, RelacionEstructura[]> = {};
    if (clipboard.subEstructuras) {
      Object.entries(clipboard.subEstructuras).forEach(([oldParentKey, list]) => {
        const remappedParentKey = codeMap[oldParentKey] || oldParentKey;
        cleanSubEstructuras[remappedParentKey] = list.map((r) => ({
          ...r,
          hijoCodigo: codeMap[r.hijoCodigo] || r.hijoCodigo,
          mediciones: (r.mediciones || []).map((m) => ({
            ...m,
            id: `line_pasted_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          })),
          certificaciones: {},
          cantidadesCertificadas: {},
          notasCertificacion: {},
        }));
      });
    }

    let updatedEstructuras = {
      ...project.estructuras,
      [targetParentCode]: [...targetRels, pastedRel],
      ...cleanSubEstructuras,
    };

    // If it was cut, remove from sourceParentCode
    if (clipboard.isCut && clipboard.sourceParentCode) {
      const sourceList = updatedEstructuras[clipboard.sourceParentCode] || [];
      updatedEstructuras[clipboard.sourceParentCode] = sourceList.filter(
        (r) => r.hijoCodigo !== sourceCode
      );
      clearConceptClipboard();
      setClipboardVersion((v) => v + 1);
    }

    const updatedProject: ProyectoBC3 = {
      ...project,
      conceptos: updatedConceptos,
      estructuras: updatedEstructuras,
    };

    recalculateBudget(updatedProject);
    setProject(updatedProject);
    setSelectedConceptCode(targetCode);
    showToast(`Elemento "${targetCode}" pegado correctamente`, 'success');

    try {
      window.dispatchEvent(
        new CustomEvent('presto-concept-pasted', { detail: { code: targetCode } })
      );
    } catch {}
    return true;
  };

  // Create new concept
  const handleConfirmNewItem = (item: {
    type: 'capitulo' | 'subcapitulo' | 'partida';
    code: string;
    summary: string;
    unit: string;
    price: number;
    quantity: number;
  }) => {
    if (!project || !currentNodeCode) return;

    const isChapter = item.type === 'capitulo' || item.type === 'subcapitulo';
    const cleanCode = item.code;

    const newConcept: Concepto = {
      codigo: cleanCode,
      unidad: isChapter ? '' : item.unit,
      resumen: item.summary,
      precio: item.price,
      tipoConcepto: item.type,
      tipoBC3: isChapter ? '1' : '0',
      importePresupuestado: round2(item.quantity * item.price),
    };

    const initialMediciones: LineaMedicion[] =
      !isChapter && item.quantity > 0
        ? [
            {
              id: `line_init_${Date.now()}`,
              fase: '0',
              espacio: '',
              comentario: 'Medición inicial',
              n: String(item.quantity),
              longitud: '',
              anchura: '',
              altura: '',
              formula: '',
              cantidad: item.quantity,
            },
          ]
        : [];

    const newRel: RelacionEstructura = {
      hijoCodigo: cleanCode,
      multiplicador: 1,
      cantidadBase: item.quantity,
      cantidad: item.quantity,
      importe: round2(item.quantity * item.price),
      mediciones: initialMediciones,
      certificaciones: {},
      cantidadesCertificadas: {},
      notasCertificacion: {},
    };

    const curRels = project.estructuras[currentNodeCode] || [];
    const updatedProject: ProyectoBC3 = {
      ...project,
      conceptos: {
        ...project.conceptos,
        [cleanCode]: newConcept,
      },
      estructuras: {
        ...project.estructuras,
        [currentNodeCode]: [...curRels, newRel],
        ...(isChapter && !project.estructuras[cleanCode] ? { [cleanCode]: [] } : {}),
      },
    };

    recalculateBudget(updatedProject);
    setProject(updatedProject);
    setSelectedConceptCode(cleanCode);
    showToast(`Elemento "${cleanCode}" creado`, 'success');
  };

  // New clean project
  const handleNewProject = async () => {
    if (window.confirm('¿Deseas crear un nuevo presupuesto en blanco?')) {
      const emptyProject = createEmptyProject();
      setProject(emptyProject);
      setCurrentNodeCode(emptyProject.codigoRaiz);
      setSelectedConceptCode(null);
      const ts = await saveProjectToDB(emptyProject);
      setLastSavedTimestamp(ts);
      showToast('Nuevo presupuesto creado.', 'info');
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-100 font-sans select-none">
      {/* Top Bar */}
      <Header
        project={project}
        onNewProject={handleNewProject}
        onOpenBC3File={handleOpenBC3File}
        onOpenPasteModal={() => setIsPasteModalOpen(true)}
        onOpenExcelModal={() => setIsExcelModalOpen(true)}
        onLoadDemo={handleLoadDemo}
        onSaveJSON={handleSaveJSON}
        onLoadJSON={handleLoadJSON}
        onOpenDiagnostics={() => setIsDiagnosticsModalOpen(true)}
        hasDiagnostics={importDiagnostics !== null}
        lastSavedTimestamp={lastSavedTimestamp}
      />

      {/* Main Workspace Layout */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Project Tree Sidebar */}
        {isSidebarOpen && (
          <aside className="w-72 shrink-0 border-r border-slate-300 bg-white flex flex-col z-10 transition-all duration-200">
            <ProjectTreeSidebar
              project={project}
              currentNodeCode={currentNodeCode}
              onSelectNode={handleNavigateToNode}
              isOpen={isSidebarOpen}
              onToggleOpen={() => setIsSidebarOpen(false)}
            />
          </aside>
        )}

        {/* Floating Sidebar Toggle when closed */}
        {!isSidebarOpen && (
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="absolute top-3 left-3 z-30 p-2 bg-slate-900 text-white rounded-md shadow-lg hover:bg-slate-800 transition-colors cursor-pointer"
            title="Mostrar árbol del proyecto (Ctrl+B)"
          >
            <PanelLeftOpen className="w-4 h-4" />
          </button>
        )}

        {/* Central Splitter Container */}
        <main id="main-workspace" className="flex-1 flex flex-col overflow-hidden relative">
          {/* Upper Table Panel */}
          <section
            style={{ height: `${upperSplitPercent}%` }}
            className="flex flex-col overflow-hidden bg-white"
          >
            <BudgetTable
              project={project}
              currentNodeCode={currentNodeCode}
              selectedConceptCode={selectedConceptCode}
              onSelectConcept={setSelectedConceptCode}
              onNavigateToNode={handleNavigateToNode}
              onGoUpLevel={handleGoUpLevel}
              onOpenNewItemModal={(type) => setNewItemModal({ isOpen: true, type })}
              onDeleteConcept={handleDeleteConcept}
              onUpdateConceptField={handleUpdateConceptField}
              onUpdateRelField={handleUpdateRelField}
              viewMode={viewMode}
              onChangeViewMode={setViewMode}
              activeFaseId={activeFaseId}
              onChangeActiveFase={setActiveFaseId}
              onAddNewFase={handleAddNewFase}
              onToggleFaseEstado={handleToggleFaseEstado}
              onUpdateCertificationDirect={handleUpdateCertificationDirect}
              onCopyConcept={handleCopyConcept}
              onCutConcept={handleCutConcept}
              onPasteConcept={handlePasteConcept}
              canPasteConcept={hasConceptClipboard()}
            />
          </section>

          {/* Draggable Row Resizer */}
          <div
            onMouseDown={startSplitterDrag}
            className="h-2 bg-slate-200 hover:bg-blue-500 cursor-row-resize flex items-center justify-center border-y border-slate-300 transition-colors z-20 shrink-0"
            title="Arrastra para cambiar el tamaño de los paneles"
          >
            <div className="w-10 h-1 bg-slate-400 rounded-full" />
          </div>

          {/* Lower Detail Panel (Mediciones, Fases, Texto, Info) */}
          <section id="lower-detail-panel" className="flex-1 flex flex-col overflow-hidden bg-white">
            <DetailPanel
              project={project}
              currentNodeCode={currentNodeCode}
              selectedConceptCode={selectedConceptCode}
              onUpdateMeasurements={handleUpdateMeasurements}
              onUpdateConceptText={handleUpdateConceptText}
              viewMode={viewMode}
              activeFaseId={activeFaseId}
              onChangeActiveFase={setActiveFaseId}
              onAddNewFase={handleAddNewFase}
              onToggleFaseEstado={handleToggleFaseEstado}
              onUpdateFaseFecha={handleUpdateFaseFecha}
              onUpdateFaseNota={handleUpdateFaseNota}
              onDeleteFase={handleDeleteFase}
              onGenerateMonthlyFases={handleGenerateMonthlyFases}
              onUpdateCertificationDirect={handleUpdateCertificationDirect}
            />
          </section>
        </main>
      </div>

      {/* Background Worker Parsing Progress Modal */}
      {loadingProgress.isLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl p-6 w-full max-w-md flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <Loader2 className="w-6 h-6 text-blue-600 animate-spin shrink-0" />
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Procesando BC3 en segundo plano
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-xs">
                  {loadingProgress.fileName}
                </p>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2.5 overflow-hidden">
              <div
                className="bg-blue-600 h-2.5 rounded-full transition-all duration-200"
                style={{ width: `${Math.max(5, loadingProgress.percent)}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span className="truncate max-w-[280px]">{loadingProgress.message}</span>
              <span className="font-mono tabular-nums font-semibold">{loadingProgress.percent}%</span>
            </div>
          </div>
        </div>
      )}

      {/* Import Diagnostics Modal */}
      <ImportDiagnosticsModal
        isOpen={isDiagnosticsModalOpen}
        diagnostics={importDiagnostics}
        fileName={diagnosticsFileName}
        onClose={() => setIsDiagnosticsModalOpen(false)}
      />

      {/* Floating Toast Notification */}
      {toast && (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 px-4 py-2.5 rounded-lg shadow-xl text-xs font-medium border animate-in slide-in-from-bottom-2 duration-200 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border-slate-200 dark:border-slate-800">
          {toast.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />}
          {toast.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />}
          {toast.type === 'info' && <Info className="w-4 h-4 text-blue-500 shrink-0" />}
          <span className="max-w-sm truncate">{toast.message}</span>
          <button
            onClick={() => setToast(null)}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 ml-2"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Modals */}
      <NewItemModal
        isOpen={newItemModal.isOpen}
        onClose={() => setNewItemModal({ ...newItemModal, isOpen: false })}
        type={newItemModal.type}
        parentCode={currentNodeCode || ''}
        project={project}
        onConfirm={handleConfirmNewItem}
      />

      <ExcelImportModal
        isOpen={isExcelModalOpen}
        onClose={() => setIsExcelModalOpen(false)}
        onImportProject={handleImportProjectFromExcel}
        currentParentCode={currentNodeCode}
      />

      <PasteBc3Modal
        isOpen={isPasteModalOpen}
        onClose={() => setIsPasteModalOpen(false)}
        onImportRawText={handleImportRawText}
      />
    </div>
  );
}
