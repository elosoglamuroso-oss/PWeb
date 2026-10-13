export interface FaseCertificacion {
  id: string;
  numero: number;
  nombre: string;
  fecha: string;
  estado: 'abierta' | 'aprobada' | 'cerrada';
  observaciones?: string;
}

export interface LineaMedicion {
  id?: string;
  fase?: string | number; // 0 = Presupuesto, 1, 2, ... = Fases de certificación
  espacio?: string;
  comentario?: string;
  n?: string;
  longitud?: string;
  anchura?: string;
  altura?: string;
  formula?: string;
  cantidad?: number;
}

export interface RelacionEstructura {
  hijoCodigo: string;
  multiplicador: number;
  cantidadBase: number;
  cantidad?: number;
  importe?: number;
  mediciones: LineaMedicion[];
  certificaciones: Record<string | number, LineaMedicion[]>;
  cantidadesCertificadas?: Record<string | number, number>; // direct certified quantity per phase
  notasCertificacion?: Record<string | number, string>;
}

export interface Concepto {
  codigo: string;
  unidad: string;
  resumen: string;
  precio: number;
  fecha?: string;
  tipoBC3?: string; // '0'=normal, etc.
  texto?: string; // ~T descriptive text
  importePresupuestado?: number;
  tipoConcepto?: 'capitulo' | 'subcapitulo' | 'partida';
  esCapitulo?: boolean;
  notasCertificacion?: Record<string | number, string>;
}

export interface VersionBC3 {
  programa: string;
  version: string;
  programaVersion: string;
  encoding: string;
}

export interface ProyectoBC3 {
  conceptos: Record<string, Concepto>;
  estructuras: Record<string, RelacionEstructura[]>;
  codigoRaiz: string | null;
  versionInfo?: VersionBC3 | null;
  fases?: FaseCertificacion[];
  faseActivaId?: string;
}

export interface ImportDiagnostics {
  detectedEncoding: string;
  totalConcepts: number;
  totalRelations: number;
  totalMeasurements: number;
  appliedMeasurements: number;
  orphanedMeasurements: {
    code: string;
    parentCode?: string;
    quantity: number;
    reason: string;
  }[];
  duplicateConcepts: {
    code: string;
    occurrences: number;
  }[];
  unsupportedRecords: {
    type: string;
    count: number;
  }[];
  warnings: string[];
}
