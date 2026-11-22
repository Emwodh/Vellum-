import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  Download,
  FileImage,
  FileJson,
  FileCode2,
  FolderOpen,
  FolderSync,
  Frame,
  Grid2x2,
  Keyboard,
  Maximize2,
  Moon,
  Pencil,
  Plus,
  Redo2,
  Save,
  Search,
  Sun,
  Trash2,
  Undo2,
  Upload,
} from 'lucide-react';
import type { Board, ThemePreference } from '../types/canvas';
import { PWAInstallButton } from './PWAControls';

interface TopBarsProps {
  boards: Board[];
  activeBoard: Board;
  onSelectBoard: (id: string) => void;
  onCreateBoard: () => void;
  onRenameBoard: (id: string, name: string) => void;
  onDeleteBoard: (id: string) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  snapToGrid: boolean;
  onToggleSnap: () => void;
  themePref: ThemePreference;
  resolvedDark: boolean;
  onCycleTheme: () => void;
  onExportPng: () => void;
  onExportSvg: () => void;
  onExportJson: () => void;
  onImportJsonFile: (file: File) => void;
  onOpenShortcuts: () => void;
  onZoomToFit: () => void;
  onToggleSearch: () => void;
  onToggleFrames: () => void;
  frameCount: number;
  fileSyncSupported: boolean;
  syncFolderName: string | null;
  linkedFileName: string | null;
  autoSaveToDisk: boolean;
  folderFiles: string[];
  onSaveVellumFile: () => void;
  onOpenVellumFile: () => void;
  onChooseSyncFolder: () => void;
  onOpenFolderFile: (filename: string) => void;
  onToggleAutoSaveToDisk: () => void;
}

export const TopBars: React.FC<TopBarsProps> = ({
  boards,
  activeBoard,
  onSelectBoard,
  onCreateBoard,
  onRenameBoard,
  onDeleteBoard,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  snapToGrid,
  onToggleSnap,
  resolvedDark,
  onCycleTheme,
  onExportPng,
  onExportSvg,
  onExportJson,
  onImportJsonFile,
  onOpenShortcuts,
  onZoomToFit,
  onToggleSearch,
  onToggleFrames,
  frameCount,
  fileSyncSupported,
  syncFolderName,
  linkedFileName,
  autoSaveToDisk,
  folderFiles,
  onSaveVellumFile,
  onOpenVellumFile,
  onChooseSyncFolder,
  onOpenFolderFile,
  onToggleAutoSaveToDisk,
}) => {
  const [boardMenuOpen, setBoardMenuOpen] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');

  const boardMenuRef = useRef<HTMLDivElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onDocPointerDown = (e: PointerEvent) => {
      if (boardMenuRef.current && !boardMenuRef.current.contains(e.target as Node)) {
        setBoardMenuOpen(false);
        setRenamingId(null);
      }
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setBoardMenuOpen(false);
        setExportMenuOpen(false);
        setRenamingId(null);
      }
    };
    window.addEventListener('pointerdown', onDocPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onDocPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const commitRename = (id: string) => {
    const trimmed = renameDraft.trim();
    if (trimmed) onRenameBoard(id, trimmed);
    setRenamingId(null);
  };

  return (
    <>
      {/* Top-Left Floating Cluster: Brand + Board Switcher + Undo/Redo */}
      <div className="fixed top-3 left-3 z-30 flex items-center gap-1.5 sm:gap-2 pointer-events-auto max-w-[calc(100vw-180px)] sm:max-w-none">
        <div ref={boardMenuRef} className="relative min-w-0">
          <button
            type="button"
            aria-label="Switch or manage boards"
            aria-expanded={boardMenuOpen}
            onClick={() => {
              setBoardMenuOpen((v) => !v);
              setExportMenuOpen(false);
            }}
            className="h-9 px-2 sm:px-3 rounded-xl bg-white/92 dark:bg-[#161D27]/92 backdrop-blur-md border border-slate-200/90 dark:border-[#263142] shadow-xs flex items-center gap-1 sm:gap-2 text-slate-900 dark:text-slate-100 hover:border-slate-300 dark:hover:border-slate-600 transition-colors max-w-full"
          >
            <span className="hidden sm:inline text-[13px] font-bold tracking-tight text-blue-600 dark:text-blue-400 whitespace-nowrap shrink-0">
              Vellum
            </span>
            <span className="hidden sm:inline text-slate-300 dark:text-slate-600 select-none" aria-hidden="true">
              /
            </span>
            <span className="text-[12px] sm:text-[13px] font-medium truncate max-w-[82px] sm:max-w-[180px]">
              {activeBoard.name}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          </button>

          {boardMenuOpen && (
            <div className="absolute top-11 left-0 w-72 rounded-xl bg-white dark:bg-[#161D27] border border-slate-200 dark:border-[#263142] shadow-lg p-2 z-50">
              <div className="flex items-center justify-between px-2 py-1.5 border-b border-slate-100 dark:border-[#232D3D]">
                <span className="text-[12px] font-semibold text-slate-600 dark:text-slate-300">
                  Boards ({boards.length})
                </span>
                <button
                  type="button"
                  onClick={() => {
                    onCreateBoard();
                    setBoardMenuOpen(false);
                  }}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11.5px] font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors whitespace-nowrap shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  New board
                </button>
              </div>

              <div className="mt-1.5 max-h-64 overflow-y-auto vellum-scroll space-y-0.5">
                {boards.map((b) => {
                  const isActive = b.id === activeBoard.id;
                  const isRenaming = renamingId === b.id;
                  return (
                    <div
                      key={b.id}
                      className={`group flex items-center gap-1.5 px-2 py-1.5 rounded-lg transition-colors ${
                        isActive
                          ? 'bg-blue-50/80 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                          : 'hover:bg-slate-50 dark:hover:bg-[#1E2736] text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      {isRenaming ? (
                        <form
                          className="flex-1 flex items-center gap-1"
                          onSubmit={(e) => {
                            e.preventDefault();
                            commitRename(b.id);
                          }}
                        >
                          <input
                            type="text"
                            autoFocus
                            aria-label="Board name"
                            value={renameDraft}
                            onChange={(e) => setRenameDraft(e.target.value)}
                            onBlur={() => commitRename(b.id)}
                            className="flex-1 min-w-0 px-1.5 py-0.5 text-[12.5px] rounded border border-blue-400 bg-white dark:bg-[#0F141B] text-slate-900 dark:text-slate-100 focus:outline-none"
                          />
                          <button
                            type="submit"
                            aria-label="Confirm rename"
                            className="p-1 text-blue-600"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        </form>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              onSelectBoard(b.id);
                              setBoardMenuOpen(false);
                            }}
                            className="flex-1 min-w-0 text-left"
                          >
                            <div className="text-[12.5px] font-medium truncate">{b.name}</div>
                            <div className="text-[10.5px] text-slate-400 font-mono-tabular">
                              {b.objects.length} items
                            </div>
                          </button>
                          <button
                            type="button"
                            aria-label={`Rename ${b.name}`}
                            onClick={() => {
                              setRenamingId(b.id);
                              setRenameDraft(b.name);
                            }}
                            className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 opacity-70 group-hover:opacity-100"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          {boards.length > 1 && (
                            <button
                              type="button"
                              aria-label={`Delete ${b.name}`}
                              onClick={() => onDeleteBoard(b.id)}
                              className="p-1 rounded text-slate-400 hover:text-red-500 opacity-70 group-hover:opacity-100"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Undo / Redo pill */}
        <div className="h-9 px-1 rounded-xl bg-white/92 dark:bg-[#161D27]/92 backdrop-blur-md border border-slate-200/90 dark:border-[#263142] shadow-xs flex items-center gap-0.5">
          <button
            type="button"
            aria-label="Undo"
            title="Undo (Ctrl+Z)"
            disabled={!canUndo}
            onClick={onUndo}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#1E2736] disabled:opacity-30 disabled:pointer-events-none transition-colors"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            aria-label="Redo"
            title="Redo (Ctrl+Y)"
            disabled={!canRedo}
            onClick={onRedo}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#1E2736] disabled:opacity-30 disabled:pointer-events-none transition-colors"
          >
            <Redo2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Top-Right Floating Cluster: Install, Snap, Export/Import, Theme, Shortcuts */}
      <div className="fixed top-3 right-3 z-30 flex items-center gap-1.5 pointer-events-auto">
        <div className="h-9 px-1 rounded-xl bg-white/92 dark:bg-[#161D27]/92 backdrop-blur-md border border-slate-200/90 dark:border-[#263142] shadow-xs flex items-center gap-0.5">
          <PWAInstallButton />
          <button
            type="button"
            aria-label="Search board text"
            title="Search board (Ctrl+F)"
            onClick={onToggleSearch}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#1E2736] transition-colors"
          >
            <Search className="w-4 h-4" />
          </button>

          <button
            type="button"
            aria-label={`Open frames list (${frameCount})`}
            title={`Frames (${frameCount})`}
            onClick={onToggleFrames}
            className="hidden sm:flex w-7 h-7 rounded-lg items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#1E2736] transition-colors"
          >
            <Frame className="w-4 h-4" />
          </button>

          <button
            type="button"
            aria-label="Zoom to fit on mobile"
            title="Zoom to Fit"
            onClick={onZoomToFit}
            className="flex sm:hidden w-7 h-7 rounded-lg items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#1E2736] transition-colors"
          >
            <Maximize2 className="w-4 h-4" />
          </button>

          <button
            type="button"
            aria-label={snapToGrid ? 'Disable snap to grid' : 'Enable snap to grid'}
            aria-pressed={snapToGrid}
            title={`Snap to Grid (${snapToGrid ? 'On' : 'Off'})`}
            onClick={onToggleSnap}
            className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
              snapToGrid
                ? 'bg-blue-600 text-white'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#1E2736]'
            }`}
          >
            <Grid2x2 className="w-4 h-4" />
          </button>

          <div ref={exportMenuRef} className="relative">
            <button
              type="button"
              aria-label="Export or import board"
              aria-expanded={exportMenuOpen}
              title="Export / Import"
              onClick={() => {
                setExportMenuOpen((v) => !v);
                setBoardMenuOpen(false);
              }}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#1E2736] transition-colors"
            >
              <Download className="w-4 h-4" />
            </button>

            {exportMenuOpen && (
              <div className="absolute top-10 right-0 w-60 rounded-xl bg-white dark:bg-[#161D27] border border-slate-200 dark:border-[#263142] shadow-lg p-1.5 z-50 space-y-0.5">
                <div className="px-2.5 py-1 flex items-center justify-between">
                  <span className="text-[10.5px] font-semibold text-slate-400">
                    File Sync (.vellum.json)
                  </span>
                  {!fileSyncSupported && (
                    <span className="text-[10px] text-slate-400">Fallback</span>
                  )}
                </div>

                <button
                  type="button"
                  data-testid="file-sync-save-btn"
                  onClick={() => {
                    onSaveVellumFile();
                    setExportMenuOpen(false);
                  }}
                  className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-[12.5px] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#1E2736] transition-colors whitespace-nowrap"
                >
                  <span className="inline-flex items-center gap-2 min-w-0">
                    <Save className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                    <span className="truncate">
                      {linkedFileName ? `Save (${linkedFileName})` : 'Save .vellum.json'}
                    </span>
                  </span>
                  <span className="font-mono-tabular text-[10px] text-slate-400 shrink-0">⌘S</span>
                </button>

                <button
                  type="button"
                  data-testid="file-sync-open-btn"
                  onClick={() => {
                    onOpenVellumFile();
                    setExportMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[12.5px] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#1E2736] transition-colors whitespace-nowrap"
                >
                  <FolderOpen className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  Open .vellum.json
                </button>

                <button
                  type="button"
                  data-testid="file-sync-folder-btn"
                  onClick={() => {
                    onChooseSyncFolder();
                    setExportMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[12.5px] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#1E2736] transition-colors whitespace-nowrap"
                >
                  <FolderSync className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="truncate">
                    {syncFolderName ? `Folder: ${syncFolderName}` : 'Choose Sync Folder…'}
                  </span>
                </button>

                {(syncFolderName || linkedFileName) && (
                  <button
                    type="button"
                    onClick={onToggleAutoSaveToDisk}
                    className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[12px] text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#1E2736] transition-colors"
                  >
                    <span>Auto-save to disk</span>
                    <span
                      className={`font-mono-tabular text-[10.5px] font-semibold ${
                        autoSaveToDisk ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'
                      }`}
                    >
                      {autoSaveToDisk ? 'ON' : 'OFF'}
                    </span>
                  </button>
                )}

                {folderFiles.length > 0 && (
                  <div className="pt-1 mt-1 border-t border-slate-100 dark:border-[#232D3D]">
                    <div className="px-2.5 py-0.5 text-[10px] font-medium text-slate-400">
                      Boards in {syncFolderName}
                    </div>
                    <div className="max-h-28 overflow-y-auto vellum-scroll space-y-0.5">
                      {folderFiles.map((fname) => (
                        <button
                          key={fname}
                          type="button"
                          onClick={() => {
                            onOpenFolderFile(fname);
                            setExportMenuOpen(false);
                          }}
                          className="w-full text-left px-2.5 py-1 rounded-md text-[11.5px] text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#1E2736] truncate"
                        >
                          {fname}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="my-1 border-t border-slate-100 dark:border-[#232D3D]" />

                <button
                  type="button"
                  onClick={() => {
                    onExportPng();
                    setExportMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[12.5px] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#1E2736] transition-colors whitespace-nowrap"
                >
                  <FileImage className="w-3.5 h-3.5 text-slate-400" />
                  Export PNG (2x)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onExportSvg();
                    setExportMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[12.5px] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#1E2736] transition-colors whitespace-nowrap"
                >
                  <FileCode2 className="w-3.5 h-3.5 text-slate-400" />
                  Export SVG
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onExportJson();
                    setExportMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[12.5px] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#1E2736] transition-colors whitespace-nowrap"
                >
                  <FileJson className="w-3.5 h-3.5 text-slate-400" />
                  Export JSON
                </button>
                <button
                  type="button"
                  onClick={() => {
                    jsonInputRef.current?.click();
                    setExportMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[12.5px] text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors whitespace-nowrap"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Import JSON
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            aria-label={resolvedDark ? 'Switch to light theme' : 'Switch to dark theme'}
            title={resolvedDark ? 'Light theme' : 'Dark theme'}
            onClick={onCycleTheme}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#1E2736] transition-colors"
          >
            {resolvedDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          <button
            type="button"
            aria-label="Keyboard shortcuts"
            title="Keyboard shortcuts (?)"
            onClick={onOpenShortcuts}
            className="hidden sm:flex w-7 h-7 rounded-lg items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#1E2736] transition-colors"
          >
            <Keyboard className="w-4 h-4" />
          </button>
        </div>

        <input
          ref={jsonInputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onImportJsonFile(file);
            e.target.value = '';
          }}
        />
      </div>
    </>
  );
};
