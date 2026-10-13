import React, { useState, useRef } from 'react';
import {
  X,
  FileSpreadsheet,
  Upload,
  ClipboardPaste,
  CheckCircle,
  AlertCircle,
  ArrowRight,
  FolderTree,
  Table
} from 'lucide-react';
import {
  parseExcelFile,
  parsePastedClipboardText,
  guessColumnMapping,
  analyzeExcelRows,
  buildProjectFromDetectedItems,
  ColumnMapping,
  RawRow,
  DetectedItem
} from '../utils/excelImporter';
import { ProyectoBC3 } from '../types/bc3';

interface ExcelImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportProject: (project: ProyectoBC3, mode: 'replace' | 'append') => void;
  currentParentCode: string | null;
}

export const ExcelImportModal: React.FC<ExcelImportModalProps> = ({
  isOpen,
  onClose,
  onImportProject,
  currentParentCode,
}) => {
  const [sourceMode, setSourceMode] = useState<'file' | 'clipboard'>('file');
  const [clipboardText, setClipboardText] = useState('');
  const [fileName, setFileName] = useState('');
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [rawRows, setRawRows] = useState<RawRow[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({
    codeCol: '',
    summaryCol: '',
    unitCol: '',
    quantityCol: '',
    priceCol: '',
    amountCol: '',
  });
  const [detectedItems, setDetectedItems] = useState<DetectedItem[]>([]);
  const [step, setStep] = useState<1 | 2>(1);
  const [importMode, setImportMode] = useState<'replace' | 'append'>('replace');
  const [projectName, setProjectName] = useState('Presupuesto Importado');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileUpload = async (file: File) => {
    try {
      setErrorMsg(null);
      setFileName(file.name);
      setProjectName(file.name.replace(/\.[^/.]+$/, ''));
      const parsed = await parseExcelFile(file);
      setSheetNames(parsed.sheetNames);
      const defaultSheet = parsed.sheetNames[0] || '';
      setSelectedSheet(defaultSheet);
      const rows = parsed.dataBySheet[defaultSheet] || [];
      setRawRows(rows);

      if (rows.length > 0) {
        const cols = Object.keys(rows[0]).filter((k) => k !== 'index');
        setColumns(cols);
        const autoMapping = guessColumnMapping(cols);
        setMapping(autoMapping);
        const analyzed = analyzeExcelRows(rows, autoMapping);
        setDetectedItems(analyzed);
        setStep(2);
      } else {
        setErrorMsg('La hoja de cálculo seleccionada está vacía.');
      }
    } catch (err: any) {
      setErrorMsg('Error al leer el archivo Excel: ' + (err.message || String(err)));
    }
  };

  const handleSheetChange = (sheet: string) => {
    setSelectedSheet(sheet);
    // Reload rows for this sheet
    // Re-run mapping
  };

  const handleProcessClipboard = () => {
    if (!clipboardText.trim()) {
      setErrorMsg('Pega el texto copiado de Excel antes de continuar.');
      return;
    }
    setErrorMsg(null);
    try {
      const parsed = parsePastedClipboardText(clipboardText);
      setRawRows(parsed.rows);
      setColumns(parsed.columns);
      const autoMapping = guessColumnMapping(parsed.columns);
      setMapping(autoMapping);
      const analyzed = analyzeExcelRows(parsed.rows, autoMapping);
      setDetectedItems(analyzed);
      setFileName('Datos de Portapapeles');
      setStep(2);
    } catch (err: any) {
      setErrorMsg('Error al procesar el texto: ' + (err.message || String(err)));
    }
  };

  const handleMappingChange = (field: keyof ColumnMapping, val: string) => {
    const updated = { ...mapping, [field]: val };
    setMapping(updated);
    const analyzed = analyzeExcelRows(rawRows, updated);
    setDetectedItems(analyzed);
  };

  const handleCompleteImport = () => {
    if (detectedItems.length === 0) {
      setErrorMsg('No se detectaron partidas o capítulos válidos.');
      return;
    }
    const newProject = buildProjectFromDetectedItems(detectedItems, projectName);
    onImportProject(newProject, importMode);
    onClose();
  };

  const numChapters = detectedItems.filter((i) => i.isChapter).length;
  const numPartidas = detectedItems.filter((i) => !i.isChapter).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="bg-slate-900 text-white px-5 py-3 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="w-7 h-7 rounded bg-emerald-600 flex items-center justify-center">
              <FileSpreadsheet className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-sm">Importador Masivo de Presupuestos Excel</h3>
              <p className="text-[11px] text-slate-400">Importa hojas de cálculo completas (.xlsx, .xls, .csv o copiado directo)</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMsg && (
          <div className="bg-rose-50 border-b border-rose-200 px-4 py-2 flex items-center space-x-2 text-rose-700 text-xs shrink-0">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 text-xs text-slate-700">
          {step === 1 ? (
            <div className="space-y-5">
              {/* Source tabs */}
              <div className="flex border-b border-slate-200">
                <button
                  onClick={() => setSourceMode('file')}
                  className={`flex items-center space-x-2 py-2 px-4 font-semibold text-xs border-b-2 transition-colors ${
                    sourceMode === 'file'
                      ? 'border-emerald-600 text-emerald-800 bg-emerald-50/50'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Subir Archivo (.xlsx, .xls, .csv)</span>
                </button>
                <button
                  onClick={() => setSourceMode('clipboard')}
                  className={`flex items-center space-x-2 py-2 px-4 font-semibold text-xs border-b-2 transition-colors ${
                    sourceMode === 'clipboard'
                      ? 'border-emerald-600 text-emerald-800 bg-emerald-50/50'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <ClipboardPaste className="w-3.5 h-3.5" />
                  <span>Pegar Celdas desde Excel</span>
                </button>
              </div>

              {sourceMode === 'file' ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-300 hover:border-emerald-500 rounded-lg p-10 flex flex-col items-center justify-center cursor-pointer transition-colors bg-slate-50 hover:bg-emerald-50/30 group"
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFileUpload(f);
                    }}
                  />
                  <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                    <Upload className="w-6 h-6 text-emerald-700" />
                  </div>
                  <p className="font-semibold text-slate-800 text-sm mb-1">
                    Haz clic para seleccionar tu archivo Excel o arrástralo aquí
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Soporta formatos estándar de Presto, Menfis, Arquímedes o presupuestos propios en .xlsx y .csv
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-slate-600">
                    Selecciona en Excel las filas y columnas de tu presupuesto (incluyendo encabezados), cópialas con <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded font-mono text-[10px]">Ctrl+C</kbd> y pégalas a continuación:
                  </p>
                  <textarea
                    rows={8}
                    value={clipboardText}
                    onChange={(e) => setClipboardText(e.target.value)}
                    placeholder="Código&#9;Resumen&#9;Ud&#9;Cantidad&#9;Precio&#9;Importe..."
                    className="w-full border border-slate-300 rounded p-3 font-mono text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none bg-slate-50/50"
                  />
                  <button
                    onClick={handleProcessClipboard}
                    className="flex items-center space-x-2 bg-emerald-700 hover:bg-emerald-600 text-white px-4 py-2 rounded font-semibold text-xs shadow-xs"
                  >
                    <span>Analizar Columnas y Datos</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* Step 2: Mapping & Preview */
            <div className="space-y-4">
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center space-x-3">
                  <div>
                    <span className="text-slate-500 text-[11px]">Archivo:</span>{' '}
                    <span className="font-semibold text-slate-800">{fileName}</span>
                  </div>
                  {sheetNames.length > 1 && (
                    <div className="flex items-center space-x-1.5">
                      <span className="text-slate-500 text-[11px]">Hoja:</span>
                      <select
                        value={selectedSheet}
                        onChange={(e) => handleSheetChange(e.target.value)}
                        className="bg-white border border-slate-300 rounded px-2 py-0.5 text-xs font-medium"
                      >
                        {sheetNames.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                    <span className="font-bold text-slate-700">{numChapters}</span> Capítulos
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                    <span className="font-bold text-slate-700">{numPartidas}</span> Partidas
                  </div>
                </div>
              </div>

              {/* Column Mapping Selectors */}
              <div className="border border-slate-200 rounded-lg p-3 bg-white space-y-2">
                <div className="font-semibold text-slate-800 flex items-center space-x-1.5 text-xs">
                  <Table className="w-3.5 h-3.5 text-slate-500" />
                  <span>Correspondencia de Columnas Detectadas</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Columna Código:</label>
                    <select
                      value={mapping.codeCol}
                      onChange={(e) => handleMappingChange('codeCol', e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs"
                    >
                      <option value="">(Ninguna)</option>
                      {columns.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Columna Resumen:</label>
                    <select
                      value={mapping.summaryCol}
                      onChange={(e) => handleMappingChange('summaryCol', e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs"
                    >
                      <option value="">(Ninguna)</option>
                      {columns.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Columna Unidad (Ud):</label>
                    <select
                      value={mapping.unitCol}
                      onChange={(e) => handleMappingChange('unitCol', e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs"
                    >
                      <option value="">(Ninguna)</option>
                      {columns.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Columna Cantidad:</label>
                    <select
                      value={mapping.quantityCol}
                      onChange={(e) => handleMappingChange('quantityCol', e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs"
                    >
                      <option value="">(Ninguna)</option>
                      {columns.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Columna Precio:</label>
                    <select
                      value={mapping.priceCol}
                      onChange={(e) => handleMappingChange('priceCol', e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs"
                    >
                      <option value="">(Ninguna)</option>
                      {columns.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Data Preview Table */}
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-200 font-semibold text-slate-700 flex justify-between items-center">
                  <span>Vista previa de datos interpretados (primeras {Math.min(25, detectedItems.length)} filas)</span>
                  <span className="text-[11px] text-slate-500 font-normal">
                    Total: {detectedItems.length} líneas
                  </span>
                </div>
                <div className="max-h-56 overflow-y-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-50 sticky top-0 border-b border-slate-200 text-slate-600 font-semibold">
                      <tr>
                        <th className="p-1.5 border-r border-slate-200 w-12 text-center">Fila</th>
                        <th className="p-1.5 border-r border-slate-200 w-24">Tipo</th>
                        <th className="p-1.5 border-r border-slate-200 w-28">Código</th>
                        <th className="p-1.5 border-r border-slate-200">Resumen</th>
                        <th className="p-1.5 border-r border-slate-200 w-16 text-center">Ud</th>
                        <th className="p-1.5 border-r border-slate-200 w-20 text-right">Cantidad</th>
                        <th className="p-1.5 text-right w-24">Precio (€)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                      {detectedItems.slice(0, 25).map((item) => (
                        <tr
                          key={item.index}
                          className={item.isChapter ? 'bg-amber-50/60 font-semibold text-slate-800' : 'hover:bg-slate-50 text-slate-700'}
                        >
                          <td className="p-1 border-r border-slate-200 text-center text-slate-400 font-sans">
                            {item.index}
                          </td>
                          <td className="p-1 border-r border-slate-200">
                            <span
                              className={`px-1.5 py-0.2 rounded text-[10px] font-sans font-medium ${
                                item.isChapter
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-blue-100 text-blue-800'
                              }`}
                            >
                              {item.isChapter ? 'Capítulo' : 'Partida'}
                            </span>
                          </td>
                          <td className="p-1 border-r border-slate-200 font-bold text-blue-900 truncate">
                            {item.code}
                          </td>
                          <td className="p-1 border-r border-slate-200 font-sans truncate" style={{ paddingLeft: `${item.level * 8 + 4}px` }}>
                            {item.summary}
                          </td>
                          <td className="p-1 border-r border-slate-200 text-center font-sans text-slate-600">
                            {item.unit}
                          </td>
                          <td className="p-1 border-r border-slate-200 text-right tabular-nums">
                            {item.isChapter ? '' : item.quantity.toFixed(2)}
                          </td>
                          <td className="p-1 text-right tabular-nums">
                            {item.isChapter ? '' : item.price.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Import options */}
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-2">
                <div className="font-semibold text-slate-800">Modo de integración:</div>
                <div className="flex items-center space-x-6">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="importMode"
                      value="replace"
                      checked={importMode === 'replace'}
                      onChange={() => setImportMode('replace')}
                      className="text-emerald-600"
                    />
                    <span>Crear como nuevo proyecto de presupuesto</span>
                  </label>

                  {currentParentCode && (
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="radio"
                        name="importMode"
                        value="append"
                        checked={importMode === 'append'}
                        onChange={() => setImportMode('append')}
                        className="text-emerald-600"
                      />
                      <span>
                        Añadir bajo el capítulo actual (<span className="font-mono font-bold">{currentParentCode}</span>)
                      </span>
                    </label>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="bg-slate-100 px-5 py-3 border-t border-slate-200 flex justify-between items-center shrink-0">
          <div>
            {step === 2 && (
              <button
                onClick={() => setStep(1)}
                className="text-slate-600 hover:text-slate-900 text-xs font-semibold"
              >
                ← Volver a seleccionar archivo
              </button>
            )}
          </div>
          <div className="flex space-x-2">
            <button
              onClick={onClose}
              className="px-4 py-1.5 border border-slate-300 rounded text-slate-700 hover:bg-white text-xs font-medium transition-colors"
            >
              Cancelar
            </button>
            {step === 2 && (
              <button
                onClick={handleCompleteImport}
                className="flex items-center space-x-1.5 bg-emerald-700 hover:bg-emerald-600 text-white px-5 py-1.5 rounded text-xs font-semibold shadow-xs transition-colors"
              >
                <CheckCircle className="w-3.5 h-3.5" />
                <span>Completar Importación</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
