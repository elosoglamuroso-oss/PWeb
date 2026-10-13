import React, { useState } from 'react';
import { X, ClipboardPaste, Check } from 'lucide-react';
import { SAMPLE_BC3_DATA } from '../data/sampleBc3';

interface PasteBc3ModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportRawText: (text: string) => void;
}

export const PasteBc3Modal: React.FC<PasteBc3ModalProps> = ({
  isOpen,
  onClose,
  onImportRawText,
}) => {
  const [text, setText] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    onImportRawText(text);
    onClose();
  };

  const handleInsertSample = () => {
    setText(SAMPLE_BC3_DATA);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
        <div className="bg-slate-900 text-white px-4 py-3 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2">
            <ClipboardPaste className="w-4 h-4 text-blue-400" />
            <h3 className="font-semibold text-sm">Pegar Contenido de Fichero BC3</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col p-4 text-xs text-slate-700 overflow-hidden">
          <div className="flex justify-between items-center mb-2">
            <p className="text-slate-500">
              Pega aquí el contenido de tu fichero BC3 copiado desde Bloc de Notas o cualquier editor de texto:
            </p>
            <button
              type="button"
              onClick={handleInsertSample}
              className="text-blue-600 hover:text-blue-800 font-semibold underline text-[11px]"
            >
              Pegar fichero de ejemplo (Presto 22.01)
            </button>
          </div>

          <textarea
            required
            rows={14}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="~V|RIB Spain|FIEBDC-3/2020...&#10;~C|0##|||270776.74|...&#10;~D|0##|1\1\1\...&#10;~M|..."
            className="flex-1 w-full border border-slate-300 rounded p-3 font-mono text-[11px] leading-relaxed focus:ring-1 focus:ring-blue-500 focus:outline-none bg-slate-50/50 resize-none"
          />

          <div className="flex justify-end space-x-2 pt-3 border-t border-slate-200 mt-3 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 border border-slate-300 rounded text-slate-700 hover:bg-slate-50 text-xs font-medium"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex items-center space-x-1.5 px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-xs"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Procesar y Cargar Presupuesto</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
