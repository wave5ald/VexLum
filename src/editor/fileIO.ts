import { MODEL_EXTENSIONS } from '../editor/loaders';

export function isDesktop(): boolean {
  return Boolean(window.desktop?.isDesktop);
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export function downloadText(text: string, fileName: string, mime = 'application/json'): void {
  downloadBlob(new Blob([text], { type: mime }), fileName);
}

export async function saveBlob(
  blob: Blob,
  defaultName: string,
  filters?: Array<{ name: string; extensions: string[] }>
): Promise<{ saved: boolean; path?: string }> {
  if (window.desktop) {
    const buffer = await blob.arrayBuffer();
    const result = await window.desktop.saveBinary(buffer, defaultName, filters);
    return { saved: Boolean(result.ok), path: result.filePath };
  }
  downloadBlob(blob, defaultName);
  return { saved: true };
}

export async function saveText(
  text: string,
  defaultName: string,
  filters?: Array<{ name: string; extensions: string[] }>
): Promise<{ saved: boolean; path?: string }> {
  if (window.desktop) {
    const result = await window.desktop.saveText(text, defaultName, filters);
    return { saved: Boolean(result.ok), path: result.filePath };
  }
  downloadText(text, defaultName, 'application/json');
  return { saved: true };
}

export async function openProjectText(): Promise<{ name: string; text: string; path?: string } | null> {
  if (window.desktop) {
    const result = await window.desktop.openText('Open Vexlum Project', [
      { name: 'Vexlum Project', extensions: ['vxl', 'mstudio', 'json'] }
    ]);
    if (!result.ok || !result.text) return null;
    return { name: result.name || 'project.vxl', text: result.text, path: result.filePath };
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.vxl,.mstudio,.json,application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      resolve({ name: file.name, text: await file.text() });
    };
    input.click();
  });
}

export async function pickProjectFolder(): Promise<string | null> {
  if (!window.desktop?.pickFolder) return null;
  const result = await window.desktop.pickFolder('Choose a folder for Vexlum projects');
  return result.ok && result.folderPath ? result.folderPath : null;
}

export async function readTextAt(filePath: string): Promise<string | null> {
  if (!window.desktop?.readTextAt) return null;
  const result = await window.desktop.readTextAt(filePath);
  return result.ok && typeof result.text === 'string' ? result.text : null;
}

export async function writeTextAt(filePath: string, text: string): Promise<boolean> {
  if (!window.desktop?.writeTextAt) return false;
  const result = await window.desktop.writeTextAt(filePath, text);
  return Boolean(result.ok);
}

export function joinPath(folder: string, fileName: string): string {
  if (!folder) return fileName;
  const separator = folder.includes('\\') ? '\\' : '/';
  return `${folder.replace(/[\\/]+$/, '')}${separator}${fileName}`;
}

export function safeProjectFileName(name: string): string {
  const safe = name
    .replace(/[^a-z0-9-_ ]+/gi, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${safe || 'untitled'}.vxl`;
}

export interface RecentProject {
  path: string;
  name: string;
  updatedAt: number;
}

const RECENT_KEY = 'vexlum.recent.v1';

export function getRecentProjects(): RecentProject[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item.path === 'string' && typeof item.name === 'string')
      .map((item) => ({
        path: String(item.path),
        name: String(item.name),
        updatedAt: Number(item.updatedAt) || 0
      }))
      .slice(0, 12);
  } catch {
    return [];
  }
}

export function rememberRecentProject(path: string | null | undefined, name: string): void {
  if (!path) return;
  try {
    const entry: RecentProject = {
      path,
      name: name || path.split(/[\\/]/).pop() || 'Project',
      updatedAt: Date.now()
    };
    const next = [entry, ...getRecentProjects().filter((item) => item.path !== path)].slice(0, 12);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Storage may be disabled; recents are a convenience only.
  }
}


export async function openModelFile(): Promise<{
  name: string;
  ext: string;
  buffer: ArrayBuffer;
} | null> {
  if (window.desktop) {
    const result = await window.desktop.openBinary('Import 3D Model', [
      { name: '3D Models', extensions: MODEL_EXTENSIONS },
      { name: 'All Files', extensions: ['*'] }
    ]);
    if (!result.ok || !result.data) return null;
    return {
      name: result.name || 'model.glb',
      ext: result.ext || '',
      buffer: result.data
    };
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = MODEL_EXTENSIONS.map((ext) => `.${ext}`).join(',');
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      resolve({
        name: file.name,
        ext: file.name.split('.').pop()?.toLowerCase() || '',
        buffer: await file.arrayBuffer()
      });
    };
    input.click();
  });
}
