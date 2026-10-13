# PrestoWeb — P0 Critical Fixes & Foundational P1 Reliability Architecture

Implementation plan to resolve critical data corruption, performance bottlenecks, and parsing inaccuracies in PrestoWeb, establishing a resilient Web Worker parsing pipeline, non-destructive data model, IndexedDB persistence, cycle-safe tree operations, and detailed import diagnostics.

---

### User Review & Critical Decisions

> [!IMPORTANT]
> The implementation scope prioritizes all **P0 Critical items** and foundational **P1 format reliability items**, honoring the user's confirmed choices:
> - **Execution Scope**: All P0 items (1–10) + foundational P1 items (11–15: incremental parsing, composite item typing, import diagnostics modal, validation safeguards, file limits).
> - **Import Diagnostics**: Auto-showing diagnostic modal displaying parsed counts, detected encoding, applied/orphaned measurements, duplicate concepts, and warnings log.
> - **Persistence**: IndexedDB database (`PrestoWebDB`) with transparent autosave debounce and recovery of the latest active project on page reload.

- **Confirmed Decision 1**: Parse BC3 files asynchronously off the main thread via a dedicated Web Worker (`bc3Worker.ts`), with real-time progress events and graceful fallback if Web Workers are unavailable.
- **Confirmed Decision 2**: Replace rigid `windows-1252` reading with `ArrayBuffer` analysis detecting UTF-8 (BOM or multi-byte validity), UTF-16 LE/BE, and ANSI / windows-1252 fallback.
- **Confirmed Decision 3**: Preserve trailing `#` characters in BC3 codes (e.g. differentiating `01#` from `01`), matching the official FIEBDC-3/2020 standard.
- **Confirmed Decision 4**: Enforce strict parent-child relationship mapping for `~M` measurement records, preventing cross-parent misassignment and recording orphaned measurements in the diagnostics log.
- **Confirmed Decision 5**: Store active budget projects in IndexedDB with an autosave debounced writer (1.5s), eliminating data loss on refresh while supporting multi-megabyte BC3 databases.

---

## 1. Overview & Core Concept

### What It Does
PrestoWeb is a high-performance web-based construction budgeting and certification tool compatible with the FIEBDC-3 (BC3) format and Microsoft Excel. This release eliminates UI-freezing file loads, data loss during concept merges and imports, cyclic tree recursions, and broken subtree pastes, while adding transparent IndexedDB auto-recovery and a comprehensive import diagnostic report.

### Target Audience & Persona
- **Cost Estimators & Quantity Surveyors (Aparejadores & Arquitectos Técnicos)**: Working with large FIEBDC-3 files (hundreds or thousands of partidas and measurement breakdown lines) requiring exact decimal fidelity and fast navigation.
- **Project Managers & Contractors**: Reviewing work certifications and chapter hierarchies without risking corrupted relations or lost measurement formulas.

### Key Value
- **Zero-Freeze File Handling**: 10MB+ BC3 files load smoothly in background worker threads with progress feedback.
- **FIEBDC Integrity**: Strict adherence to FIEBDC-3/2020 specifications: codes with `#` are preserved, multi-parent items receive their exact respective measurements, and empty fields never overwrite existing valid prices.
- **Work Preservation**: Real IndexedDB autosave ensures that browser refreshes or accidental tab closures never erase hours of work.

---

## 2. User Experience & Visual Design

### Key User Flows
1. **Opening a BC3 File**:
   - User drags or selects a `.bc3` / `.fie` file.
   - UI displays a clean modal progress indicator: `Leyendo archivo...` $\rightarrow$ `Detección de codificación` $\rightarrow$ `Analizando registros (X / Y)`.
   - On completion, the **Import Diagnostics Modal** automatically opens, providing high-level counts (concepts, relations, applied measurements) and an expandable warnings list (orphaned records, merged duplicates).
   - User clicks **"Abrir Presupuesto"** to enter the workspace, or reviews detailed warnings.
2. **Editing & Automatic Persistence**:
   - User navigates chapters, edits quantities, unit prices, or measurement lines in the high-density grid.
   - Status header quietly indicates autosave status (`Guardado en navegador` with timestamp) without disruptive flash.
   - On page refresh, the application seamlessly restores the last edited project and active node position.
3. **Copying / Pasting Chapters & Subtrees**:
   - User copies or cuts a chapter, navigates to another node, and pastes.
   - If pasted into the same parent or if code conflicts exist, a new unique code is assigned (`CAP01_C1`).
   - The entire subtree (`subConceptos` and `subEstructuras`) is recursively remapped to link to the new root and child codes without breaking relationships.
   - If a user attempts to paste a parent into one of its own descendants, the system rejects the operation and displays a toast explaining the cyclic recursion prevention.

### Visual Identity & Theme
- **Theme**: Clean, enterprise utilitarian light/dark workspace adhering strictly to the `SaaS & Dashboard` guidelines.
- **Colors**:
  - Dominant Canvas: Crisp neutral white (`#FFFFFF`) / Slate 950 (`#020617`).
  - Structural Surfaces: Neutral slate borders (`#E2E8F0` / `#1E293B`) with single-elevation cards.
  - Accent: High-intent Indigo/Blue (`#2563EB`) strictly for active navigation, action buttons, and focus rings.
  - Semantic Status: Emerald (`#16A34A`) for valid saved states, Amber (`#D97706`) for orphan warnings, Rose (`#DC2626`) for cyclic recursion prevention.
- **Typography**: `Plus Jakarta Sans` for clean UI chrome and headings; `font-mono tabular-nums` for all quantities, prices, line dimensions, and BC3 codes.
- **Zero-Pill Discipline**: Unboxed metadata text with typographic middle dots (`·`) instead of colored capsule tags.

---

## 3. Key Product Decisions & Trade-Offs

| Decision | Chosen Approach | Why | Alternatives Considered |
| :--- | :--- | :--- | :--- |
| **Worker vs Main Thread** | Web Worker via Blob URL / Vite worker import | Prevents blocking the DOM event loop and browser UI freeze during large file parsing. | Main thread `requestIdleCallback` (still lags during heavy GC). |
| **Encoding Detection** | Buffer inspection: UTF-8 BOM, UTF-8 byte sequence validator, UTF-16 detection, fallback to Windows-1252 | Guarantees correct accents (`ó`, `á`, `ñ`, `m²`, `m³`) across diverse BC3 software exports (Presto, Arquímedes, Menphis). | Forcing `windows-1252` (corrupts modern UTF-8 BC3) or native `TextDecoder` without fallback. |
| **NormCode Strategy** | Clean whitespace only; preserve `#` suffixes (`c.trim()`) | Suffix `#` designates root or special hierarchy in FIEBDC. Stripping it causes collisions (`01#` vs `01`). | Removing `#` conditionally (unreliable). |
| **Measurement Mapping** | Exact parent-child relation matching via FIEBDC hierarchy paths; orphan logging | Prevents placing measurements onto the wrong instance of a shared concept in multi-chapter budgets. | First-match lookup (causes silent cross-chapter corruption). |
| **Persistence Storage** | IndexedDB with dedicated `PrestoWeb_DB` database | Supports tens of megabytes of structured JSON without blocking UI and avoids the 5MB `localStorage` limit. | `localStorage` (throws QuotaExceeded on large BC3) or pure in-memory (loses work on refresh). |
| **Subtree Remapping** | Recursive ID/code remap dictionary during paste | Ensures all descendant relations point to their newly cloned parent and child codes. | Shallow pointer copy (orphans subchapters when parent is renamed). |
| **Cycle Protection** | Depth-first traversal cycle detector (`isDescendant(parent, target)`) | Prevents infinite loop freezes in tree rendering and budget recalculation. | Arbitrary max-depth cutoff (fragile in deep hierarchies). |

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

### System Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              PrestoWeb UI Shell                              │
│                                                                              │
│  ┌───────────────────────┐  ┌──────────────────────────────────────────────┐ │
│  │   ProjectTreeSidebar  │  │                  BudgetTable                 │ │
│  │  (Cycle-safe Tree)    │  │       (Tabular high-density data grid)       │ │
│  └──────────┬────────────┘  └──────────────────────┬───────────────────────┘ │
│             │                                      │                         │
│             ▼                                      ▼                         │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │                      App State & Workspace Coordinator                  │ │
│  │     (Project State, Navigation Node, Active Phase, Clipboard)           │ │
│  └───────┬───────────────────────────┬─────────────────────────────┬───────┘ │
└──────────┼───────────────────────────┼─────────────────────────────┼─────────┘
           │                           │                             │
           ▼                           ▼                             ▼
┌──────────────────────┐   ┌───────────────────────┐   ┌───────────────────────┐
│     IndexedDB        │   │       BC3 Parser      │   │   Import Diagnostic   │
│    Persistence       │   │       Web Worker      │   │         Modal         │
│                      │   │                       │   │                       │
│ • Autosave (1.5s deb)│   │ • ArrayBuffer read    │   │ • Total concepts      │
│ • Project recovery   │   │ • Encoding auto-detect│   │ • Applied vs orphans  │
│ • Safe project cache │   │ • Incremental parser  │   │ • Collapsible log     │
│ • Quota protection   │   │ • Progress emission   │   │ • Replacement preview │
└──────────────────────┘   └───────────────────────┘   └───────────────────────┘
```

### Data Pipeline & Record Handling Details

#### 1. Encoding Detection & Web Worker Pipeline
- `detectEncoding(buffer: ArrayBuffer): { encoding: string, text: string }`
  - Check for UTF-8 BOM (`EF BB BF`), UTF-16 LE (`FF FE`), UTF-16 BE (`FE FF`).
  - Attempt `TextDecoder('utf-8', { fatal: true })`. If valid, accept UTF-8.
  - Fallback to `windows-1252` (`ISO-8859-1` compatible for Spanish construction accents).
- Worker sends periodic progress messages `{ type: 'progress', percent: number, stage: string }` and finishes with `{ type: 'success', project: ProyectoBC3, diagnostics: ImportDiagnostics }`.

#### 2. Import Diagnostics Object
```typescript
export interface ImportDiagnostics {
  detectedEncoding: string;
  totalConcepts: number;
  totalRelations: number;
  totalMeasurements: number;
  appliedMeasurements: number;
  orphanedMeasurements: { code: string; parentCode?: string; quantity: number }[];
  duplicateConcepts: { code: string; occurrences: number }[];
  unsupportedRecords: { type: string; count: number }[];
}
```

#### 3. Exact Parent-Child Measurement Assignment (~M)
FIEBDC format for ~M:
`~M|[codPadre\]codPartida|tipoMedicion|totalCant|sublines...`
- When `codPadre` is specified, search **only** in `estructuras[codPadre]` for `rel.hijoCodigo === codPartida`.
- If `codPadre` is not in the line, match only if `codPartida` has exactly one parent in the entire project. If it has multiple parents and the record does not specify the parent, record as ambiguous/orphaned rather than blindly assigning to the first one found.
- Non-matching measurements are collected into `diagnostics.orphanedMeasurements` for user review.

#### 4. Non-Destructive ~C Merge
- When parsing `~C` records:
  - Unit (`unidad`): update only if `fields[1]` is non-empty.
  - Summary (`resumen`): update only if `fields[2]` is non-empty.
  - Price (`precio`): parse `fields[3]`. Only update existing concept price if `fields[3]` was explicitly provided (`parseNumber(fields[3]) !== null`). Empty fields must **never** overwrite an existing price with 0.

#### 5. Concept Type Differentiation (Partida Compuesta vs Capítulo)
- In FIEBDC:
  - If a concept has children, inspect its children: if children are resources (materials `%`, mano de obra `O`, maquinaria `M`, etc.) or if the parent has an explicit unit and unit price, it is a **partida compuesta / descompuesto**, not a chapter!
  - Only concepts without units or explicitly marked as chapters (`tipoBC3 === '1'` or children are other partidas) are treated as chapters (`tipoConcepto: 'capitulo' | 'subcapitulo'`).

#### 6. IndexedDB Persistence Architecture
- Create `src/utils/dbStorage.ts` utilizing native IndexedDB:
  - Database: `PrestoWeb_DB`, Store: `active_project`.
  - Keys: `current_project`, `saved_at`, `project_meta`.
  - Auto-load on mount in `App.tsx` if present; if empty, initialize empty project without clearing storage.
  - Autosave triggered with a 1500ms debounce on all project modifications.

#### 7. Cycle Prevention & Subtree Remap on Paste
- `checkHasCycle(parentCode: string, childCode: string, estructuras: Record<string, RelacionEstructura[]>): boolean`
  - Rejects pasting or moving if `childCode === parentCode` or if `parentCode` is reachable as a descendant of `childCode`.
- Subtree clone with remapping:
  - Maintain a code dictionary `oldCode -> newCode`.
  - Recursively generate unique codes for copied parents and descendants when renaming is required.
  - Update all children references in `subEstructuras` so the tree remains structurally intact.

---

### Implementation Phasing & Task Checklist

#### Phase 1: Core Parsing & Model Integrity (P0 Items 1, 2, 3, 4, 5, 6)
- [ ] Create `src/utils/encodingDetector.ts` with ArrayBuffer BOM and UTF-8 / Windows-1252 validation.
- [ ] Update `src/utils/bc3Parser.ts`:
  - [ ] Fix `normCode` to preserve trailing `#`.
  - [ ] Rewrite ~C merger to prevent blank prices overwriting valid prices.
  - [ ] Rewrite ~M measurement handler with exact parent-child matching and orphan tracking.
  - [ ] Add `ImportDiagnostics` return type.
  - [ ] Implement incremental token/line scanner for robust record parsing (P1 Item 11).
  - [ ] Implement `getConceptType` distinguishing composite partidas from chapters (P1 Item 12).
- [ ] Create Web Worker in `src/workers/bc3Worker.ts` and worker client in `src/utils/bc3WorkerClient.ts`.

#### Phase 2: Persistence & Safe State (P0 Items 7, 8, 9, 10 + P1 Item 14)
- [ ] Implement `src/utils/dbStorage.ts` for IndexedDB project storage.
- [ ] Update `App.tsx`:
  - [ ] Remove destructive `localStorage.removeItem` on mount.
  - [ ] Add initial project restore from IndexedDB.
  - [ ] Add debounced autosave effect saving project to IndexedDB.
  - [ ] Implement cycle detection in `handlePasteConcept` and node tree insertion.
  - [ ] Fix subtree cloning and code remapping when pasting duplicated/renamed chapters.
  - [ ] Validate project integrity before replacing current project state (P1 Item 14).

#### Phase 3: Diagnostic UI & User Experience (P1 Items 13, 15)
- [ ] Create `src/components/ImportDiagnosticsModal.tsx` displaying:
  - [ ] Encoding detected, concepts loaded, relations loaded, measurements applied.
  - [ ] Expandable alerts for orphaned measurements and duplicate concepts.
  - [ ] Primary action button to confirm and proceed to workspace.
- [ ] Add loading progress overlay in `Header.tsx` / `App.tsx` during worker parsing.
- [ ] Verify build and TypeScript compilation (`npm run lint` / `compile_applet`).
