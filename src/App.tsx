import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  Board,
  Camera,
  CanvasObject,
  FileObject,
  FrameObject,
  ImageObject,
  Point,
  ThemePreference,
  ToolOptions,
  ToolType,
} from './types/canvas';
import { FRAME_SWATCHES } from './types/canvas';
import {
  computeCameraToFocusObject,
  computeZoomToFit,
  screenToWorld,
  uid,
  zoomCameraAtPoint,
} from './utils/geometry';
import { getBoardFrames, searchCanvasObjects } from './utils/search';
import {
  cloneObjectsWithOffset,
  createHistory,
  groupObjects,
  pushHistory,
  redoHistory,
  reorderObjectsLayer,
  undoHistory,
  ungroupObjects,
  type HistoryState,
  type LayerAction,
} from './utils/history';
import {
  deleteBoardFromDb,
  getMetaValue,
  loadAllBoards,
  loadThemePref,
  saveBoard,
  saveThemePref,
  setMetaValue,
} from './utils/storage';
import { createBlankBoard, createStarterBoard } from './utils/seedBoard';
import {
  exportBoardAsJson,
  exportBoardAsPng,
  exportBoardAsSvg,
  parseImportedBoardJson,
} from './utils/exportBoard';
import {
  chooseSyncFolder,
  ensureReadWritePermission,
  listVellumFilesInFolder,
  openBoardFromDiskWithPicker,
  readBoardFromFileHandle,
  saveBoardToDisk,
  supportsFileSystemAccess,
  writeBoardToFileHandle,
  type VellumDirectoryHandle,
  type VellumFileHandle,
} from './utils/fileSync';
import { CanvasStage } from './components/CanvasStage';
import { TopBars } from './components/TopBars';
import { Toolbar } from './components/Toolbar';
import { InspectorBar } from './components/InspectorBar';
import { Minimap } from './components/Minimap';
import { FilePreviewModal, ShortcutsModal } from './components/Modals';
import { OfflineIndicator } from './components/PWAControls';
import { FramesPopover, SearchBar } from './components/SearchFramesPanel';

const DEFAULT_TOOL_OPTIONS: ToolOptions = {
  penMode: 'pen',
  penColor: '#0F172A',
  penWidth: 3,
  penSmooth: true,
  textSize: 18,
  textWeight: '500',
  textColor: '#0F172A',
  stickyColor: 'butter',
  shapeKind: 'rectangle',
  shapeFill: '#DBEAFE',
  shapeStroke: '#2563EB',
  shapeStrokeWidth: 2,
  connectorStyle: 'curved',
  connectorStroke: '#2563EB',
  connectorStrokeWidth: 2,
};

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function measureImage(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth || 320, height: img.naturalHeight || 240 });
    img.onerror = () => resolve({ width: 320, height: 240 });
    img.src = src;
  });
}

export default function App() {
  const [boards, setBoards] = useState<Board[]>(() => [createStarterBoard()]);
  const [activeBoardId, setActiveBoardId] = useState<string>('board_studio_overview');
  const [history, setHistory] = useState<HistoryState<CanvasObject[]>>(() =>
    createHistory(createStarterBoard().objects)
  );
  const [hydrated, setHydrated] = useState(false);

  const [activeTool, setActiveTool] = useState<ToolType>('select');
  const [toolOptions, setToolOptions] = useState<ToolOptions>(DEFAULT_TOOL_OPTIONS);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [snapToGrid, setSnapToGrid] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);

  const [themePref, setThemePref] = useState<ThemePreference>(() => loadThemePref());
  const [systemDark, setSystemDark] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
  );

  const [viewportSize, setViewportSize] = useState({ width: 1440, height: 900 });
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchIndex, setSearchIndex] = useState(0);
  const [framesOpen, setFramesOpen] = useState(false);
  const [previewFile, setPreviewFile] = useState<FileObject | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [syncDirHandle, setSyncDirHandle] = useState<VellumDirectoryHandle | null>(null);
  const [folderFiles, setFolderFiles] = useState<Array<{ name: string; handle: VellumFileHandle }>>([]);
  const [autoSaveToDisk, setAutoSaveToDisk] = useState(false);
  const [linkedFileNames, setLinkedFileNames] = useState<Record<string, string>>({});

  const fileSyncSupported = useMemo(() => supportsFileSystemAccess(), []);
  const linkedFileHandlesRef = useRef<Map<string, VellumFileHandle>>(new Map());
  const diskAutoSaveTimerRef = useRef<number | null>(null);
  const vellumOpenInputRef = useRef<HTMLInputElement>(null);

  const clipboardRef = useRef<CanvasObject[]>([]);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const saveTimerRef = useRef<number | null>(null);

  const resolvedDark = themePref === 'dark' || (themePref === 'system' && systemDark);

  const showNotice = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => {
      setToast((curr) => (curr === msg ? null : curr));
    }, 2400);
  }, []);

  // Follow system color scheme & sync .dark class on <html>
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolvedDark);
  }, [resolvedDark]);

  // Hydrate boards from IndexedDB on startup
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = await loadAllBoards();
      if (cancelled) return;
      if (stored.length > 0) {
        const lastId = await getMetaValue<string>('activeBoardId', stored[0].id);
        const chosen = stored.find((b) => b.id === lastId) ?? stored[0];
        setBoards(stored);
        setActiveBoardId(chosen.id);
        setHistory(createHistory(chosen.objects));
      } else {
        const starter = createStarterBoard();
        setBoards([starter]);
        setActiveBoardId(starter.id);
        setHistory(createHistory(starter.objects));
        await saveBoard(starter);
        await setMetaValue('activeBoardId', starter.id);
      }
      // Restore previously chosen File System Access sync folder handle if available
      try {
        const savedDir = await getMetaValue<VellumDirectoryHandle | null>('syncDirHandle', null);
        if (!cancelled && savedDir && savedDir.kind === 'directory') {
          setSyncDirHandle(savedDir);
        }
      } catch {
        // Ignore if browser does not support structured-cloning directory handles
      }
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const activeBoard = useMemo(
    () => boards.find((b) => b.id === activeBoardId) ?? boards[0],
    [boards, activeBoardId]
  );

  // Sync live objects into activeBoard and debounced auto-save to IndexedDB (+ optional linked disk file/folder)
  const persistBoard = useCallback(
    (boardToSave: Board) => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(() => {
        void saveBoard(boardToSave);
      }, 220);

      if (autoSaveToDisk) {
        const linkedFile = linkedFileHandlesRef.current.get(boardToSave.id) ?? null;
        if (linkedFile || syncDirHandle) {
          if (diskAutoSaveTimerRef.current) window.clearTimeout(diskAutoSaveTimerRef.current);
          diskAutoSaveTimerRef.current = window.setTimeout(() => {
            void (async () => {
              if (linkedFile) {
                try {
                  await writeBoardToFileHandle(boardToSave, linkedFile);
                  return;
                } catch {
                  // Ignore silent auto-save failure if permission revoked
                }
              }
              if (syncDirHandle) {
                try {
                  const res = await saveBoardToDisk(boardToSave, null, syncDirHandle);
                  if (res.status === 'saved' && res.fileHandle) {
                    linkedFileHandlesRef.current.set(boardToSave.id, res.fileHandle);
                    setLinkedFileNames((prev) => ({
                      ...prev,
                      [boardToSave.id]: res.fileHandle!.name,
                    }));
                  }
                } catch {
                  // Ignore silent auto-save failure
                }
              }
            })();
          }, 900);
        }
      }
    },
    [autoSaveToDisk, syncDirHandle]
  );

  const syncObjectsToBoard = useCallback(
    (nextObjects: CanvasObject[]) => {
      setBoards((prev) =>
        prev.map((b) => {
          if (b.id !== activeBoardId) return b;
          const updated: Board = { ...b, objects: nextObjects, updatedAt: Date.now() };
          if (hydrated) persistBoard(updated);
          return updated;
        })
      );
    },
    [activeBoardId, hydrated, persistBoard]
  );

  const handleObjectsLiveChange = useCallback(
    (nextObjects: CanvasObject[]) => {
      setHistory((h) => ({ ...h, present: nextObjects }));
      syncObjectsToBoard(nextObjects);
    },
    [syncObjectsToBoard]
  );

  const handleObjectsCommit = useCallback(
    (nextObjects: CanvasObject[]) => {
      setHistory((h) => pushHistory(h, nextObjects));
      syncObjectsToBoard(nextObjects);
    },
    [syncObjectsToBoard]
  );

  const handleCameraChange = useCallback(
    (nextCamera: Camera) => {
      setBoards((prev) =>
        prev.map((b) => {
          if (b.id !== activeBoardId) return b;
          const updated = { ...b, camera: nextCamera };
          if (hydrated) persistBoard(updated);
          return updated;
        })
      );
    },
    [activeBoardId, hydrated, persistBoard]
  );

  const handleUndo = useCallback(() => {
    setHistory((h) => {
      const next = undoHistory(h);
      if (next !== h) syncObjectsToBoard(next.present);
      return next;
    });
    setSelectedIds(new Set());
  }, [syncObjectsToBoard]);

  const handleRedo = useCallback(() => {
    setHistory((h) => {
      const next = redoHistory(h);
      if (next !== h) syncObjectsToBoard(next.present);
      return next;
    });
    setSelectedIds(new Set());
  }, [syncObjectsToBoard]);

  const selectedObjects = useMemo(
    () => history.present.filter((o) => selectedIds.has(o.id)),
    [history.present, selectedIds]
  );

  const handlePatchSelected = useCallback(
    (updater: (obj: CanvasObject) => CanvasObject) => {
      const next = history.present.map((o) => (selectedIds.has(o.id) ? updater(o) : o));
      handleObjectsCommit(next);
    },
    [history.present, selectedIds, handleObjectsCommit]
  );

  const handleDeleteSelected = useCallback(() => {
    if (selectedIds.size === 0) return;
    const next = history.present.filter((o) => !selectedIds.has(o.id));
    handleObjectsCommit(next);
    setSelectedIds(new Set());
  }, [history.present, selectedIds, handleObjectsCommit]);

  const handleDuplicateSelected = useCallback(() => {
    if (selectedObjects.length === 0) return;
    const clones = cloneObjectsWithOffset(selectedObjects, 28, 28);
    handleObjectsCommit([...history.present, ...clones]);
    setSelectedIds(new Set(clones.map((c) => c.id)));
  }, [selectedObjects, history.present, handleObjectsCommit]);

  const handleCopySelected = useCallback(() => {
    if (selectedObjects.length === 0) return;
    clipboardRef.current = selectedObjects.map((o) => structuredClone(o));
    showNotice(`Copied ${selectedObjects.length} item${selectedObjects.length > 1 ? 's' : ''}`);
  }, [selectedObjects, showNotice]);

  const handlePasteClipboard = useCallback(() => {
    if (clipboardRef.current.length === 0) return;
    const clones = cloneObjectsWithOffset(clipboardRef.current, 32, 32);
    clipboardRef.current = clones.map((o) => structuredClone(o));
    handleObjectsCommit([...history.present, ...clones]);
    setSelectedIds(new Set(clones.map((c) => c.id)));
  }, [history.present, handleObjectsCommit]);

  const handleReorderLayer = useCallback(
    (action: LayerAction) => {
      if (selectedIds.size === 0) return;
      const next = reorderObjectsLayer(history.present, selectedIds, action);
      handleObjectsCommit(next);
    },
    [history.present, selectedIds, handleObjectsCommit]
  );

  const handleGroup = useCallback(() => {
    if (selectedIds.size < 2) return;
    handleObjectsCommit(groupObjects(history.present, selectedIds));
  }, [history.present, selectedIds, handleObjectsCommit]);

  const handleUngroup = useCallback(() => {
    if (selectedIds.size === 0) return;
    handleObjectsCommit(ungroupObjects(history.present, selectedIds));
  }, [history.present, selectedIds, handleObjectsCommit]);

  const handleZoomStep = useCallback(
    (factor: number) => {
      const next = zoomCameraAtPoint(
        activeBoard.camera,
        viewportSize.width / 2,
        viewportSize.height / 2,
        activeBoard.camera.zoom * factor
      );
      handleCameraChange(next);
    },
    [activeBoard.camera, viewportSize, handleCameraChange]
  );

  const handleZoomReset = useCallback(() => {
    const next = zoomCameraAtPoint(
      activeBoard.camera,
      viewportSize.width / 2,
      viewportSize.height / 2,
      1
    );
    handleCameraChange(next);
  }, [activeBoard.camera, viewportSize, handleCameraChange]);

  const handleZoomToFit = useCallback(() => {
    const next = computeZoomToFit(history.present, viewportSize.width, viewportSize.height);
    handleCameraChange(next);
  }, [history.present, viewportSize, handleCameraChange]);

  const searchMatches = useMemo(
    () => searchCanvasObjects(history.present, searchQuery),
    [history.present, searchQuery]
  );

  const boardFrames = useMemo(
    () => getBoardFrames(history.present),
    [history.present]
  );

  const focusObjectById = useCallback(
    (objectId: string) => {
      const target = history.present.find((o) => o.id === objectId);
      if (!target) return;
      const nextCam = computeCameraToFocusObject(
        target,
        history.present,
        viewportSize.width,
        viewportSize.height
      );
      handleCameraChange(nextCam);
      setSelectedIds(new Set([target.id]));
    },
    [history.present, viewportSize, handleCameraChange]
  );

  const handleSearchQueryChange = useCallback(
    (q: string) => {
      setSearchQuery(q);
      setSearchIndex(0);
      const nextMatches = searchCanvasObjects(history.present, q);
      if (nextMatches.length > 0) {
        focusObjectById(nextMatches[0].objectId);
      }
    },
    [history.present, focusObjectById]
  );

  const handleSelectSearchMatch = useCallback(
    (index: number) => {
      if (index < 0 || index >= searchMatches.length) return;
      setSearchIndex(index);
      focusObjectById(searchMatches[index].objectId);
    },
    [searchMatches, focusObjectById]
  );

  const handleAddFrame = useCallback(() => {
    const center = screenToWorld(viewportSize.width / 2, viewportSize.height / 2, activeBoard.camera);
    const width = 560;
    const height = 380;
    const swatch = FRAME_SWATCHES[boardFrames.length % FRAME_SWATCHES.length];
    const newFrame: FrameObject = {
      id: uid('frame'),
      type: 'frame',
      x: Math.round(center.x - width / 2),
      y: Math.round(center.y - height / 2),
      width,
      height,
      rotation: 0,
      title: `Section ${boardFrames.length + 1}`,
      background: swatch.bg,
      borderColor: swatch.border,
    };
    handleObjectsCommit([newFrame, ...history.present]);
    setSelectedIds(new Set([newFrame.id]));
    setActiveTool('select');
  }, [viewportSize, activeBoard.camera, boardFrames.length, history.present, handleObjectsCommit]);

  // Insert uploaded, dropped, or pasted files/images onto canvas
  const insertFilesAtPoint = useCallback(
    async (files: FileList | File[], worldOrigin?: Point) => {
      const fileArray = Array.from(files);
      if (fileArray.length === 0) return;

      const basePt =
        worldOrigin ??
        screenToWorld(viewportSize.width / 2, viewportSize.height / 2, activeBoard.camera);
      const added: CanvasObject[] = [];

      for (let i = 0; i < fileArray.length; i++) {
        const file = fileArray[i];
        const dataUrl = await readFileAsDataUrl(file);
        const offset = i * 28;

        if (file.type.startsWith('image/')) {
          const dims = await measureImage(dataUrl);
          const maxDim = 420;
          const scale = Math.min(1, maxDim / Math.max(dims.width, dims.height));
          const w = Math.max(80, Math.round(dims.width * scale));
          const h = Math.max(60, Math.round(dims.height * scale));
          const imgObj: ImageObject = {
            id: uid('img'),
            type: 'image',
            x: basePt.x - w / 2 + offset,
            y: basePt.y - h / 2 + offset,
            width: w,
            height: h,
            rotation: 0,
            src: dataUrl,
            name: file.name || 'Pasted image',
            naturalWidth: dims.width,
            naturalHeight: dims.height,
          };
          added.push(imgObj);
        } else {
          const fileObj: FileObject = {
            id: uid('file'),
            type: 'file',
            x: basePt.x - 140 + offset,
            y: basePt.y - 36 + offset,
            width: 280,
            height: 74,
            rotation: 0,
            name: file.name || 'Attachment',
            mimeType: file.type || 'application/octet-stream',
            size: file.size,
            dataUrl,
          };
          added.push(fileObj);
        }
      }

      if (added.length > 0) {
        handleObjectsCommit([...history.present, ...added]);
        setSelectedIds(new Set(added.map((a) => a.id)));
        setActiveTool('select');
        showNotice(`Added ${added.length} file${added.length > 1 ? 's' : ''}`);
      }
    },
    [viewportSize, activeBoard.camera, history.present, handleObjectsCommit, showNotice]
  );

  // Clipboard paste handler (images from OS clipboard OR internal objects)
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      const items = e.clipboardData?.items;
      if (items) {
        const files: File[] = [];
        for (const item of Array.from(items)) {
          if (item.kind === 'file') {
            const f = item.getAsFile();
            if (f) files.push(f);
          }
        }
        if (files.length > 0) {
          e.preventDefault();
          void insertFilesAtPoint(files);
          return;
        }
      }
      if (clipboardRef.current.length > 0) {
        e.preventDefault();
        handlePasteClipboard();
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [insertFilesAtPoint, handlePasteClipboard]);

  // Global keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inField =
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      if (mod && key === 'f') {
        e.preventDefault();
        setFramesOpen(false);
        setSearchOpen(true);
        return;
      }

      if (mod && key === 's') {
        e.preventDefault();
        void handleSaveVellumFileRef.current();
        return;
      }

      if (e.code === 'Space' && !inField) {
        e.preventDefault();
        setSpaceHeld(true);
        return;
      }

      if (e.key === 'Escape') {
        setShortcutsOpen(false);
        setSearchOpen(false);
        setFramesOpen(false);
        setPreviewFile(null);
        setSelectedIds(new Set());
        setActiveTool('select');
        return;
      }

      if (inField) return;

      if (mod && key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
        return;
      }
      if ((mod && key === 'y') || (mod && key === 'z' && e.shiftKey)) {
        e.preventDefault();
        handleRedo();
        return;
      }
      if (mod && key === 'd') {
        e.preventDefault();
        handleDuplicateSelected();
        return;
      }
      if (mod && key === 'c') {
        if (selectedIds.size > 0) {
          e.preventDefault();
          handleCopySelected();
        }
        return;
      }
      if (mod && key === 'a') {
        e.preventDefault();
        setSelectedIds(new Set(history.present.map((o) => o.id)));
        return;
      }
      if (mod && key === 'g') {
        e.preventDefault();
        if (e.shiftKey) handleUngroup();
        else handleGroup();
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        handleDeleteSelected();
        return;
      }

      if (e.shiftKey && e.key === '!') {
        e.preventDefault();
        handleZoomToFit();
        return;
      }
      if (e.key === '?') {
        e.preventDefault();
        setShortcutsOpen((v) => !v);
        return;
      }
      if (e.key === '0') {
        e.preventDefault();
        handleZoomReset();
        return;
      }
      if (e.key === '=' || e.key === '+') {
        e.preventDefault();
        handleZoomStep(1.2);
        return;
      }
      if (e.key === '-') {
        e.preventDefault();
        handleZoomStep(1 / 1.2);
        return;
      }
      if (e.key === ']') {
        e.preventDefault();
        handleReorderLayer('front');
        return;
      }
      if (e.key === '[') {
        e.preventDefault();
        handleReorderLayer('back');
        return;
      }

      if (!mod && !e.altKey) {
        const toolMap: Record<string, ToolType> = {
          v: 'select',
          h: 'hand',
          p: 'pen',
          t: 'text',
          s: 'sticky',
          r: 'shape',
          a: 'connector',
          f: 'frame',
          c: 'checklist',
          k: 'kanban',
          g: 'chart',
        };
        if (key === 'i') {
          e.preventDefault();
          mediaInputRef.current?.click();
        } else if (toolMap[key]) {
          e.preventDefault();
          setActiveTool(toolMap[key]);
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpaceHeld(false);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [
    handleUndo,
    handleRedo,
    handleDuplicateSelected,
    handleCopySelected,
    handleDeleteSelected,
    handleGroup,
    handleUngroup,
    handleZoomToFit,
    handleZoomReset,
    handleZoomStep,
    handleReorderLayer,
    selectedIds,
    history.present,
  ]);

  // Multi-board management
  const handleSelectBoard = useCallback(
    (id: string) => {
      const target = boards.find((b) => b.id === id);
      if (!target) return;
      setActiveBoardId(target.id);
      setHistory(createHistory(target.objects));
      setSelectedIds(new Set());
      void setMetaValue('activeBoardId', target.id);
    },
    [boards]
  );

  const handleCreateBoard = useCallback(() => {
    const newBoard = createBlankBoard(`Untitled Board ${boards.length + 1}`, uid('board'));
    setBoards((prev) => [newBoard, ...prev]);
    setActiveBoardId(newBoard.id);
    setHistory(createHistory([]));
    setSelectedIds(new Set());
    void saveBoard(newBoard);
    void setMetaValue('activeBoardId', newBoard.id);
  }, [boards.length]);

  const handleRenameBoard = useCallback((id: string, name: string) => {
    setBoards((prev) =>
      prev.map((b) => {
        if (b.id !== id) return b;
        const updated = { ...b, name, updatedAt: Date.now() };
        void saveBoard(updated);
        return updated;
      })
    );
  }, []);

  const handleDeleteBoard = useCallback(
    (id: string) => {
      if (boards.length <= 1) return;
      const remaining = boards.filter((b) => b.id !== id);
      setBoards(remaining);
      void deleteBoardFromDb(id);
      if (activeBoardId === id) {
        const next = remaining[0];
        setActiveBoardId(next.id);
        setHistory(createHistory(next.objects));
        setSelectedIds(new Set());
        void setMetaValue('activeBoardId', next.id);
      }
    },
    [boards, activeBoardId]
  );

  const handleImportJsonFile = useCallback(
    async (file: File) => {
      const text = await file.text();
      const { board, error } = parseImportedBoardJson(text);
      if (error || !board) {
        showNotice(error ?? 'Could not import JSON file');
        return;
      }
      setBoards((prev) => [board, ...prev]);
      setActiveBoardId(board.id);
      setHistory(createHistory(board.objects));
      setSelectedIds(new Set());
      void saveBoard(board);
      void setMetaValue('activeBoardId', board.id);
      showNotice(`Imported "${board.name}"`);
    },
    [showNotice]
  );

  const refreshSyncFolderList = useCallback(async (dir: VellumDirectoryHandle) => {
    try {
      const entries = await listVellumFilesInFolder(dir);
      setFolderFiles(entries);
    } catch {
      setFolderFiles([]);
    }
  }, []);

  const handleSaveVellumFile = useCallback(async () => {
    const snapshot: Board = {
      ...activeBoard,
      objects: history.present,
      updatedAt: Date.now(),
    };
    const linked = linkedFileHandlesRef.current.get(snapshot.id) ?? null;
    const result = await saveBoardToDisk(snapshot, linked, syncDirHandle);
    if (result.status === 'cancelled') return;
    if (result.fileHandle) {
      linkedFileHandlesRef.current.set(snapshot.id, result.fileHandle);
      setLinkedFileNames((prev) => ({ ...prev, [snapshot.id]: result.fileHandle!.name }));
    }
    if (syncDirHandle && result.mode === 'folder') {
      void refreshSyncFolderList(syncDirHandle);
    }
    if (result.mode === 'download') {
      showNotice(`Downloaded ${result.filename}`);
    } else {
      showNotice(`Saved ${result.filename}`);
    }
  }, [activeBoard, history.present, syncDirHandle, refreshSyncFolderList, showNotice]);

  const handleSaveVellumFileRef = useRef(handleSaveVellumFile);
  handleSaveVellumFileRef.current = handleSaveVellumFile;

  const handleOpenVellumFile = useCallback(async () => {
    const res = await openBoardFromDiskWithPicker();
    if (res.status === 'cancelled') return;
    if (res.status === 'fallback') {
      vellumOpenInputRef.current?.click();
      return;
    }
    if (res.status === 'error') {
      showNotice(res.message);
      return;
    }
    linkedFileHandlesRef.current.set(res.board.id, res.fileHandle);
    setLinkedFileNames((prev) => ({ ...prev, [res.board.id]: res.filename }));
    setBoards((prev) => {
      const exists = prev.some((b) => b.id === res.board.id);
      return exists ? prev.map((b) => (b.id === res.board.id ? res.board : b)) : [res.board, ...prev];
    });
    setActiveBoardId(res.board.id);
    setHistory(createHistory(res.board.objects));
    setSelectedIds(new Set());
    void saveBoard(res.board);
    void setMetaValue('activeBoardId', res.board.id);
    showNotice(`Opened ${res.filename}`);
  }, [showNotice]);

  const handleChooseSyncFolder = useCallback(async () => {
    const res = await chooseSyncFolder();
    if (res.status === 'cancelled') return;
    if (res.status === 'unsupported') {
      showNotice(res.reason);
      return;
    }
    setSyncDirHandle(res.handle);
    setAutoSaveToDisk(true);
    try {
      await setMetaValue('syncDirHandle', res.handle);
    } catch {
      // Ignore if IndexedDB cannot clone handle
    }
    await refreshSyncFolderList(res.handle);
    showNotice(`Linked folder "${res.handle.name}"`);
  }, [refreshSyncFolderList, showNotice]);

  const handleOpenFolderFile = useCallback(
    async (filename: string) => {
      const entry = folderFiles.find((f) => f.name === filename);
      if (!entry) return;
      const ok = await ensureReadWritePermission(entry.handle);
      if (!ok) {
        showNotice('Folder read permission was denied');
        return;
      }
      const { board, error } = await readBoardFromFileHandle(entry.handle);
      if (error || !board) {
        showNotice(error ?? `Could not open ${filename}`);
        return;
      }
      linkedFileHandlesRef.current.set(board.id, entry.handle);
      setLinkedFileNames((prev) => ({ ...prev, [board.id]: filename }));
      setBoards((prev) => {
        const exists = prev.some((b) => b.id === board.id);
        return exists ? prev.map((b) => (b.id === board.id ? board : b)) : [board, ...prev];
      });
      setActiveBoardId(board.id);
      setHistory(createHistory(board.objects));
      setSelectedIds(new Set());
      void saveBoard(board);
      void setMetaValue('activeBoardId', board.id);
      showNotice(`Opened ${filename}`);
    },
    [folderFiles, showNotice]
  );

  const handleToggleTheme = useCallback(() => {
    const next: ThemePreference = resolvedDark ? 'light' : 'dark';
    setThemePref(next);
    saveThemePref(next);
  }, [resolvedDark]);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#F7F8FA] dark:bg-[#0F141B]">
      {/* Infinite Canvas Hero */}
      <CanvasStage
        objects={history.present}
        camera={activeBoard.camera}
        activeTool={activeTool}
        toolOptions={toolOptions}
        selectedIds={selectedIds}
        snapToGrid={snapToGrid}
        isDark={resolvedDark}
        spaceHeld={spaceHeld}
        onCameraChange={handleCameraChange}
        onObjectsLiveChange={handleObjectsLiveChange}
        onObjectsCommit={handleObjectsCommit}
        onSelectIds={setSelectedIds}
        onSelectTool={setActiveTool}
        onDropFiles={(files, pt) => void insertFilesAtPoint(files, pt)}
        onPreviewFile={setPreviewFile}
        onViewportResize={setViewportSize}
      />

      {/* Minimalist Floating Chrome */}
      <TopBars
        boards={boards}
        activeBoard={activeBoard}
        onSelectBoard={handleSelectBoard}
        onCreateBoard={handleCreateBoard}
        onRenameBoard={handleRenameBoard}
        onDeleteBoard={handleDeleteBoard}
        canUndo={history.past.length > 0}
        canRedo={history.future.length > 0}
        onUndo={handleUndo}
        onRedo={handleRedo}
        snapToGrid={snapToGrid}
        onToggleSnap={() => setSnapToGrid((s) => !s)}
        themePref={themePref}
        resolvedDark={resolvedDark}
        onCycleTheme={handleToggleTheme}
        onExportPng={() => {
          void exportBoardAsPng({ ...activeBoard, objects: history.present }, resolvedDark);
          showNotice('Exported PNG');
        }}
        onExportSvg={() => {
          exportBoardAsSvg({ ...activeBoard, objects: history.present }, resolvedDark);
          showNotice('Exported SVG');
        }}
        onExportJson={() => {
          exportBoardAsJson({ ...activeBoard, objects: history.present });
          showNotice('Exported JSON');
        }}
        onImportJsonFile={(file) => void handleImportJsonFile(file)}
        onOpenShortcuts={() => setShortcutsOpen(true)}
        onZoomToFit={handleZoomToFit}
        onToggleSearch={() => {
          setFramesOpen(false);
          setSearchOpen((v) => !v);
        }}
        onToggleFrames={() => {
          setSearchOpen(false);
          setFramesOpen((v) => !v);
        }}
        frameCount={boardFrames.length}
        fileSyncSupported={fileSyncSupported}
        syncFolderName={syncDirHandle?.name ?? null}
        linkedFileName={linkedFileNames[activeBoard.id] ?? null}
        autoSaveToDisk={autoSaveToDisk}
        folderFiles={folderFiles.map((f) => f.name)}
        onSaveVellumFile={() => void handleSaveVellumFile()}
        onOpenVellumFile={() => void handleOpenVellumFile()}
        onChooseSyncFolder={() => void handleChooseSyncFolder()}
        onOpenFolderFile={(fname) => void handleOpenFolderFile(fname)}
        onToggleAutoSaveToDisk={() => setAutoSaveToDisk((v) => !v)}
      />

      <SearchBar
        open={searchOpen}
        query={searchQuery}
        matches={searchMatches}
        activeIndex={Math.min(searchIndex, Math.max(0, searchMatches.length - 1))}
        onQueryChange={handleSearchQueryChange}
        onSelectMatch={handleSelectSearchMatch}
        onClose={() => setSearchOpen(false)}
      />

      <FramesPopover
        open={framesOpen}
        frames={boardFrames}
        onJumpToFrame={(frame) => focusObjectById(frame.id)}
        onAddFrame={handleAddFrame}
        onClose={() => setFramesOpen(false)}
      />

      {/* Contextual Selection Inspector */}
      <InspectorBar
        selectedObjects={selectedObjects}
        onPatchSelected={handlePatchSelected}
        onDuplicate={handleDuplicateSelected}
        onDelete={handleDeleteSelected}
        onReorderLayer={handleReorderLayer}
        onGroup={handleGroup}
        onUngroup={handleUngroup}
      />

      {/* Floating Tool Dock */}
      <Toolbar
        activeTool={activeTool}
        onSelectTool={setActiveTool}
        options={toolOptions}
        onChangeOptions={(partial) =>
          setToolOptions((prev) => ({ ...prev, ...partial }))
        }
        onTriggerUpload={() => mediaInputRef.current?.click()}
      />

      {/* Collapsible Minimap & Zoom Controls */}
      <Minimap
        objects={history.present}
        camera={activeBoard.camera}
        viewportSize={viewportSize}
        onSetCamera={handleCameraChange}
        onZoomStep={handleZoomStep}
        onZoomReset={handleZoomReset}
        onZoomToFit={handleZoomToFit}
      />

      {/* Hidden File Input for Image / File Tool */}
      <input
        ref={mediaInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            void insertFilesAtPoint(e.target.files);
          }
          e.target.value = '';
        }}
      />

      {/* Hidden Fallback File Input for Opening .vellum.json on Safari / unsupported browsers */}
      <input
        ref={vellumOpenInputRef}
        type="file"
        accept=".vellum.json,.json,application/json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleImportJsonFile(file);
          e.target.value = '';
        }}
      />

      {/* Quiet transient feedback toast */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-16 left-1/2 -translate-x-1/2 z-40 px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-medium shadow-md pointer-events-none"
        >
          {toast}
        </div>
      )}

      <OfflineIndicator />
      <ShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <FilePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
    </main>
  );
}
