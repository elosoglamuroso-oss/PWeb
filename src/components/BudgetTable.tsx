import React, { useState, useEffect } from 'react';
import {
  ArrowUp,
  FolderTree,
  FolderGit2,
  Hammer,
  Plus,
  Trash2,
  Search,
  Check,
  Columns,
  Copy,
  Scissors,
  ClipboardPaste,
  Calendar,
  CheckCircle2,
  Lock,
} from 'lucide-react';
import { Concepto, ProyectoBC3, RelacionEstructura } from '../types/bc3';
import { getConceptType, getRelCertificationStats, CertificationStats, round2, round4, getNextPhaseDate } from '../utils/bc3Parser';

interface BudgetTableProps {
  project: ProyectoBC3 | null;
  currentNodeCode: string | null;
  selectedConceptCode: string | null;
  onSelectConcept: (code: string) => void;
  onNavigateToNode: (code: string) => void;
  onGoUpLevel: () => void;
  onOpenNewItemModal: (type: 'capitulo' | 'subcapitulo' | 'partida') => void;
  onDeleteConcept: (code: string) => void;
  onUpdateConceptField: (code: string, field: keyof Concepto, value: any) => void;
  onUpdateRelField: (parentCode: string, childCode: string, field: keyof RelacionEstructura, value: any) => void;
  viewMode: 'presupuesto' | 'certificacion';
  onChangeViewMode: (mode: 'presupuesto' | 'certificacion') => void;
  activeFaseId: string;
  onChangeActiveFase: (faseId: string) => void;
  onAddNewFase: (nombre: string, fecha: string) => void;
  onToggleFaseEstado?: (faseId: string) => void;
  onUpdateCertificationDirect: (parentCode: string, childCode: string, faseId: string, cantidad: number) => void;
  onCopyConcept: (code: string) => void;
  onCutConcept: (code: string) => void;
  onPasteConcept: (targetParentCode: string) => Promise<boolean> | boolean | void;
  canPasteConcept: boolean;
}

export type ViewPreset = 'presupuesto' | 'certi_activa' | 'certi_acum' | 'completa';

export const BudgetTable: React.FC<BudgetTableProps> = ({
  project,
  currentNodeCode,
  selectedConceptCode,
  onSelectConcept,
  onNavigateToNode,
  onGoUpLevel,
  onOpenNewItemModal,
  onDeleteConcept,
  onUpdateConceptField,
  onUpdateRelField,
  viewMode,
  onChangeViewMode,
  activeFaseId,
  onChangeActiveFase,
  onAddNewFase,
  onUpdateCertificationDirect,
  onCopyConcept,
  onCutConcept,
  onPasteConcept,
  canPasteConcept,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [editingCell, setEditingCell] = useState<{ code: string; field: string } | null>(null);
  const [tempValue, setTempValue] = useState('');
  const [viewPreset, setViewPreset] = useState<ViewPreset>('presupuesto');
  const [showColumnsMenu, setShowColumnsMenu] = useState(false);
  const [showNewFaseModal, setShowNewFaseModal] = useState(false);
  const [newFaseNombre, setNewFaseNombre] = useState('Fase 3');
  const [newFaseFecha, setNewFaseFecha] = useState('31-Mar-26');
  const [conceptToDelete, setConceptToDelete] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((cur) => (cur === msg ? null : cur));
    }, 2000);
  };

  // Listen to paste events across windows/origins to show confirmation toast
  useEffect(() => {
    const handlePasted = (e: any) => {
      const code = e.detail?.code;
      showToast(code ? `Elemento pegado: ${code}` : 'Elemento pegado');
    };
    window.addEventListener('presto-concept-pasted', handlePasted);
    return () => window.removeEventListener('presto-concept-pasted', handlePasted);
  }, []);

  // Sync viewMode with viewPreset
  useEffect(() => {
    if (viewMode === 'certificacion' && viewPreset === 'presupuesto') {
      setViewPreset('certi_activa');
    } else if (viewMode === 'presupuesto' && viewPreset !== 'presupuesto') {
      setViewPreset('presupuesto');
    }
  }, [viewMode]);

  const handleSelectPreset = (preset: ViewPreset) => {
    setViewPreset(preset);
    let nextCols: Record<string, boolean>;
    if (preset === 'presupuesto') {
      nextCols = {
        num: true,
        codigo: true,
        resumen: true,
        ud: true,
        canPres: true,
        precio: true,
        impPres: true,
        canCert: false,
        porcCert: false,
        impCert: false,
        canAcum: false,
        porcAcum: false,
        impAcum: false,
        canPend: false,
        impPend: false,
      };
      onChangeViewMode('presupuesto');
    } else if (preset === 'certi_activa') {
      nextCols = {
        num: true,
        codigo: true,
        resumen: true,
        ud: true,
        canPres: true,
        precio: true,
        impPres: true,
        canCert: true,
        porcCert: true,
        impCert: true,
        canAcum: false,
        porcAcum: false,
        impAcum: false,
        canPend: true,
        impPend: false,
      };
      onChangeViewMode('certificacion');
    } else if (preset === 'certi_acum') {
      nextCols = {
        num: true,
        codigo: true,
        resumen: true,
        ud: true,
        canPres: true,
        precio: true,
        impPres: true,
        canCert: false,
        porcCert: false,
        impCert: false,
        canAcum: true,
        porcAcum: true,
        impAcum: true,
        canPend: false,
        impPend: true,
      };
      onChangeViewMode('certificacion');
    } else {
      // completa
      nextCols = {
        num: true,
        codigo: true,
        resumen: true,
        ud: true,
        canPres: true,
        precio: true,
        impPres: true,
        canCert: true,
        porcCert: true,
        impCert: true,
        canAcum: true,
        porcAcum: true,
        impAcum: true,
        canPend: true,
        impPend: true,
      };
      onChangeViewMode('certificacion');
    }
    setVisibleColumns(nextCols);
    try {
      localStorage.setItem('presto_budget_visible_cols_v4', JSON.stringify(nextCols));
    } catch {}
  };

  // Customizable column visibility
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('presto_budget_visible_cols_v4');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      num: true,
      codigo: true,
      resumen: true,
      ud: true, // After resumen!
      canPres: true,
      precio: true,
      impPres: true,
      canCert: false,
      porcCert: false,
      impCert: false,
      canAcum: false,
      porcAcum: false,
      impAcum: false,
      canPend: false,
      impPend: false,
    };
  });

  const toggleColumn = (key: string) => {
    setVisibleColumns((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem('presto_budget_visible_cols_v4', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  // All columns widths (every column can be resized!)
  const [colWidths, setColWidths] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem('presto_budget_col_widths_v4');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      num: 42,
      codigo: 125,
      resumen: 340,
      ud: 55, // After resumen!
      canPres: 92,
      precio: 92,
      impPres: 115,
      canCert: 95,
      porcCert: 75,
      impCert: 110,
      canAcum: 95,
      porcAcum: 75,
      impAcum: 110,
      canPend: 95,
      impPend: 110,
    };
  });

  // Base default column order
  const DEFAULT_COLUMN_ORDER = [
    'num',
    'codigo',
    'resumen',
    'ud',
    'canPres',
    'precio',
    'impPres',
    'canCert',
    'porcCert',
    'impCert',
    'canAcum',
    'porcAcum',
    'impAcum',
    'canPend',
    'impPend',
  ];

  // Customizable column order separate for Presupuesto and Certificación so they never reset or interfere
  const [columnOrderPresu, setColumnOrderPresu] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('presto_budget_col_order_presu_v6');
      if (saved) return JSON.parse(saved);
    } catch {}
    return DEFAULT_COLUMN_ORDER;
  });

  const [columnOrderCerti, setColumnOrderCerti] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('presto_budget_col_order_certi_v6');
      if (saved) return JSON.parse(saved);
    } catch {}
    return DEFAULT_COLUMN_ORDER;
  });

  const columnOrder = viewMode === 'certificacion' ? columnOrderCerti : columnOrderPresu;

  const [draggedColKey, setDraggedColKey] = useState<string | null>(null);
  const [dragOverColKey, setDragOverColKey] = useState<string | null>(null);

  const handleReorderColumns = (sourceKey: string, targetKey: string) => {
    if (sourceKey === targetKey) return;
    const isCertMode = viewMode === 'certificacion';
    const setter = isCertMode ? setColumnOrderCerti : setColumnOrderPresu;
    const storageKey = isCertMode ? 'presto_budget_col_order_certi_v6' : 'presto_budget_col_order_presu_v6';

    setter((prev) => {
      const allKeys = isCertMode
        ? [...DEFAULT_COLUMN_ORDER, ...phases.map((p) => `fase_${p.id}`)]
        : DEFAULT_COLUMN_ORDER;

      const currentList = [
        ...prev.filter((k) => allKeys.includes(k)),
        ...allKeys.filter((k) => !prev.includes(k)),
      ];

      const fromIndex = currentList.indexOf(sourceKey);
      const toIndex = currentList.indexOf(targetKey);
      if (fromIndex === -1 || toIndex === -1) return prev;

      const updated = [...currentList];
      const [removed] = updated.splice(fromIndex, 1);
      updated.splice(toIndex, 0, removed);

      try {
        localStorage.setItem(storageKey, JSON.stringify(updated));
      } catch {}
      return updated;
    });
    showToast(`Posición de columna bloqueada permanentemente (${isCertMode ? 'Certificación' : 'Presupuesto'})`);
  };

  const moveColumn = (key: string, direction: 'up' | 'down') => {
    const isCertMode = viewMode === 'certificacion';
    const currentOrder = isCertMode ? columnOrderCerti : columnOrderPresu;
    const allKnownKeys = isCertMode
      ? [...DEFAULT_COLUMN_ORDER, ...phases.map((p) => `fase_${p.id}`)]
      : DEFAULT_COLUMN_ORDER;
    const fullOrder = [
      ...currentOrder.filter((k) => allKnownKeys.includes(k)),
      ...allKnownKeys.filter((k) => !currentOrder.includes(k)),
    ];
    // Reorder relative to visible columns to guarantee it moves past hidden columns!
    const visibleCols = fullOrder.filter((k) => isColVisible(k));
    const vIdx = visibleCols.indexOf(key);
    if (vIdx === -1) return;
    const targetVIdx = direction === 'up' ? vIdx - 1 : vIdx + 1;
    if (targetVIdx < 0 || targetVIdx >= visibleCols.length) return;
    const targetKey = visibleCols[targetVIdx];
    handleReorderColumns(key, targetKey);
  };

  const handleResetColumns = () => {
    try {
      localStorage.removeItem('presto_budget_col_order_presu_v6');
      localStorage.removeItem('presto_budget_col_order_certi_v6');
      localStorage.removeItem('presto_budget_col_widths_v4');
    } catch {}
    setColumnOrderPresu(DEFAULT_COLUMN_ORDER);
    setColumnOrderCerti(DEFAULT_COLUMN_ORDER);
    setColWidths({
      num: 42,
      codigo: 125,
      resumen: 340,
      ud: 55,
      canPres: 92,
      precio: 92,
      impPres: 115,
      canCert: 95,
      porcCert: 75,
      impCert: 110,
      canAcum: 95,
      porcAcum: 75,
      impAcum: 110,
      canPend: 95,
      impPend: 110,
    });
    showToast('Columnas restablecidas a valores originales');
  };

  // Phase columns display mode ('ambos': € y Ud, 'importe': solo €, 'cantidad': solo Ud)
  const [phaseDisplayMode, setPhaseDisplayMode] = useState<'ambos' | 'importe' | 'cantidad'>(() => {
    try {
      const saved = localStorage.getItem('presto_phase_display_mode_v1');
      if (saved === 'importe' || saved === 'cantidad' || saved === 'ambos') return saved;
    } catch {}
    return 'ambos';
  });

  // Resizing logic for any column (persists to localStorage on completion)
  const handleStartResize = (colKey: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = colWidths[colKey] || 90;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const newWidth = Math.max(35, startW + deltaX);
      setColWidths((prev) => {
        const next = { ...prev, [colKey]: newWidth };
        try {
          localStorage.setItem('presto_budget_col_widths_v4', JSON.stringify(next));
        } catch {}
        return next;
      });
    };

    const onMouseUp = () => {
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      setColWidths((latest) => {
        try {
          localStorage.setItem('presto_budget_col_widths_v4', JSON.stringify(latest));
        } catch {}
        return latest;
      });
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // Keyboard navigation & shortcuts (Ctrl+C, Ctrl+X, Ctrl+V, Delete/Supr)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;

      const activeEl = document.activeElement as HTMLElement | null;
      // CRITICAL: If focus or target is inside the lower detail panel (#lower-detail-panel),
      // DO NOT delete concept! DetailPanel handles its own measurement line operations.
      const isLowerPanel = activeEl?.closest('#lower-detail-panel') || (e.target as HTMLElement)?.closest('#lower-detail-panel');
      if (isLowerPanel) return;

      const isInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT');
      if (isInput) return;

      if ((e.ctrlKey || e.metaKey)) {
        const key = e.key.toLowerCase();
        if (key === 'c' && selectedConceptCode) {
          e.preventDefault();
          onCopyConcept(selectedConceptCode);
          showToast(`Copiado: ${selectedConceptCode} (Ctrl+C)`);
        } else if (key === 'x' && selectedConceptCode) {
          e.preventDefault();
          onCutConcept(selectedConceptCode);
          showToast(`Cortado: ${selectedConceptCode} (Ctrl+X)`);
        } else if (key === 'v' && currentNodeCode) {
          // Allow native paste event to fire so e.clipboardData is accessible across windows without permission restrictions
          let pastedViaNative = false;
          const markPasted = () => { pastedViaNative = true; };
          window.addEventListener('presto-concept-pasted', markPasted, { once: true });
          setTimeout(async () => {
            window.removeEventListener('presto-concept-pasted', markPasted);
            if (!pastedViaNative && currentNodeCode) {
              const res = await onPasteConcept(currentNodeCode);
              if (res !== false) {
                showToast('Elemento pegado (Ctrl+V)');
              }
            }
          }, 120);
        }
      } else {
        const isDeleteKey = e.key === 'Delete' || e.key === 'Del' || e.key === 'Supr' || e.code === 'Delete';
        if (isDeleteKey && selectedConceptCode && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
          e.preventDefault();
          setConceptToDelete(selectedConceptCode);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedConceptCode, currentNodeCode, canPasteConcept, onCopyConcept, onCutConcept, onPasteConcept]);

  if (!project || !project.codigoRaiz || !currentNodeCode) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-slate-400 bg-white">
        <FolderTree className="w-12 h-12 mb-3 text-slate-300 stroke-[1.5]" />
        <h3 className="text-sm font-semibold text-slate-600 mb-1">Sin presupuesto abierto</h3>
        <p className="text-xs text-slate-400 max-w-sm text-center">
          Abre un fichero BC3, importa un presupuesto desde Excel, o carga el ejemplo real de Presto 22.01 desde la barra superior.
        </p>
      </div>
    );
  }

  // Breadcrumbs calculation
  const getParentPath = (code: string): Concepto[] => {
    const path: Concepto[] = [];
    let current: string | null = code;
    const visited = new Set<string>();

    while (current && !visited.has(current)) {
      visited.add(current);
      const co = project.conceptos[current] || { codigo: current, resumen: current, unidad: '', precio: 0 };
      path.unshift(co);
      if (current === project.codigoRaiz) break;

      let parent: string | null = null;
      for (const [p, rels] of Object.entries(project.estructuras)) {
        if (rels.some((r) => r.hijoCodigo === current)) {
          parent = p;
          break;
        }
      }
      current = parent;
    }
    return path;
  };

  const breadcrumbs = getParentPath(currentNodeCode);
  const currentRels = project.estructuras[currentNodeCode] || [];

  // Filter items if searching
  const filteredRels = currentRels.filter((rel) => {
    if (!searchTerm.trim()) return true;
    const co = project.conceptos[rel.hijoCodigo];
    if (!co) return false;
    const q = searchTerm.toLowerCase();
    return co.codigo.toLowerCase().includes(q) || (co.resumen || '').toLowerCase().includes(q);
  });

  const rootConcept = project.conceptos[project.codigoRaiz];
  const totalBudget = rootConcept?.importePresupuestado || 0;
  const isCurrentRoot = currentNodeCode === project.codigoRaiz;

  // Active phase info
  const phases = project.fases || [
    { id: '1', numero: 1, nombre: 'Fase 1', fecha: '31-Ene-26', estado: 'abierta' }
  ];
  const activeFase = phases.find((f) => f.id === activeFaseId) || phases[0];

  const handleOpenNewFaseModal = () => {
    const nextNum = phases.length + 1;
    setNewFaseNombre(`Fase ${nextNum}`);
    setNewFaseFecha(getNextPhaseDate(phases));
    setShowNewFaseModal(true);
  };

  const startEdit = (code: string, field: string, initialVal: any, e: React.MouseEvent) => {
    e.stopPropagation();
    if ((field === 'canCert' || field === 'porcCert') && activeFase.estado === 'cerrada') {
      showToast(`No se puede editar: la Fase ${activeFase.numero} está cerrada y bloqueada`);
      return;
    }
    setEditingCell({ code, field });
    setTempValue(String(initialVal ?? ''));
  };

  const saveEdit = (code: string, field: string) => {
    if (field === 'precio') {
      const parsed = parseFloat(tempValue.replace(',', '.'));
      onUpdateConceptField(code, 'precio', isNaN(parsed) ? 0 : parsed);
    } else if (field === 'cantidad') {
      const parsed = parseFloat(tempValue.replace(',', '.'));
      onUpdateRelField(currentNodeCode, code, 'multiplicador', isNaN(parsed) ? 1 : parsed);
    } else if (field === 'canCert') {
      if (activeFase.estado === 'cerrada') {
        showToast(`No se puede modificar: la Fase ${activeFase.numero} está cerrada y bloqueada`);
        setEditingCell(null);
        return;
      }
      const trimmed = tempValue.trim();
      const parsed = trimmed === '' ? 0 : parseFloat(trimmed.replace(',', '.'));
      onUpdateCertificationDirect(currentNodeCode, code, activeFaseId, isNaN(parsed) ? 0 : parsed);
    } else if (field === 'porcCert') {
      if (activeFase.estado === 'cerrada') {
        showToast(`No se puede modificar: la Fase ${activeFase.numero} está cerrada y bloqueada`);
        setEditingCell(null);
        return;
      }
      const trimmed = tempValue.trim();
      const parsed = trimmed === '' ? 0 : parseFloat(trimmed.replace(',', '.'));
      const stats = getRelCertificationStats(project, currentNodeCode, code, activeFaseId);
      const newCant = isNaN(parsed) || parsed === 0 ? 0 : round4((stats.canPres * parsed) / 100);
      onUpdateCertificationDirect(currentNodeCode, code, activeFaseId, newCant);
    } else if (field.startsWith('fase_')) {
      const fId = field.replace('fase_', '');
      const targetPhase = phases.find((p) => p.id === fId);
      if (targetPhase?.estado === 'cerrada') {
        showToast(`No se puede modificar: la Fase ${targetPhase.numero} está cerrada y bloqueada`);
        setEditingCell(null);
        return;
      }
      const trimmed = tempValue.trim();
      const parsed = trimmed === '' ? 0 : parseFloat(trimmed.replace(',', '.'));
      onUpdateCertificationDirect(currentNodeCode, code, fId, isNaN(parsed) ? 0 : parsed);
      showToast(`Certificado en Fase ${targetPhase?.numero || fId}: ${isNaN(parsed) ? 0 : parsed}`);
    } else {
      onUpdateConceptField(code, field as keyof Concepto, tempValue);
    }
    setEditingCell(null);
  };

  const cancelEdit = () => {
    setEditingCell(null);
  };

  // Helper to determine whether a column should show (reflects visibleColumns directly, phase columns default true in certification views)
  const isColVisible = (colKey: string): boolean => {
    if (colKey.startsWith('fase_')) {
      if (viewPreset === 'presupuesto') {
        return visibleColumns[colKey] === true;
      }
      return visibleColumns[colKey] !== false;
    }
    return !!visibleColumns[colKey];
  };
  const isColVisibleInPreset = isColVisible;

  const getColDefaultWidth = (key: string): number => {
    if (key.startsWith('fase_')) return colWidths[key] || 110;
    switch (key) {
      case 'num': return 42;
      case 'codigo': return 125;
      case 'resumen': return 340;
      case 'ud': return 55;
      case 'canPres': return 92;
      case 'precio': return 92;
      case 'impPres': return 115;
      case 'canCert': return 95;
      case 'porcCert': return 75;
      case 'impCert': return 110;
      case 'canAcum': return 95;
      case 'porcAcum': return 75;
      case 'impAcum': return 110;
      case 'canPend': return 95;
      case 'impPend': return 110;
      default: return 90;
    }
  };

  const getColLabel = (key: string): string => {
    if (key.startsWith('fase_')) {
      const fId = key.replace('fase_', '');
      const p = phases.find((f) => f.id === fId);
      return p ? `Fase ${p.numero} (${p.fecha})` : key;
    }
    switch (key) {
      case 'num': return 'Nº';
      case 'codigo': return 'Código';
      case 'resumen': return 'Resumen / Designación';
      case 'ud': return 'Ud';
      case 'canPres': return 'CanPres';
      case 'precio': return 'Precio';
      case 'impPres': return 'ImpPres';
      case 'canCert': return 'CanCert';
      case 'porcCert': return '% Cert';
      case 'impCert': return 'ImpCert';
      case 'canAcum': return 'CanAcum';
      case 'porcAcum': return '% Acum';
      case 'impAcum': return 'ImpAcum';
      case 'canPend': return 'CanPend';
      case 'impPend': return 'ImpPend';
      default: return key;
    }
  };

  // Distinct icon renderer for Chapter vs Subchapter vs Partida
  const renderItemIcon = (code: string) => {
    const itemType = getConceptType(project, code, currentNodeCode);

    if (itemType === 'capitulo') {
      return (
        <div className="flex items-center space-x-1 shrink-0" title="Capítulo">
          <FolderTree className="w-4 h-4 text-amber-600 fill-amber-100" />
          <span className="text-[9px] font-bold tracking-wider px-1 py-0.2 rounded bg-amber-100 text-amber-800 border border-amber-300 font-mono">
            CAP
          </span>
        </div>
      );
    }

    if (itemType === 'subcapitulo') {
      return (
        <div className="flex items-center space-x-1 shrink-0" title="Subcapítulo">
          <FolderGit2 className="w-4 h-4 text-indigo-600 fill-indigo-100" />
          <span className="text-[9px] font-bold tracking-wider px-1 py-0.2 rounded bg-indigo-100 text-indigo-800 border border-indigo-300 font-mono">
            SUB
          </span>
        </div>
      );
    }

    // Partida / Unidad de obra
    return (
      <div className="flex items-center space-x-1 shrink-0" title="Unidad de obra / Partida">
        <Hammer className="w-3.5 h-3.5 text-emerald-600" />
        <span className="text-[9px] font-bold tracking-wider px-1 py-0.2 rounded bg-emerald-100 text-emerald-800 border border-emerald-300 font-mono">
          UD
        </span>
      </div>
    );
  };

  const handleCreateFaseSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFaseNombre.trim()) return;
    onAddNewFase(newFaseNombre.trim(), newFaseFecha);
    setNewFaseNombre('');
    setShowNewFaseModal(false);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-white overflow-hidden select-none relative">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="absolute top-2 right-4 z-50 bg-slate-900 text-white text-xs px-3 py-1.5 rounded shadow-lg flex items-center space-x-1.5 animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top action & breadcrumb bar */}
      <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-300 flex items-center justify-between text-xs gap-2 shrink-0">
        {/* Navigation & breadcrumbs */}
        <div className="flex items-center space-x-1.5 font-mono text-slate-700 overflow-x-auto min-w-0 py-0.5">
          <button
            onClick={onGoUpLevel}
            disabled={isCurrentRoot}
            className="flex items-center space-x-1 bg-white hover:bg-slate-200 disabled:opacity-40 text-slate-800 px-2 py-1 rounded border border-slate-300 text-[11px] font-semibold transition-colors shrink-0 shadow-2xs"
            title="Subir un nivel jerárquico"
          >
            <ArrowUp className="w-3 h-3 text-slate-700" />
            <span>Subir</span>
          </button>

          <div className="flex items-center space-x-1 overflow-x-auto whitespace-nowrap pl-1">
            {breadcrumbs.map((co, idx) => (
              <React.Fragment key={co.codigo}>
                {idx > 0 && <span className="text-slate-400">/</span>}
                <button
                  onClick={() => onNavigateToNode(co.codigo)}
                  className={`hover:text-blue-600 hover:underline px-1.5 py-0.5 rounded transition-colors text-xs ${
                    idx === breadcrumbs.length - 1 ? 'font-bold text-slate-900 bg-slate-200/80 border border-slate-300' : 'text-slate-600'
                  }`}
                  title={`${co.codigo}: ${co.resumen || ''}`}
                >
                  {co.codigo}
                </button>
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Action Controls & Total */}
        <div className="flex items-center space-x-2 shrink-0">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2 top-2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-white border border-slate-300 rounded pl-7 pr-2 py-1 text-xs w-28 md:w-40 focus:outline-none focus:border-blue-500 shadow-2xs"
            />
          </div>

          <div className="h-4 w-px bg-slate-300" />

          {/* New item buttons */}
          <div className="flex items-center space-x-1">
            <button
              onClick={() => onOpenNewItemModal('capitulo')}
              className="flex items-center space-x-1 bg-white hover:bg-amber-50 text-amber-900 border border-amber-300 hover:border-amber-400 px-2 py-1 rounded text-xs font-medium transition-colors shadow-2xs"
              title="Añadir un nuevo capítulo raíz"
            >
              <Plus className="w-3 h-3 text-amber-600" />
              <span>Capítulo</span>
            </button>

            <button
              onClick={() => onOpenNewItemModal('subcapitulo')}
              className="flex items-center space-x-1 bg-white hover:bg-indigo-50 text-indigo-900 border border-indigo-300 hover:border-indigo-400 px-2 py-1 rounded text-xs font-medium transition-colors shadow-2xs"
              title="Añadir un subcapítulo bajo la posición actual"
            >
              <Plus className="w-3 h-3 text-indigo-600" />
              <span>Subcapítulo</span>
            </button>

            <button
              onClick={() => onOpenNewItemModal('partida')}
              className="flex items-center space-x-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-1 rounded text-xs font-medium transition-colors shadow-2xs"
              title="Añadir una nueva partida o unidad de obra"
            >
              <Plus className="w-3 h-3 text-emerald-600" />
              <span>Partida</span>
            </button>
          </div>

          <div className="h-4 w-px bg-slate-300" />

          {/* Clipboard buttons (Copiar, Cortar, Pegar, Borrar) */}
          <div className="flex items-center space-x-1">
            <button
              onClick={() => {
                if (selectedConceptCode) {
                  onCopyConcept(selectedConceptCode);
                  showToast(`Copiado: ${selectedConceptCode}`);
                }
              }}
              disabled={!selectedConceptCode}
              className="flex items-center space-x-1 bg-white hover:bg-slate-100 disabled:opacity-40 text-slate-700 border border-slate-300 px-2 py-1 rounded text-xs font-medium transition-colors shadow-2xs"
              title="Copiar partida o capítulo con toda su medición (Ctrl+C)"
            >
              <Copy className="w-3 h-3 text-slate-600" />
              <span>Copiar</span>
            </button>

            <button
              onClick={() => {
                if (selectedConceptCode) {
                  onCutConcept(selectedConceptCode);
                  showToast(`Cortado: ${selectedConceptCode}`);
                }
              }}
              disabled={!selectedConceptCode}
              className="flex items-center space-x-1 bg-white hover:bg-slate-100 disabled:opacity-40 text-slate-700 border border-slate-300 px-2 py-1 rounded text-xs font-medium transition-colors shadow-2xs"
              title="Cortar partida o capítulo (Ctrl+X)"
            >
              <Scissors className="w-3 h-3 text-slate-600" />
              <span>Cortar</span>
            </button>

            <button
              onClick={async () => {
                if (currentNodeCode) {
                  const res = await onPasteConcept(currentNodeCode);
                  if (res !== false) {
                    showToast('Elemento pegado');
                  } else {
                    showToast('No hay ninguna partida copiada en el portapapeles');
                  }
                }
              }}
              disabled={!currentNodeCode}
              className="flex items-center space-x-1 bg-white hover:bg-slate-100 disabled:opacity-40 text-blue-700 border border-slate-300 px-2 py-1 rounded text-xs font-medium transition-colors shadow-2xs"
              title="Pegar partida o capítulo con toda su medición (Ctrl+V)"
            >
              <ClipboardPaste className="w-3 h-3 text-blue-600" />
              <span>Pegar</span>
            </button>

            <button
              onClick={() => {
                if (selectedConceptCode) {
                  setConceptToDelete(selectedConceptCode);
                }
              }}
              disabled={!selectedConceptCode}
              className="flex items-center space-x-1 bg-white hover:bg-rose-50 disabled:opacity-40 disabled:hover:bg-white text-rose-600 border border-slate-300 px-2 py-1 rounded text-xs font-medium transition-colors shadow-2xs"
              title={selectedConceptCode ? `Eliminar elemento seleccionado ${selectedConceptCode} (Supr / Delete)` : 'Selecciona un elemento para borrarlo (Supr)'}
            >
              <Trash2 className="w-3 h-3 text-rose-500" />
              <span>Borrar</span>
            </button>
          </div>

          <div className="h-4 w-px bg-slate-300" />

          {/* View Preset Selector */}
          <div className="flex items-center space-x-1">
            <select
              value={viewPreset}
              onChange={(e) => handleSelectPreset(e.target.value as ViewPreset)}
              className="bg-white border border-slate-300 rounded px-2 py-1 text-xs font-semibold text-slate-700 shadow-2xs cursor-pointer focus:outline-none focus:border-blue-500"
            >
              <option value="presupuesto">Presupuesto</option>
              <option value="certi_activa">Certificación (Fase activa)</option>
              <option value="certi_acum">Certificación a Origen (Acumulada)</option>
              <option value="completa">Comparativa Completa</option>
            </select>
          </div>

          {/* Active Phase Selector (When in certification modes) */}
          {viewPreset !== 'presupuesto' && (
            <div className="flex items-center space-x-1 bg-blue-50/80 border border-blue-200 rounded px-1.5 py-0.5">
              <span className="text-[10px] text-blue-800 font-semibold uppercase tracking-wider">Fase:</span>
              <select
                value={activeFaseId}
                onChange={(e) => onChangeActiveFase(e.target.value)}
                className="bg-white border border-blue-300 rounded px-1.5 py-0.5 text-xs font-semibold text-blue-900 cursor-pointer"
              >
                {phases.map((f) => (
                  <option key={f.id} value={f.id}>
                    Fase {f.numero} ({f.fecha}) {f.estado === 'cerrada' ? '🔒' : ''}
                  </option>
                ))}
              </select>
              <button
                onClick={handleOpenNewFaseModal}
                className="p-1 text-blue-700 hover:text-blue-900 hover:bg-blue-200/60 rounded"
                title="Crear nueva fase de certificación"
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* Phase Columns Display Format (Importe € vs Cantidad vs Ambos) */}
          {viewPreset !== 'presupuesto' && (
            <div className="flex items-center space-x-1 bg-white border border-slate-300 rounded px-1.5 py-0.5 shadow-2xs" title="Visualización en columnas de fases">
              <span className="text-[10px] text-slate-500 font-medium">Ver Fases:</span>
              <select
                value={phaseDisplayMode}
                onChange={(e) => {
                  const m = e.target.value as 'ambos' | 'importe' | 'cantidad';
                  setPhaseDisplayMode(m);
                  try {
                    localStorage.setItem('presto_phase_display_mode_v1', m);
                  } catch {}
                }}
                className="bg-transparent text-xs font-semibold text-blue-900 cursor-pointer focus:outline-none"
              >
                <option value="ambos">Importe (€) + Cantidad</option>
                <option value="importe">Solo Importe (€)</option>
                <option value="cantidad">Solo Cantidad (Ud)</option>
              </select>
            </div>
          )}

          {/* Column Visibility Selector Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowColumnsMenu((prev) => !prev)}
              className="flex items-center space-x-1 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 px-2 py-1 rounded text-xs font-medium shadow-2xs"
              title="Configurar columnas visibles"
            >
              <Columns className="w-3 h-3 text-slate-600" />
              <span>Columnas</span>
            </button>

            {showColumnsMenu && (() => {
              const allPhaseKeys = phases.map((p) => `fase_${p.id}`);
              const allKnownKeys = [...DEFAULT_COLUMN_ORDER, ...allPhaseKeys];
              const orderedAllCols = [
                ...columnOrder.filter((k) => allKnownKeys.includes(k)),
                ...allKnownKeys.filter((k) => !columnOrder.includes(k)),
              ];

              return (
                <div className="absolute right-0 top-full mt-1 w-72 bg-white border border-slate-300 rounded shadow-xl z-50 p-2.5 text-xs">
                  <div className="font-semibold text-slate-700 mb-1.5 pb-1 border-b border-slate-200 flex items-center justify-between">
                    <span>Configurar y Ordenar Columnas</span>
                    <button
                      onClick={() => setShowColumnsMenu(false)}
                      className="text-slate-400 hover:text-slate-600 text-xs px-1"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="text-[10px] text-slate-500 mb-2 leading-tight">
                    Marca las columnas visibles y usa <strong className="text-slate-700">▲/▼</strong> o arrastra las cabeceras en la tabla. Las posiciones quedan <strong>bloqueadas permanentemente</strong>.
                  </div>
                  <div className="max-h-64 overflow-y-auto space-y-1 pr-1 divide-y divide-slate-100">
                    {orderedAllCols.map((colKey, colIdx) => (
                      <div key={colKey} className="flex items-center justify-between py-1 px-1 hover:bg-slate-50 rounded group">
                        <label className="flex items-center space-x-2 cursor-pointer flex-1 min-w-0">
                          <input
                            type="checkbox"
                            checked={isColVisible(colKey)}
                            onChange={() => toggleColumn(colKey)}
                            className="rounded text-blue-600 focus:ring-blue-500"
                          />
                          <span className="truncate text-slate-700 font-medium">
                            {getColLabel(colKey)}
                          </span>
                        </label>
                        <div className="flex items-center space-x-1 ml-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => moveColumn(colKey, 'up')}
                            disabled={colIdx === 0}
                            title="Mover columna a la izquierda"
                            className="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-blue-100 text-slate-600 hover:text-blue-800 disabled:opacity-20 text-[10px] font-bold transition-colors"
                          >
                            ▲
                          </button>
                          <button
                            type="button"
                            onClick={() => moveColumn(colKey, 'down')}
                            disabled={colIdx === orderedAllCols.length - 1}
                            title="Mover columna a la derecha"
                            className="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-blue-100 text-slate-600 hover:text-blue-800 disabled:opacity-20 text-[10px] font-bold transition-colors"
                          >
                            ▼
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="pt-2 mt-2 border-t border-slate-200 flex flex-col space-y-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        const isCertMode = viewMode === 'certificacion';
                        const currentList = isCertMode ? columnOrderCerti : columnOrderPresu;
                        const storageKey = isCertMode ? 'presto_budget_col_order_certi_v6' : 'presto_budget_col_order_presu_v6';
                        try {
                          localStorage.setItem(storageKey, JSON.stringify(currentList));
                          localStorage.setItem('presto_budget_col_widths_v4', JSON.stringify(colWidths));
                        } catch {}
                        showToast(`Orden y anchos de columnas bloqueados permanentemente (${isCertMode ? 'Certificación' : 'Presupuesto'})`);
                        setShowColumnsMenu(false);
                      }}
                      className="w-full text-center text-xs bg-blue-600 hover:bg-blue-700 text-white py-1 rounded font-semibold transition-colors flex items-center justify-center space-x-1"
                    >
                      <Lock className="w-3 h-3" />
                      <span>Bloquear orden y anchos actuales</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        handleResetColumns();
                        setShowColumnsMenu(false);
                      }}
                      className="w-full text-center text-[11px] text-slate-500 hover:text-slate-800 hover:bg-slate-100 py-1 rounded border border-slate-200 font-medium transition-colors"
                    >
                      Restablecer orden y anchos originales
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>

          <div className="font-mono text-xs font-bold text-blue-900 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded shadow-2xs">
            Total: {totalBudget.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
          </div>
        </div>
      </div>

      {/* Main Table Grid with draggable columns in user-reorderable order */}
      {(() => {
        const allPhaseKeys = phases.map((p) => `fase_${p.id}`);
        const allKnownKeys = [...DEFAULT_COLUMN_ORDER, ...allPhaseKeys];
        const currentOrder = [
          ...columnOrder.filter((k) => allKnownKeys.includes(k)),
          ...allKnownKeys.filter((k) => !columnOrder.includes(k)),
        ];
        const orderedVisibleCols = currentOrder.filter((key) => isColVisible(key));

        const totalTableWidth = Math.max(
          orderedVisibleCols.reduce((sum, key) => sum + (colWidths[key] || getColDefaultWidth(key)), 0),
          750
        );

        const getHeaderStyleClasses = (key: string): string => {
          if (key === 'num') return 'text-center font-mono text-slate-500';
          if (key === 'codigo' || key === 'resumen') return 'text-left';
          if (key === 'ud') return 'text-center';
          if (key === 'impPres') return 'text-right bg-slate-100 font-bold';
          if (key === 'canCert' || key === 'porcCert') return 'text-right bg-blue-50 text-blue-900 border-r-blue-200';
          if (key === 'impCert') return 'text-right bg-blue-100/70 text-blue-950 font-bold border-r-blue-200';
          if (key === 'canAcum' || key === 'porcAcum') return 'text-right bg-indigo-50 text-indigo-900 border-r-indigo-200';
          if (key === 'impAcum') return 'text-right bg-indigo-100/70 text-indigo-950 font-bold border-r-indigo-200';
          if (key === 'canPend') return 'text-right text-slate-600';
          if (key === 'impPend') return 'text-right text-rose-800 bg-rose-50/50';
          if (key.startsWith('fase_')) return 'text-right bg-blue-50/80 text-blue-950 font-bold border-r-blue-200';
          return 'text-right';
        };

        const getHeaderTooltip = (key: string): string => {
          if (key === 'resumen') return 'Doble clic para subir de nivel | Arrastra para reordenar columna';
          if (key.startsWith('fase_')) {
            const fId = key.replace('fase_', '');
            const p = phases.find((phase) => phase.id === fId);
            return p ? `Certificación ${p.nombre} (${p.fecha}) | Arrastra para reordenar columna` : 'Arrastra para reordenar columna';
          }
          return `${getColLabel(key)} | Arrastra para reordenar columna`;
        };

        const renderHeaderContent = (colKey: string) => {
          if (colKey === 'num') return <span>Nº</span>;
          if (colKey === 'codigo') return <span>Código</span>;
          if (colKey === 'resumen') {
            return (
              <div
                className="flex items-center justify-between min-w-0"
                onDoubleClick={onGoUpLevel}
                title="Doble clic para subir de nivel | Arrastra para reordenar columna"
              >
                <span className="truncate">Resumen / Designación</span>
              </div>
            );
          }
          if (colKey === 'ud') return <span>Ud</span>;
          if (colKey === 'canPres') {
            return (
              <div className="flex flex-col text-right">
                <span title="Cantidad Presupuestada">CanPres</span>
                <span className="text-[9px] font-normal text-slate-400 font-mono">[m/ud]</span>
              </div>
            );
          }
          if (colKey === 'precio') {
            return (
              <div className="flex flex-col text-right">
                <span title="Precio unitario (€)">Precio</span>
                <span className="text-[9px] font-normal text-slate-400 font-mono">[€]</span>
              </div>
            );
          }
          if (colKey === 'impPres') {
            return (
              <div className="flex flex-col text-right">
                <span title="Importe Presupuesto (€)">ImpPres</span>
                <span className="text-[9px] font-normal text-slate-500 font-mono">[€ Total]</span>
              </div>
            );
          }
          if (colKey === 'canCert') {
            return (
              <div className="flex flex-col text-right text-blue-900">
                <span title={`Cantidad certificada en ${activeFase.nombre}`}>CanCert</span>
                <span className="text-[9px] font-semibold text-blue-700 font-mono">[m/ud Fase]</span>
              </div>
            );
          }
          if (colKey === 'porcCert') {
            return (
              <div className="flex flex-col text-right text-blue-900">
                <span title={`% Certificado en ${activeFase.nombre}`}>% Cert</span>
                <span className="text-[9px] font-semibold text-blue-700 font-mono">[%]</span>
              </div>
            );
          }
          if (colKey === 'impCert') {
            return (
              <div className="flex flex-col text-right text-blue-950 font-bold">
                <span title={`Importe certificado en ${activeFase.nombre} (€)`}>ImpCert</span>
                <span className="text-[9px] font-semibold text-blue-800 font-mono">[€ Fase]</span>
              </div>
            );
          }
          if (colKey === 'canAcum') {
            return (
              <div className="flex flex-col text-right text-indigo-900">
                <span title="Cantidad acumulada a origen">CanAcum</span>
                <span className="text-[9px] font-semibold text-indigo-700 font-mono">[m/ud Origen]</span>
              </div>
            );
          }
          if (colKey === 'porcAcum') {
            return (
              <div className="flex flex-col text-right text-indigo-900">
                <span title="% Acumulado a origen">% Acum</span>
                <span className="text-[9px] font-semibold text-indigo-700 font-mono">[%]</span>
              </div>
            );
          }
          if (colKey === 'impAcum') {
            return (
              <div className="flex flex-col text-right text-indigo-950 font-bold">
                <span title="Importe total acumulado a origen (€)">ImpAcum</span>
                <span className="text-[9px] font-semibold text-indigo-800 font-mono">[€ Origen]</span>
              </div>
            );
          }
          if (colKey === 'canPend') {
            return (
              <div className="flex flex-col text-right text-slate-600">
                <span title="Cantidad pendiente de certificar">CanPend</span>
                <span className="text-[9px] font-normal text-slate-400 font-mono">[m/ud]</span>
              </div>
            );
          }
          if (colKey === 'impPend') {
            return (
              <div className="flex flex-col text-right text-rose-800">
                <span title="Importe pendiente (€)">ImpPend</span>
                <span className="text-[9px] font-normal text-rose-600 font-mono">[€ Pendiente]</span>
              </div>
            );
          }
          if (colKey.startsWith('fase_')) {
            const fId = colKey.replace('fase_', '');
            const p = phases.find((phase) => phase.id === fId);
            if (!p) return <span>{colKey}</span>;
            const isPhaseClosed = p.estado === 'cerrada';
            return (
              <div className="flex flex-col text-right">
                <div className="flex items-center justify-end space-x-1">
                  <span>Fase {p.numero}</span>
                  {isPhaseClosed && (
                    <span title="Fase cerrada y bloqueada">
                      <Lock className="w-2.5 h-2.5 text-rose-600 shrink-0" />
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-normal text-blue-700 font-mono tracking-tight">{p.fecha}</span>
                <span className="text-[9px] font-semibold text-blue-800">
                  {phaseDisplayMode === 'importe' ? '[€ Total]' : phaseDisplayMode === 'cantidad' ? '[m/ud]' : '[m/ud y €]'}
                </span>
              </div>
            );
          }
          return <span>{colKey}</span>;
        };

        const renderCellContent = (
          colKey: string,
          rel: RelacionEstructura,
          co: Concepto,
          idx: number,
          stats: CertificationStats,
          cantStr: string,
          precioStr: string,
          isChapterOrSub: boolean,
          itemType: 'capitulo' | 'subcapitulo' | 'partida',
          isSelected: boolean
        ) => {
          if (colKey === 'num') {
            return (
              <td className="p-1.5 border-r border-slate-300 text-center text-slate-400 font-mono text-[11px]">
                {idx + 1}
              </td>
            );
          }

          if (colKey === 'codigo') {
            return (
              <td className="p-1.5 border-r border-slate-300 font-mono font-bold text-blue-900 truncate">
                {editingCell?.code === co.codigo && editingCell?.field === 'codigo' ? (
                  <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="text"
                      value={tempValue}
                      onChange={(e) => setTempValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveEdit(co.codigo, 'codigo');
                        if (e.key === 'Escape') cancelEdit();
                      }}
                      className="w-full bg-white border border-blue-500 px-1 py-0.5 rounded text-xs font-mono outline-none"
                      autoFocus
                    />
                    <button
                      onClick={() => saveEdit(co.codigo, 'codigo')}
                      className="ml-1 p-0.5 bg-blue-600 text-white rounded hover:bg-blue-500"
                    >
                      <Check className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <span
                    onDoubleClick={(e) => startEdit(co.codigo, 'codigo', co.codigo, e)}
                    title="Doble clic para editar código"
                  >
                    {co.codigo}
                  </span>
                )}
              </td>
            );
          }

          if (colKey === 'resumen') {
            return (
              <td className="p-1.5 border-r border-slate-300 truncate">
                {editingCell?.code === co.codigo && editingCell?.field === 'resumen' ? (
                  <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="text"
                      value={tempValue}
                      onChange={(e) => setTempValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveEdit(co.codigo, 'resumen');
                        if (e.key === 'Escape') cancelEdit();
                      }}
                      className="w-full bg-white border border-blue-500 px-1 py-0.5 rounded text-xs outline-none"
                      autoFocus
                    />
                    <button
                      onClick={() => saveEdit(co.codigo, 'resumen')}
                      className="ml-1 p-0.5 bg-blue-600 text-white rounded hover:bg-blue-500"
                    >
                      <Check className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center space-x-1.5 min-w-0">
                    {renderItemIcon(co.codigo)}
                    <span
                      className="truncate text-slate-800"
                      title={co.resumen || co.codigo}
                      onDoubleClick={(e) => {
                        if (!isChapterOrSub) {
                          startEdit(co.codigo, 'resumen', co.resumen || co.codigo, e);
                        }
                      }}
                    >
                      {co.resumen || co.codigo}
                    </span>
                  </div>
                )}
              </td>
            );
          }

          if (colKey === 'ud') {
            return (
              <td className="p-1.5 border-r border-slate-300 text-center text-slate-600 font-mono">
                {!isChapterOrSub && editingCell?.code === co.codigo && editingCell?.field === 'unidad' ? (
                  <input
                    type="text"
                    value={tempValue}
                    onChange={(e) => setTempValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveEdit(co.codigo, 'unidad');
                      if (e.key === 'Escape') cancelEdit();
                    }}
                    onBlur={() => saveEdit(co.codigo, 'unidad')}
                    className="w-full text-center bg-white border border-blue-500 rounded text-xs outline-none"
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span
                    onDoubleClick={(e) => {
                      if (!isChapterOrSub) startEdit(co.codigo, 'unidad', co.unidad, e);
                    }}
                  >
                    {co.unidad || ''}
                  </span>
                )}
              </td>
            );
          }

          if (colKey === 'canPres') {
            return (
              <td className="p-1.5 border-r border-slate-300 text-right font-mono tabular-nums text-slate-700">
                {cantStr}
              </td>
            );
          }

          if (colKey === 'precio') {
            return (
              <td className="p-1.5 border-r border-slate-300 text-right font-mono tabular-nums text-slate-800">
                {!isChapterOrSub && editingCell?.code === co.codigo && editingCell?.field === 'precio' ? (
                  <input
                    type="text"
                    value={tempValue}
                    onChange={(e) => setTempValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveEdit(co.codigo, 'precio');
                      if (e.key === 'Escape') cancelEdit();
                    }}
                    onBlur={() => saveEdit(co.codigo, 'precio')}
                    className="w-full text-right bg-white border border-blue-500 rounded text-xs outline-none"
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span
                    onDoubleClick={(e) => {
                      if (!isChapterOrSub) startEdit(co.codigo, 'precio', co.precio, e);
                    }}
                  >
                    {precioStr}
                  </span>
                )}
              </td>
            );
          }

          if (colKey === 'impPres') {
            return (
              <td className="p-1.5 border-r border-slate-300 text-right font-mono font-bold text-slate-900 tabular-nums">
                {stats.impPres.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </td>
            );
          }

          if (colKey === 'canCert') {
            return (
              <td className="p-1.5 border-r border-blue-200 text-right font-mono tabular-nums text-blue-900 bg-blue-50/40">
                {!isChapterOrSub && editingCell?.code === co.codigo && editingCell?.field === 'canCert' ? (
                  <input
                    type="text"
                    value={tempValue}
                    onChange={(e) => setTempValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveEdit(co.codigo, 'canCert');
                      if (e.key === 'Escape') cancelEdit();
                    }}
                    onBlur={() => saveEdit(co.codigo, 'canCert')}
                    className="w-full text-right bg-white border border-blue-600 rounded text-xs outline-none"
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span
                    onDoubleClick={(e) => {
                      if (!isChapterOrSub) startEdit(co.codigo, 'canCert', stats.canCert > 0 ? stats.canCert : '', e);
                    }}
                    title="Doble clic para editar cantidad en fase activa"
                  >
                    {!isChapterOrSub ? (stats.canCert > 0 ? stats.canCert.toFixed(2) : '0,00') : ''}
                  </span>
                )}
              </td>
            );
          }

          if (colKey === 'porcCert') {
            return (
              <td className="p-1.5 border-r border-blue-200 text-right font-mono tabular-nums text-blue-800 bg-blue-50/40">
                {!isChapterOrSub && editingCell?.code === co.codigo && editingCell?.field === 'porcCert' ? (
                  <input
                    type="text"
                    value={tempValue}
                    placeholder="0,0%"
                    onChange={(e) => setTempValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveEdit(co.codigo, 'porcCert');
                      if (e.key === 'Escape') cancelEdit();
                    }}
                    onBlur={() => saveEdit(co.codigo, 'porcCert')}
                    className="w-full text-right bg-white border border-blue-600 rounded text-xs outline-none"
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span
                    onDoubleClick={(e) => {
                      if (!isChapterOrSub) startEdit(co.codigo, 'porcCert', stats.porcCert > 0 ? stats.porcCert : '', e);
                    }}
                    title="Doble clic para editar % certificado en fase activa"
                  >
                    {!isChapterOrSub ? (stats.canCert > 0 ? `${stats.porcCert.toFixed(1)}%` : '0,0%') : ''}
                  </span>
                )}
              </td>
            );
          }

          if (colKey === 'impCert') {
            const hasCert = !isChapterOrSub ? stats.canCert > 0 : stats.impCert > 0;
            return (
              <td className="p-1.5 border-r border-blue-200 text-right font-mono font-bold text-blue-950 bg-blue-100/50 tabular-nums">
                {hasCert
                  ? stats.impCert.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                  : '0,00'}
              </td>
            );
          }

          if (colKey === 'canAcum') {
            // New certifications must go to 0,00 and not inherit previous certification values
            return (
              <td className="p-1.5 border-r border-indigo-200 text-right font-mono tabular-nums text-indigo-900 bg-indigo-50/30">
                {!isChapterOrSub ? (stats.canCert > 0 ? stats.canAcum.toFixed(2) : '0,00') : ''}
              </td>
            );
          }

          if (colKey === 'porcAcum') {
            return (
              <td className="p-1.5 border-r border-indigo-200 text-right font-mono tabular-nums text-indigo-800 bg-indigo-50/30">
                <span className={stats.canCert > 0 && stats.porcAcum >= 100 ? 'text-emerald-700 font-bold' : ''}>
                  {!isChapterOrSub ? (stats.canCert > 0 ? `${stats.porcAcum.toFixed(1)}%` : '0,0%') : ''}
                </span>
              </td>
            );
          }

          if (colKey === 'impAcum') {
            const hasCert = !isChapterOrSub ? stats.canCert > 0 : stats.impCert > 0;
            return (
              <td className="p-1.5 border-r border-indigo-200 text-right font-mono font-bold text-indigo-950 bg-indigo-100/40 tabular-nums">
                {hasCert
                  ? stats.impAcum.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                  : '0,00'}
              </td>
            );
          }

          if (colKey === 'canPend') {
            const displayCanPend = stats.canCert > 0 ? stats.canPend : stats.canPres;
            return (
              <td className="p-1.5 border-r border-slate-300 text-right font-mono tabular-nums text-slate-600">
                {!isChapterOrSub ? displayCanPend.toFixed(2) : ''}
              </td>
            );
          }

          if (colKey === 'impPend') {
            const hasCert = !isChapterOrSub ? stats.canCert > 0 : stats.impCert > 0;
            const displayImpPend = hasCert ? stats.impPend : stats.impPres;
            return (
              <td className="p-1.5 border-r border-slate-300 text-right font-mono font-medium text-rose-800 bg-rose-50/30 tabular-nums">
                {displayImpPend.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </td>
            );
          }

          if (colKey.startsWith('fase_')) {
            const fId = colKey.replace('fase_', '');
            const phase = phases.find((p) => p.id === fId);
            if (!phase) return <td key={colKey} className="p-1.5 border-r border-slate-200">-</td>;
            const phaseStats = getRelCertificationStats(project, currentNodeCode, co.codigo, phase.id);
            const isPhaseClosed = phase.estado === 'cerrada';

            if (isChapterOrSub) {
              let capContent = '-';
              if (phaseDisplayMode === 'cantidad') {
                capContent = phaseStats.porcCert > 0 ? `${phaseStats.porcCert.toFixed(1)}%` : '-';
              } else if (phaseDisplayMode === 'importe') {
                capContent = phaseStats.impCert > 0
                  ? `${phaseStats.impCert.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
                  : '-';
              } else {
                capContent = phaseStats.impCert > 0
                  ? `${phaseStats.impCert.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} € (${phaseStats.porcCert.toFixed(1)}%)`
                  : '-';
              }

              return (
                <td
                  key={colKey}
                  className="p-1.5 border-r border-blue-200 text-right font-mono tabular-nums font-semibold text-blue-900 bg-blue-50/20"
                  title={`Capítulo certificado en Fase ${phase.numero}: ${phaseStats.impCert.toFixed(2)} € (${phaseStats.porcCert.toFixed(1)}%)`}
                >
                  {capContent}
                </td>
              );
            }

            // Partida / Unidad de obra
            const cantVal = phaseStats.canCert;
            const udStr = co.unidad ? ` ${co.unidad}` : '';
            let partContent = '-';

            if (phaseDisplayMode === 'cantidad') {
              partContent = cantVal > 0 ? `${cantVal.toFixed(2)}${udStr}` : '-';
            } else if (phaseDisplayMode === 'importe') {
              partContent = phaseStats.impCert > 0
                ? `${phaseStats.impCert.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
                : '-';
            } else {
              // ambos: shows both quantity with units and euros
              if (cantVal > 0 || phaseStats.impCert > 0) {
                partContent = `${cantVal.toFixed(2)}${udStr} (${phaseStats.impCert.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €)`;
              } else {
                partContent = '-';
              }
            }

            const isEditingThisPhase = editingCell?.code === co.codigo && editingCell?.field === colKey;

            return (
              <td
                key={colKey}
                onDoubleClick={(e) => {
                  if (!isChapterOrSub && !isPhaseClosed) {
                    startEdit(co.codigo, colKey, cantVal > 0 ? cantVal : '', e);
                  }
                }}
                className={`p-1.5 border-r border-blue-200 text-right font-mono tabular-nums bg-blue-50/20 ${
                  isPhaseClosed ? 'text-slate-500 bg-slate-50/40' : 'text-blue-950 font-medium cursor-pointer hover:bg-blue-100/50'
                }`}
                title={isPhaseClosed ? 'Fase cerrada y bloqueada' : `Doble clic para certificar en Fase ${phase.numero} (${cantVal.toFixed(2)}${udStr})`}
              >
                {isEditingThisPhase && !isPhaseClosed ? (
                  <input
                    type="text"
                    value={tempValue}
                    placeholder="0,00"
                    onChange={(e) => setTempValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveEdit(co.codigo, colKey);
                      if (e.key === 'Escape') cancelEdit();
                    }}
                    onBlur={() => saveEdit(co.codigo, colKey)}
                    className="w-full text-right bg-white border border-blue-600 rounded text-xs outline-none"
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  partContent
                )}
              </td>
            );
          }

          return <td key={colKey} className="p-1.5 border-r border-slate-200">-</td>;
        };

        return (
          <div className="flex-1 overflow-auto bg-white">
            <table className="border-collapse text-left text-xs table-fixed" style={{ width: `${totalTableWidth}px`, minWidth: '100%' }}>
              <colgroup>
                {orderedVisibleCols.map((colKey) => (
                  <col key={colKey} style={{ width: `${colWidths[colKey] || getColDefaultWidth(colKey)}px` }} />
                ))}
              </colgroup>
              <thead className="bg-slate-100 text-slate-700 sticky top-0 font-semibold border-b border-slate-300 z-10 shadow-sm select-none">
                <tr>
                  {orderedVisibleCols.map((colKey) => {
                    const isDragging = draggedColKey === colKey;
                    const isDragOver = dragOverColKey === colKey;

                    return (
                      <th
                        key={colKey}
                        draggable={true}
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', colKey);
                          e.dataTransfer.effectAllowed = 'move';
                          setDraggedColKey(colKey);
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'move';
                          if (dragOverColKey !== colKey) setDragOverColKey(colKey);
                        }}
                        onDragLeave={() => {
                          if (dragOverColKey === colKey) setDragOverColKey(null);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          const source = e.dataTransfer.getData('text/plain') || draggedColKey;
                          if (source && source !== colKey) {
                            handleReorderColumns(source, colKey);
                          }
                          setDraggedColKey(null);
                          setDragOverColKey(null);
                        }}
                        onDragEnd={() => {
                          setDraggedColKey(null);
                          setDragOverColKey(null);
                        }}
                        className={`relative p-1.5 border-r border-slate-300 select-none transition-colors cursor-grab active:cursor-grabbing ${getHeaderStyleClasses(
                          colKey
                        )} ${isDragging ? 'opacity-30' : ''} ${
                          isDragOver ? 'border-l-4 border-l-blue-600 bg-blue-100 ring-2 ring-blue-500/50' : ''
                        }`}
                        title={getHeaderTooltip(colKey)}
                      >
                        {renderHeaderContent(colKey)}
                        <div
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            handleStartResize(colKey, e);
                          }}
                          className="absolute right-0 top-0 bottom-0 w-3 cursor-col-resize hover:bg-blue-500/20 group flex items-center justify-end z-20"
                          title="Arrastra para redimensionar columna"
                        >
                          <div className="w-[2px] h-3.5 bg-slate-300 group-hover:bg-blue-600 transition-colors" />
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-sans">
                {filteredRels.length === 0 ? (
                  <tr>
                    <td colSpan={orderedVisibleCols.length} className="p-8 text-center text-slate-400">
                      {searchTerm
                        ? 'No se encontraron conceptos con ese filtro'
                        : 'Este nivel está vacío. Haz clic en "+ Capítulo", "+ Subcapítulo" o "+ Partida" para añadir conceptos, o pega con Ctrl+V.'}
                    </td>
                  </tr>
                ) : (
                  filteredRels.map((rel, idx) => {
                    const co = project.conceptos[rel.hijoCodigo] || {
                      codigo: rel.hijoCodigo,
                      resumen: rel.hijoCodigo,
                      unidad: '',
                      precio: 0,
                    };
                    const itemType = getConceptType(project, co.codigo, currentNodeCode);
                    const isChapterOrSub = itemType === 'capitulo' || itemType === 'subcapitulo';
                    const hasChildren = (project.estructuras[co.codigo] || []).length > 0;
                    const isSelected = selectedConceptCode === co.codigo;

                    const stats: CertificationStats = getRelCertificationStats(
                      project,
                      currentNodeCode,
                      co.codigo,
                      activeFaseId
                    );

                    const cantStr = !isChapterOrSub ? stats.canPres.toFixed(2) : '';
                    const precioVal = (!isChapterOrSub ? stats.precio : (stats.impPres ?? 0)) || 0;
                    const precioStr = precioVal ? precioVal.toFixed(2) : '';

                    return (
                      <tr
                        key={co.codigo}
                        onClick={() => onSelectConcept(co.codigo)}
                        onDoubleClick={() => {
                          if (hasChildren || isChapterOrSub) {
                            onNavigateToNode(co.codigo);
                          }
                        }}
                        className={`transition-colors cursor-pointer group ${
                          isSelected
                            ? 'bg-blue-100/90 font-medium'
                            : isChapterOrSub
                            ? itemType === 'capitulo'
                              ? 'bg-amber-50/40 hover:bg-amber-100/60 font-semibold'
                              : 'bg-indigo-50/30 hover:bg-indigo-100/50 font-medium'
                            : 'hover:bg-blue-50/50'
                        }`}
                      >
                        {orderedVisibleCols.map((colKey) => (
                          <React.Fragment key={colKey}>
                            {renderCellContent(
                              colKey,
                              rel,
                              co,
                              idx,
                              stats,
                              cantStr,
                              precioStr,
                              isChapterOrSub,
                              itemType,
                              isSelected
                            )}
                          </React.Fragment>
                        ))}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        );
      })()}

      {/* New Certification Phase Modal Dialog */}
      {showNewFaseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-lg shadow-xl border border-slate-200 w-full max-w-sm p-4 text-xs animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-200 font-semibold text-slate-800 text-sm">
              <div className="flex items-center space-x-1.5 text-blue-700">
                <Calendar className="w-4 h-4" />
                <span>Nueva Fase de Certificación</span>
              </div>
              <button
                onClick={() => setShowNewFaseModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateFaseSubmit} className="space-y-3">
              <div>
                <label className="block text-slate-600 font-medium mb-1">Nombre de la Fase:</label>
                <input
                  type="text"
                  placeholder="ej. Fase 3"
                  value={newFaseNombre}
                  onChange={(e) => setNewFaseNombre(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs focus:outline-none focus:border-blue-500 font-medium"
                  autoFocus
                  required
                />
              </div>

              <div>
                <label className="block text-slate-600 font-medium mb-1">Fecha de Certificación (DD-Mes-AA):</label>
                <input
                  type="text"
                  placeholder="ej. 31-Mar-26"
                  value={newFaseFecha}
                  onChange={(e) => setNewFaseFecha(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs focus:outline-none focus:border-blue-500 font-mono"
                  required
                />
              </div>

              <div className="pt-2 flex justify-end space-x-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowNewFaseModal(false)}
                  className="px-3 py-1.5 rounded border border-slate-300 text-slate-600 hover:bg-slate-100 font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white font-medium"
                >
                  Crear Fase
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Modal to Delete Concept from Budget */}
      {conceptToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-lg shadow-xl border border-slate-200 max-w-sm w-full p-4 text-xs animate-in zoom-in-95">
            <div className="flex items-start space-x-3 mb-3">
              <div className="p-2 rounded-full bg-rose-100 text-rose-600 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-bold text-slate-800">
                  ¿Eliminar elemento del presupuesto?
                </h3>
                <p className="text-slate-600 mt-1">
                  Estás a punto de eliminar el concepto <strong className="font-mono text-slate-900">{conceptToDelete}</strong> del presupuesto actual.
                </p>
                <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded p-1.5 mt-2">
                  Esta acción eliminará la partida y todas sus líneas de medición.
                </p>
              </div>
            </div>
            <div className="pt-2 flex justify-end space-x-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setConceptToDelete(null)}
                className="px-3 py-1.5 rounded border border-slate-300 text-slate-600 hover:bg-slate-100 font-medium"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  const toDel = conceptToDelete;
                  setConceptToDelete(null);
                  onDeleteConcept(toDel);
                  showToast(`Elemento ${toDel} eliminado`);
                }}
                className="px-3 py-1.5 rounded bg-rose-600 hover:bg-rose-700 text-white font-semibold"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
