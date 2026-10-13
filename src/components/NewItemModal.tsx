import React, { useState, useEffect } from 'react';
import { X, FolderPlus, FilePlus } from 'lucide-react';
import { ProyectoBC3 } from '../types/bc3';

interface NewItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'capitulo' | 'subcapitulo' | 'partida';
  parentCode: string;
  project: ProyectoBC3 | null;
  onConfirm: (item: {
    type: 'capitulo' | 'subcapitulo' | 'partida';
    code: string;
    summary: string;
    unit: string;
    price: number;
    quantity: number;
  }) => void;
}

export const NewItemModal: React.FC<NewItemModalProps> = ({
  isOpen,
  onClose,
  type,
  parentCode,
  project,
  onConfirm,
}) => {
  const [code, setCode] = useState('');
  const [summary, setSummary] = useState('');
  const [unit, setUnit] = useState('ud');
  const [price, setPrice] = useState('0.00');
  const [quantity, setQuantity] = useState('1');

  useEffect(() => {
    if (!isOpen) return;

    // Suggest a smart next code
    const existingRels = (project && project.estructuras[parentCode]) || [];
    const count = existingRels.length + 1;

    if (type === 'capitulo' || type === 'subcapitulo') {
      const cleanParent = parentCode.replace(/#+$/, '');
      if (cleanParent === '0' || cleanParent === '__ROOT__' || !cleanParent) {
        setCode(`${count}#`);
      } else {
        const padded = count < 10 ? `0${count}` : `${count}`;
        setCode(`${cleanParent}.${padded}#`);
      }
      setUnit('');
      setPrice('0.00');
      setQuantity('1');
    } else {
      setCode(`PART${count < 10 ? '00' : count < 100 ? '0' : ''}${count}`);
      setUnit('ud');
      setPrice('0.00');
      setQuantity('0');
    }
    setSummary('');
  }, [isOpen, type, parentCode, project]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;

    onConfirm({
      type,
      code: code.trim(),
      summary: summary.trim() || code.trim(),
      unit: type === 'partida' ? unit.trim() : '',
      price: type === 'partida' ? parseFloat(price.replace(',', '.')) || 0 : 0,
      quantity: parseFloat(quantity.replace(',', '.')) || 0,
    });
    onClose();
  };

  const isChapter = type === 'capitulo' || type === 'subcapitulo';
  const labelTipo = type === 'capitulo' ? 'Capítulo' : type === 'subcapitulo' ? 'Subcapítulo' : 'Partida';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
        <div className="bg-slate-900 text-white px-4 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {type === 'capitulo' ? (
              <FolderPlus className="w-4 h-4 text-amber-400" />
            ) : type === 'subcapitulo' ? (
              <FolderPlus className="w-4 h-4 text-indigo-400" />
            ) : (
              <FilePlus className="w-4 h-4 text-emerald-400" />
            )}
            <h3 className="font-semibold text-sm">
              Nuevo {labelTipo}
            </h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-3.5 text-xs text-slate-700">
          <div className="bg-slate-50 p-2 rounded border border-slate-200 text-[11px] text-slate-500">
            Se creará dentro de:{' '}
            <span className="font-mono font-bold text-slate-800">{parentCode}</span>
          </div>

          <div>
            <label className="block font-semibold mb-1">Código único:</label>
            <input
              type="text"
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={isChapter ? 'Ej: 1.01#' : 'Ej: OCV001'}
              className="w-full border border-slate-300 rounded px-2.5 py-1.5 font-mono text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block font-semibold mb-1">Resumen / Designación:</label>
            <input
              type="text"
              required
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Ej. Excavación en zanja para cimentación..."
              className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          {!isChapter && (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block font-semibold mb-1">Unidad (Ud):</label>
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className="w-full border border-slate-300 rounded px-2 py-1.5 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none bg-white font-mono"
                >
                  <option value="ud">ud</option>
                  <option value="m">m</option>
                  <option value="m2">m2</option>
                  <option value="m3">m3</option>
                  <option value="kg">kg</option>
                  <option value="t">t</option>
                  <option value="h">h</option>
                  <option value="pa">pa</option>
                  <option value="km">km</option>
                  <option value="mes">mes</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold mb-1">Precio Unit. (€):</label>
                <input
                  type="text"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="0.00"
                  className="w-full border border-slate-300 rounded px-2 py-1.5 font-mono text-right text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1">Cantidad Inicial:</label>
                <input
                  type="text"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="1.00"
                  className="w-full border border-slate-300 rounded px-2 py-1.5 font-mono text-right text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            </div>
          )}

          <div className="flex justify-end space-x-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-colors shadow-xs"
            >
              Crear {isChapter ? 'Capítulo' : 'Partida'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
