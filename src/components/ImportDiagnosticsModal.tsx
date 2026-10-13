import React, { useState } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  Info,
  ChevronDown,
  ChevronRight,
  FileText,
  Copy,
  Check,
  X,
} from 'lucide-react';
import { ImportDiagnostics } from '../types/bc3';

interface ImportDiagnosticsModalProps {
  isOpen: boolean;
  diagnostics: ImportDiagnostics | null;
  fileName?: string;
  onClose: () => void;
}

export function ImportDiagnosticsModal({
  isOpen,
  diagnostics,
  fileName = 'archivo.bc3',
  onClose,
}: ImportDiagnosticsModalProps) {
  const [copied, setCopied] = useState(false);
  const [expandOrphans, setExpandOrphans] = useState(true);
  const [expandDuplicates, setExpandDuplicates] = useState(false);
  const [expandUnsupported, setExpandUnsupported] = useState(false);

  if (!isOpen || !diagnostics) return null;

  const hasOrphans = (diagnostics.orphanedMeasurements || []).length > 0;
  const hasDuplicates = (diagnostics.duplicateConcepts || []).length > 0;
  const hasUnsupported = (diagnostics.unsupportedRecords || []).length > 0;

  const handleCopyReport = () => {
    const lines = [
      `INFORME DE IMPORTACIÓN BC3 / FIEBDC: ${fileName}`,
      `Fecha: ${new Date().toLocaleString()}`,
      `Codificación: ${diagnostics.detectedEncoding}`,
      `Conceptos: ${diagnostics.totalConcepts}`,
      `Relaciones: ${diagnostics.totalRelations}`,
      `Mediciones procesadas: ${diagnostics.totalMeasurements}`,
      `Mediciones aplicadas: ${diagnostics.appliedMeasurements}`,
      `Mediciones descartadas/huérfanas: ${diagnostics.orphanedMeasurements.length}`,
      '',
    ];

    if (hasOrphans) {
      lines.push('--- MEDICIONES DESCARTADAS O HUÉRFANAS ---');
      diagnostics.orphanedMeasurements.forEach((m) => {
        lines.push(`- Partida: ${m.code} | Padre: ${m.parentCode || 'N/A'} | Cantidad: ${m.quantity} | Motivo: ${m.reason}`);
      });
      lines.push('');
    }

    if (hasDuplicates) {
      lines.push('--- CONCEPTOS CON MÚLTIPLES DECLARACIONES (~C) ---');
      diagnostics.duplicateConcepts.forEach((d) => {
        lines.push(`- Código: ${d.code} (${d.occurrences} declaraciones fusionadas no-destructivamente)`);
      });
      lines.push('');
    }

    navigator.clipboard.writeText(lines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${hasOrphans ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'}`}>
              {hasOrphans ? <AlertTriangle className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Informe de Importación BC3
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-md">
                {fileName} · {diagnostics.detectedEncoding}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-sm">
          {/* Key Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg border border-slate-100 dark:border-slate-800">
              <span className="text-xs text-slate-500 dark:text-slate-400 block">Conceptos</span>
              <span className="text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                {diagnostics.totalConcepts.toLocaleString()}
              </span>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg border border-slate-100 dark:border-slate-800">
              <span className="text-xs text-slate-500 dark:text-slate-400 block">Relaciones</span>
              <span className="text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                {diagnostics.totalRelations.toLocaleString()}
              </span>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg border border-slate-100 dark:border-slate-800">
              <span className="text-xs text-slate-500 dark:text-slate-400 block">Mediciones OK</span>
              <span className="text-lg font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                {diagnostics.appliedMeasurements.toLocaleString()}
              </span>
            </div>
            <div className={`p-3 rounded-lg border ${hasOrphans ? 'bg-amber-50/80 border-amber-200 dark:bg-amber-950/20 dark:border-amber-900/50' : 'bg-slate-50 dark:bg-slate-800/50 border-slate-100 dark:border-slate-800'}`}>
              <span className="text-xs text-slate-500 dark:text-slate-400 block">Descartadas (~M)</span>
              <span className={`text-lg font-bold font-mono tabular-nums ${hasOrphans ? 'text-amber-600 dark:text-amber-400' : 'text-slate-700 dark:text-slate-300'}`}>
                {diagnostics.orphanedMeasurements.length.toLocaleString()}
              </span>
            </div>
          </div>

          {/* Encoding detail banner */}
          <div className="flex items-center justify-between text-xs py-2 px-3 bg-slate-100/70 dark:bg-slate-800/60 rounded-md text-slate-600 dark:text-slate-300">
            <span className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-slate-400" />
              <span>Juego de caracteres detectado: <strong className="font-semibold text-slate-800 dark:text-slate-200">{diagnostics.detectedEncoding}</strong></span>
            </span>
            <span className="text-emerald-600 dark:text-emerald-400 font-medium">FIEBDC-3 Válido</span>
          </div>

          {/* Orphaned measurements collapsible */}
          {hasOrphans && (
            <div className="border border-amber-200 dark:border-amber-900/50 rounded-lg overflow-hidden bg-amber-50/30 dark:bg-amber-950/10">
              <button
                type="button"
                onClick={() => setExpandOrphans(!expandOrphans)}
                className="w-full px-4 py-2.5 flex items-center justify-between bg-amber-50/70 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200 text-xs font-semibold"
              >
                <span className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <span>Mediciones descartadas o huérfanas ({diagnostics.orphanedMeasurements.length})</span>
                </span>
                {expandOrphans ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>
              {expandOrphans && (
                <div className="p-3 max-h-48 overflow-y-auto space-y-2 text-xs">
                  <p className="text-slate-500 dark:text-slate-400 text-[11px] mb-2">
                    Las siguientes líneas ~M no se asociaron a ninguna unidad porque la partida no existe o la relación padre-hijo no coincide:
                  </p>
                  {diagnostics.orphanedMeasurements.map((m, idx) => (
                    <div
                      key={idx}
                      className="p-2 bg-white dark:bg-slate-900 rounded border border-amber-100 dark:border-amber-900/40 flex flex-col gap-0.5"
                    >
                      <div className="flex items-center justify-between font-mono">
                        <span className="font-semibold text-slate-800 dark:text-slate-200">{m.code}</span>
                        {m.parentCode && (
                          <span className="text-slate-500 dark:text-slate-400 text-[11px]">padre: {m.parentCode}</span>
                        )}
                        <span className="text-amber-700 dark:text-amber-400 tabular-nums">Cant: {m.quantity}</span>
                      </div>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">{m.reason}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Duplicate concepts collapsible */}
          {hasDuplicates && (
            <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => setExpandDuplicates(!expandDuplicates)}
                className="w-full px-4 py-2.5 flex items-center justify-between bg-slate-50 dark:bg-slate-800/40 text-slate-700 dark:text-slate-300 text-xs font-semibold"
              >
                <span className="flex items-center gap-2">
                  <Info className="w-4 h-4 text-blue-500" />
                  <span>Conceptos re-declarados (~C) fusionados ({diagnostics.duplicateConcepts.length})</span>
                </span>
                {expandDuplicates ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>
              {expandDuplicates && (
                <div className="p-3 max-h-40 overflow-y-auto space-y-1.5 text-xs">
                  <p className="text-slate-500 dark:text-slate-400 text-[11px] mb-2">
                    Conceptos que aparecieron más de una vez en el archivo. Se mantuvieron los precios válidos existentes para evitar que campos vacíos los sobrescriban con 0:
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {diagnostics.duplicateConcepts.map((d, idx) => (
                      <div key={idx} className="p-1.5 bg-slate-50 dark:bg-slate-800 rounded text-[11px] flex items-center justify-between font-mono">
                        <span className="font-medium text-slate-800 dark:text-slate-200">{d.code}</span>
                        <span className="text-slate-400 text-[10px]">{d.occurrences}x</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Unsupported records */}
          {hasUnsupported && (
            <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => setExpandUnsupported(!expandUnsupported)}
                className="w-full px-4 py-2.5 flex items-center justify-between bg-slate-50 dark:bg-slate-800/40 text-slate-700 dark:text-slate-300 text-xs font-semibold"
              >
                <span className="flex items-center gap-2">
                  <Info className="w-4 h-4 text-slate-400" />
                  <span>Otros registros BC3 detectados ({diagnostics.unsupportedRecords.length})</span>
                </span>
                {expandUnsupported ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>
              {expandUnsupported && (
                <div className="p-3 space-y-1 text-xs">
                  <p className="text-slate-500 dark:text-slate-400 text-[11px] mb-2">
                    Registros adicionales FIEBDC no requeridos para presupuesto o certificación:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {diagnostics.unsupportedRecords.map((r, idx) => (
                      <span key={idx} className="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded text-xs font-mono text-slate-600 dark:text-slate-300">
                        {r.type}: {r.count}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleCopyReport}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-slate-500" />}
            <span>{copied ? 'Copiado al portapapeles' : 'Copiar informe técnico'}</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 rounded-lg transition-colors shadow-xs"
          >
            Abrir Presupuesto
          </button>
        </div>
      </div>
    </div>
  );
}
