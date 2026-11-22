import type { Board } from '../types/canvas';
import { parseImportedBoardJson } from './exportBoard';

export interface VellumFileHandle {
  kind: 'file';
  name: string;
  getFile: () => Promise<File>;
  createWritable: () => Promise<{
    write: (data: string) => Promise<void>;
    close: () => Promise<void>;
  }>;
  queryPermission?: (desc?: { mode?: 'read' | 'readwrite' }) => Promise<'granted' | 'denied' | 'prompt'>;
  requestPermission?: (desc?: { mode?: 'read' | 'readwrite' }) => Promise<'granted' | 'denied' | 'prompt'>;
}

export interface VellumDirectoryHandle {
  kind: 'directory';
  name: string;
  getFileHandle: (name: string, options?: { create?: boolean }) => Promise<VellumFileHandle>;
  values: () => AsyncIterable<VellumFileHandle | { kind: string; name: string }>;
  queryPermission?: (desc?: { mode?: 'read' | 'readwrite' }) => Promise<'granted' | 'denied' | 'prompt'>;
  requestPermission?: (desc?: { mode?: 'read' | 'readwrite' }) => Promise<'granted' | 'denied' | 'prompt'>;
}

interface FilePickerWindow {
  showOpenFilePicker?: (options?: unknown) => Promise<VellumFileHandle[]>;
  showSaveFilePicker?: (options?: unknown) => Promise<VellumFileHandle>;
  showDirectoryPicker?: (options?: unknown) => Promise<VellumDirectoryHandle>;
}

/**
 * Produces a clean `.vellum.json` filename from a board name.
 */
export function toVellumFilename(boardName: string): string {
  const slug = boardName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return `${slug || 'vellum-board'}.vellum.json`;
}

export function serializeVellumBoard(board: Board): string {
  return JSON.stringify(
    {
      format: 'vellum-board',
      version: 2,
      exportedAt: new Date().toISOString(),
      board,
    },
    null,
    2
  );
}

export function parseVellumBoard(raw: string): { board: Board | null; error: string | null } {
  return parseImportedBoardJson(raw);
}

export function supportsFileSystemAccess(
  win: unknown = typeof window !== 'undefined' ? window : undefined
): boolean {
  if (!win || typeof win !== 'object') return false;
  const w = win as FilePickerWindow;
  return (
    typeof w.showOpenFilePicker === 'function' &&
    typeof w.showSaveFilePicker === 'function'
  );
}

export function supportsDirectoryPicker(
  win: unknown = typeof window !== 'undefined' ? window : undefined
): boolean {
  if (!win || typeof win !== 'object') return false;
  return typeof (win as FilePickerWindow).showDirectoryPicker === 'function';
}

export async function ensureReadWritePermission(
  handle: VellumFileHandle | VellumDirectoryHandle
): Promise<boolean> {
  try {
    if (typeof handle.queryPermission === 'function') {
      const current = await handle.queryPermission({ mode: 'readwrite' });
      if (current === 'granted') return true;
    }
    if (typeof handle.requestPermission === 'function') {
      const granted = await handle.requestPermission({ mode: 'readwrite' });
      return granted === 'granted';
    }
    return true;
  } catch {
    return false;
  }
}

export function downloadVellumBoardFile(board: Board): string {
  const filename = toVellumFilename(board.name);
  const blob = new Blob([serializeVellumBoard(board)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return filename;
}

export async function chooseSyncFolder(): Promise<
  | { status: 'ok'; handle: VellumDirectoryHandle }
  | { status: 'cancelled' }
  | { status: 'unsupported'; reason: string }
> {
  if (!supportsDirectoryPicker()) {
    return {
      status: 'unsupported',
      reason: 'Folder picker is not supported in this browser; using download/upload fallback.',
    };
  }
  try {
    const w = window as unknown as FilePickerWindow;
    const handle = await w.showDirectoryPicker!({
      id: 'vellum-sync-folder',
      mode: 'readwrite',
    });
    return { status: 'ok', handle };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { status: 'cancelled' };
    }
    return {
      status: 'unsupported',
      reason: 'Folder access blocked in this browser context; using download/upload fallback.',
    };
  }
}

export async function listVellumFilesInFolder(
  dirHandle: VellumDirectoryHandle
): Promise<Array<{ name: string; handle: VellumFileHandle }>> {
  const entries: Array<{ name: string; handle: VellumFileHandle }> = [];
  for await (const entry of dirHandle.values()) {
    if (entry.kind === 'file' && entry.name.endsWith('.vellum.json')) {
      entries.push({ name: entry.name, handle: entry as VellumFileHandle });
    }
  }
  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

export async function writeBoardToFileHandle(
  board: Board,
  fileHandle: VellumFileHandle
): Promise<void> {
  const writable = await fileHandle.createWritable();
  await writable.write(serializeVellumBoard(board));
  await writable.close();
}

export async function readBoardFromFileHandle(
  fileHandle: VellumFileHandle
): Promise<{ board: Board | null; error: string | null }> {
  const file = await fileHandle.getFile();
  const text = await file.text();
  return parseVellumBoard(text);
}

export async function saveBoardToDisk(
  board: Board,
  linkedFileHandle: VellumFileHandle | null,
  linkedDirHandle: VellumDirectoryHandle | null
): Promise<
  | { status: 'saved'; mode: 'file' | 'folder' | 'download'; filename: string; fileHandle?: VellumFileHandle }
  | { status: 'cancelled' }
> {
  const suggestedName = toVellumFilename(board.name);

  // 1. Write in-place to linked file handle if already linked
  if (linkedFileHandle) {
    try {
      const ok = await ensureReadWritePermission(linkedFileHandle);
      if (ok) {
        await writeBoardToFileHandle(board, linkedFileHandle);
        return {
          status: 'saved',
          mode: 'file',
          filename: linkedFileHandle.name,
          fileHandle: linkedFileHandle,
        };
      }
    } catch {
      // Fall through to folder / picker / download
    }
  }

  // 2. Write directly into the user's chosen sync folder
  if (linkedDirHandle) {
    try {
      const ok = await ensureReadWritePermission(linkedDirHandle);
      if (ok) {
        const fileHandle = await linkedDirHandle.getFileHandle(suggestedName, { create: true });
        await writeBoardToFileHandle(board, fileHandle);
        return {
          status: 'saved',
          mode: 'folder',
          filename: `${linkedDirHandle.name}/${suggestedName}`,
          fileHandle,
        };
      }
    } catch {
      // Fall through to picker / download
    }
  }

  // 3. Use native File System Access save picker when available
  if (supportsFileSystemAccess()) {
    try {
      const w = window as unknown as FilePickerWindow;
      const fileHandle = await w.showSaveFilePicker!({
        suggestedName,
        types: [
          {
            description: 'Vellum Board (.vellum.json)',
            accept: { 'application/json': ['.vellum.json', '.json'] },
          },
        ],
      });
      await writeBoardToFileHandle(board, fileHandle);
      return {
        status: 'saved',
        mode: 'file',
        filename: fileHandle.name,
        fileHandle,
      };
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return { status: 'cancelled' };
      }
      // SecurityError (e.g. iframe) or other error -> fall through cleanly to download
    }
  }

  // 4. Universal fallback download (Safari, Firefox, embedded iframe)
  const filename = downloadVellumBoardFile(board);
  return { status: 'saved', mode: 'download', filename };
}

export async function openBoardFromDiskWithPicker(): Promise<
  | { status: 'opened'; board: Board; fileHandle: VellumFileHandle; filename: string }
  | { status: 'cancelled' }
  | { status: 'error'; message: string }
  | { status: 'fallback' }
> {
  if (!supportsFileSystemAccess()) {
    return { status: 'fallback' };
  }
  try {
    const w = window as unknown as FilePickerWindow;
    const [fileHandle] = await w.showOpenFilePicker!({
      multiple: false,
      types: [
        {
          description: 'Vellum Board (.vellum.json)',
          accept: { 'application/json': ['.vellum.json', '.json'] },
        },
      ],
    });
    if (!fileHandle) return { status: 'cancelled' };
    const { board, error } = await readBoardFromFileHandle(fileHandle);
    if (error || !board) {
      return { status: 'error', message: error ?? 'Could not parse board file.' };
    }
    return { status: 'opened', board, fileHandle, filename: fileHandle.name };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { status: 'cancelled' };
    }
    return { status: 'fallback' };
  }
}
