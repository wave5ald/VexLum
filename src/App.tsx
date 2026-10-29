import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Box,
  Bot,
  Camera,
  ChevronDown,
  Diamond,
  FilePlus2,
  Film,
  FolderOpen,
  Globe2,
  HelpCircle,
  Info,
  Layers,
  Loader2,
  MonitorPlay,
  Redo2,
  Save,
  Sparkles,
  Undo2,
  Upload,
  Wand2,
  X
} from 'lucide-react';
import { SceneEngine } from './editor/SceneEngine';
import { EditorMode, GRAPH_ZOOM_MAX, GRAPH_ZOOM_MIN, useEditorStore } from './editor/store';
import { DEFAULT_MATERIAL, ProjectFile, SceneObject, uid } from './editor/types';
import { normalizeProject } from './editor/store';
import {
  arrayBufferToBase64,
  cacheParsedModel,
  loadModelSources,
  MODEL_EXTENSIONS,
  parseModelFile,
  serializeModelSources,
  setModelSource
} from './editor/loaders';
import { openModelFile, openProjectText, rememberRecentProject, saveText, writeTextAt } from './editor/fileIO';
import { Viewport } from './components/Viewport';
import { Outliner } from './components/Outliner';
import { Inspector } from './components/Inspector';
import { Timeline } from './components/Timeline';
import { WelcomeScreen } from './components/WelcomeScreen';
import { ProjectSettings } from './components/ProjectSettings';
import { WorldPanel } from './components/WorldPanel';
import { CurveEditor } from './components/CurveEditor';
import { EffectsPanel } from './components/EffectsPanel';
import { AIChat } from './components/AIChat';
import { RenderPanel } from './components/RenderPanel';
import { ScriptEditor } from './components/ScriptEditor';

const APP_VERSION = '2.2.0';

const DOCK_LABELS: Record<string, string> = {
  timeline: 'Timeline',
  curves: 'Curve Editor',
  effects: 'Effects',
  world: 'World'
};

const DOCK_HEIGHT_MIN = 168;
const DOCK_HEIGHT_MAX = 640;

const IconButton: React.FC<{
  title: string;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  active?: boolean;
}> = ({ title, onClick, children, disabled, active }) => (
  <button
    type="button"
    title={title}
    onClick={onClick}
    disabled={disabled}
    className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors disabled:opacity-35 ${
      active
        ? 'bg-cyan-500/15 text-cyan-300'
        : 'text-[#8b95a5] hover:bg-white/[0.07] hover:text-white'
    }`}
  >
    {children}
  </button>
);

const ModeTab: React.FC<{
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  accent: string;
}> = ({ active, onClick, icon, label, accent }) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex h-8 items-center gap-1.5 rounded-md px-3 text-[11px] font-semibold transition-colors ${
      active ? `${accent} text-white` : 'text-[#7b8595] hover:bg-white/[0.05] hover:text-[#d1d5db]'
    }`}
  >
    {icon}
    {label}
  </button>
);

const SHORTCUTS: Array<{ keys: string[]; action: string }> = [
  { keys: ['W'], action: 'Move tool' },
  { keys: ['E'], action: 'Rotate tool' },
  { keys: ['R'], action: 'Scale tool' },
  { keys: ['F'], action: 'Frame selected object' },
  { keys: ['Space'], action: 'Play / pause timeline' },
  { keys: ['←', '→'], action: 'Step one frame' },
  { keys: ['[', ']'], action: 'Previous / next keyframe' },
  { keys: ['Home', 'End'], action: 'Jump to start / end' },
  { keys: ['K'], action: 'Key transform at playhead' },
  { keys: ['Delete'], action: 'Delete selected keys, else object' },
  { keys: ['Shift', 'Click'], action: 'Add keyframes to selection' },
  { keys: ['Drag'], action: 'Box-select keyframes' },
  { keys: ['Right-click'], action: 'Viewport add menu / select key in graph' },
  { keys: ['Ctrl', 'C'], action: 'Copy graph keys' },
  { keys: ['Ctrl', 'V'], action: 'Paste graph keys at playhead' },
  { keys: ['Drag'], action: 'Pan the curve graph in any direction' },
  { keys: ['Alt', 'Drag'], action: 'Pan the curve graph (or middle-drag)' },
  { keys: ['Drag playhead'], action: 'Scrub time straight from the graph' },
  { keys: ['Drag handle'], action: 'Stretch / bend a bezier handle (ease)' },
  { keys: ['Right-click curve'], action: 'Copy that whole curve' },
  { keys: ['Ctrl', 'V'], action: 'Paste the copied curve at the playhead' },
  { keys: ['Shift', 'Wheel'], action: 'Widen / narrow the graph time axis' },
  { keys: ['Ctrl', 'Wheel'], action: 'Zoom the graph on both axes' },
  { keys: ['Shift', 'Wheel'], action: 'Zoom the timeline' },
  { keys: ['Alt', 'Wheel'], action: 'Pan the timeline left / right when zoomed' },
  { keys: ['Hold', 'Row'], action: 'Drag a timeline row to reorder it' },
  { keys: ['Shift', 'Drag ruler'], action: 'Zoom to a time range' },
  { keys: ['Drag divider'], action: 'Resize the timeline / graph panel' },
  { keys: ['Panel slider'], action: 'Resize the panel (laptop friendly)' },
  { keys: ['Graph slider'], action: 'Widen / narrow the graph from the workspace bar' },
  { keys: ['Ctrl', 'A'], action: 'Select all keyframes (animation)' },
  { keys: ['Ctrl', 'D'], action: 'Duplicate selected object' },
  { keys: ['Ctrl', 'Z'], action: 'Undo' },
  { keys: ['Ctrl', 'Shift', 'Z'], action: 'Redo' },
  { keys: ['Ctrl', 'S'], action: 'Save project' },
  { keys: ['Ctrl', 'O'], action: 'Open project' },
  { keys: ['Ctrl', 'K'], action: 'Project settings' },
  { keys: ['Ctrl', 'I'], action: 'Import 3D model' },
  { keys: ['Ctrl', 'Shift', 'A'], action: 'Open Vexlum Copilot (AI)' },
  { keys: ['Ctrl', 'Shift', 'R'], action: 'Open render studio' },
  { keys: ['Ctrl', '1'], action: 'Scene editor' },
  { keys: ['Ctrl', '2'], action: 'Animation timeline' },
  { keys: ['Ctrl', '3'], action: 'Render studio' },
  { keys: ['?'], action: 'Open this shortcut sheet' },
  { keys: ['Esc'], action: 'Clear keys, then selection / dialogs' }
];

const HelpModal: React.FC = () => {
  const open = useEditorStore((state) => state.showHelp);
  const setOpen = useEditorStore((state) => state.setShowHelp);
  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={() => setOpen(false)}>
      <div
        className="modal max-w-[620px]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#232830] px-5 py-4">
          <div className="flex items-center gap-2">
            <HelpCircle className="h-4 w-4 text-cyan-400" />
            <div>
              <h2 className="text-[14px] font-semibold text-white">Keyboard shortcuts</h2>
              <p className="text-[10px] text-[#6b7280]">Everything is one keystroke away.</p>
            </div>
          </div>
          <button type="button" className="icon-btn" onClick={() => setOpen(false)}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="grid max-h-[62vh] grid-cols-2 gap-x-6 gap-y-1.5 overflow-y-auto p-5">
          {SHORTCUTS.map((item) => (
            <div
              key={`${item.keys.join('+')}-${item.action}`}
              className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-white/[0.03]"
            >
              <span className="text-[11px] text-[#a9b2c0]">{item.action}</span>
              <span className="flex flex-shrink-0 gap-1">
                {item.keys.map((key) => (
                  <kbd key={key}>{key}</kbd>
                ))}
              </span>
            </div>
          ))}
        </div>
        <div className="space-y-1.5 border-t border-[#232830] px-5 py-3 text-[9.5px] leading-relaxed text-[#5f6a78]">
          <p>
            Tip: use the diamond keys in the Inspector to key a single property, or KEY ALL to key
            an entire group. Turn on AUTO-KEY to record viewport transforms while you work.
          </p>
          <p>
            Cameras default to <span className="text-[#9aa4b2]">Look-at</span> aim: rotation follows
            the amber target crosshair, which you can drag in the viewport. Switch the Inspector to{' '}
            <span className="text-[#9aa4b2]">Free</span> to key Rotation X/Y/Z instead.
          </p>
          <p>
            Need geometry from code? Add a <span className="text-[#9aa4b2]">Script object</span> from
            the Outliner + menu, write JavaScript that returns a THREE.Object3D, and press
            Ctrl+Enter to compile.
          </p>
          <p>
            <span className="text-[#9aa4b2]">Nulls</span> are transform-only controls: add one from
            the Outliner + menu, then assign children in the Inspector Hierarchy section. Moving or
            rotating the Null moves everything parented to it. Create Control Null wraps the selected
            object without changing its position.
          </p>
          <p>
            The <span className="text-[#9aa4b2]">Effects</span> tab adds physics (glass, paper,
            sponge, slime) at the playhead plus spin, float, orbit, shake, glow, fade, pulse and
            look-at. Effects are deterministic, so scrubbing and rendered video match.
          </p>
          <p>
            In the <span className="text-[#9aa4b2]">Curve Editor</span>, left-drag diamonds to edit
            values, right-click to select or open the graph menu, and use Ctrl+C / Ctrl+V to copy
            curves between objects. Empty-space clicks never seek or move the graph.
          </p>
        </div>
      </div>
    </div>
  );
};

const AboutModal: React.FC = () => {
  const open = useEditorStore((state) => state.showAbout);
  const setOpen = useEditorStore((state) => state.setShowAbout);
  const [info, setInfo] = useState<{ version: string; electron: string; chrome: string } | null>(null);
  useEffect(() => {
    if (!open) return;
    window.desktop?.info().then(setInfo).catch(() => setInfo(null));
  }, [open]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={() => setOpen(false)}>
      <div
        className="modal max-w-[440px]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="relative overflow-hidden px-6 pb-5 pt-7">
          <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-rose-600/10 blur-3xl" />
          <div className="pointer-events-none absolute -left-20 top-10 h-48 w-48 rounded-full bg-cyan-500/10 blur-3xl" />
          <div className="relative flex items-center gap-3">
            <img
              src="./vexlum-mark.png"
              alt="Vexlum"
              className="h-12 w-12 rounded-xl border border-cyan-500/25 bg-[#0a0d12] object-contain shadow-lg shadow-cyan-950/40"
            />
            <div>
              <h2 className="text-[17px] font-bold tracking-tight text-white">
                VEX<span className="font-light text-[#9aa4b2]">LUM</span>
              </h2>
              <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#6b7280]">
                Scene · Animation · Cinema
              </p>
            </div>
          </div>
          <p className="relative mt-4 text-[11px] leading-relaxed text-[#9aa4b2]">
            A desktop 3D scene editor for building worlds, importing models, animating cameras and
            properties on frame-accurate curves, then rendering cinema-quality video with WebCodecs.
          </p>
          <div className="relative mt-4 grid grid-cols-3 gap-2">
            {[
              ['Version', info?.version || APP_VERSION],
              ['Electron', info?.electron || '—'],
              ['Chromium', info?.chrome ? info.chrome.split('.')[0] + '.x' : '—']
            ].map(([label, value]) => (
              <div key={label} className="rounded-md border border-[#252b33] bg-[#101217] px-2.5 py-2">
                <div className="text-[8px] font-bold uppercase tracking-[0.12em] text-[#5f6a78]">
                  {label}
                </div>
                <div className="mt-0.5 font-mono text-[11px] text-[#d1d5db]">{value}</div>
              </div>
            ))}
          </div>
          <div className="relative mt-5 flex justify-end">
            <button type="button" className="btn btn-accent h-7 px-4 text-[11px]" onClick={() => setOpen(false)}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const engineRef = useRef<SceneEngine | null>(null);
  const [importing, setImporting] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dockHeight, setDockHeight] = useState(292);
  const dockResize = useRef<{ startY: number; startHeight: number } | null>(null);

  const project = useEditorStore((state) => state.project);
  const selectedId = useEditorStore((state) => state.selectedId);
  const mode = useEditorStore((state) => state.mode);
  const dockTab = useEditorStore((state) => state.dockTab);
  const graphZoom = useEditorStore((state) => state.graphZoom);
  const setGraphZoom = useEditorStore((state) => state.setGraphZoom);
  const dirty = useEditorStore((state) => state.dirty);
  const projectPath = useEditorStore((state) => state.projectPath);
  const toast = useEditorStore((state) => state.toast);
  const canUndo = useEditorStore((state) => state.history.length > 0);
  const canRedo = useEditorStore((state) => state.future.length > 0);

  const setMode = useEditorStore((state) => state.setMode);
  const setDockTab = useEditorStore((state) => state.setDockTab);
  const setProjectName = useEditorStore((state) => state.setProjectName);
  const setShowHelp = useEditorStore((state) => state.setShowHelp);
  const setShowAbout = useEditorStore((state) => state.setShowAbout);
  const clearToast = useEditorStore((state) => state.clearToast);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => clearToast(), 3400);
    return () => window.clearTimeout(timer);
  }, [toast, clearToast]);

  useEffect(() => {
    // Tell the Electron main process whether closing needs confirmation. The
    // previous beforeunload guard silently cancelled window close and left the
    // process alive, which is why Task Manager was needed.
    const result = window.desktop?.setDirty(dirty);
    if (result && typeof result.catch === 'function') result.catch(() => undefined);
  }, [dirty]);

  const openMode = useCallback(
    (next: EditorMode) => {
      const state = useEditorStore.getState();
      const leavingRender = state.mode === 'render' && next !== 'render';
      setMode(next);
      if (next === 'render') {
        state.setViewMode('camera');
        state.setPlaying(false);
      } else if (next === 'scene') {
        if (state.dockTab === 'render') setDockTab('timeline');
        if (leavingRender) state.setViewMode('editor');
      } else if (next === 'animation') {
        if (state.dockTab !== 'effects') setDockTab('curves');
        if (leavingRender) state.setViewMode('editor');
      }
    },
    [setMode, setDockTab]
  );

  const handleNew = useCallback(() => {
    setWelcomeOpen(true);
  }, []);

  const handleOpen = useCallback(async (): Promise<boolean> => {
    const state = useEditorStore.getState();
    if (state.dirty && !window.confirm('Discard unsaved changes and open another project?')) return false;
    const file = await openProjectText();
    if (!file) return false;
    try {
      const parsed = JSON.parse(file.text);
      const rawProject = parsed?.project ?? parsed;
      const project = normalizeProject(rawProject);
      if (parsed?.models && typeof parsed.models === 'object') {
        loadModelSources(parsed.models);
      } else {
        loadModelSources({});
      }
      useEditorStore.getState().setProject(project, file.path ?? null);
      useEditorStore.getState().setMode('scene');
      useEditorStore.getState().setViewMode('editor');
      useEditorStore.getState().setDockTab('timeline');
      rememberRecentProject(file.path, project.name);
      useEditorStore.getState().setToast(`Opened ${file.name}`, 'success');
      return true;
    } catch (error: any) {
      useEditorStore.getState().setToast(`Could not open project: ${error?.message || error}`, 'error');
      return false;
    }
  }, []);

  const handleSave = useCallback(async () => {
    const state = useEditorStore.getState();
    const models = serializeModelSources();
    for (const id of Object.keys(models)) {
      if (!state.project.objects.some((object) => object.id === id && object.kind === 'model')) {
        delete models[id];
      }
    }
    const payload: ProjectFile = {
      app: 'vexlum',
      version: 1,
      savedAt: new Date().toISOString(),
      project: state.project,
      models
    };
    const serialized = JSON.stringify(payload, null, 2);
    // Ctrl+S on a project that already has a location writes in place.
    if (state.projectPath && window.desktop?.writeTextAt) {
      const saved = await writeTextAt(state.projectPath, serialized);
      if (saved) {
        useEditorStore.getState().markSaved(state.projectPath);
        rememberRecentProject(state.projectPath, useEditorStore.getState().project.name);
        useEditorStore.getState().setToast('Project saved', 'success');
        return;
      }
    }
    const safeName = state.project.name.replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '') || 'scene';
    const result = await saveText(serialized, `${safeName}.vxl`, [
      { name: 'Vexlum Project', extensions: ['vxl'] },
      { name: 'Monolith Project (legacy)', extensions: ['mstudio'] },
      { name: 'JSON', extensions: ['json'] }
    ]);
    if (result.saved) {
      useEditorStore.getState().markSaved(result.path ?? null);
      rememberRecentProject(result.path, useEditorStore.getState().project.name);
      useEditorStore.getState().setToast('Project saved', 'success');
    }
  }, []);

  const importModelBuffer = useCallback(
    async (fileName: string, ext: string, buffer: ArrayBuffer) => {
      if (importing) return;
      setImporting(true);
      try {
        const parsed = await parseModelFile(buffer, ext, 2.2);
        const id = uid('model');
        const baseName = fileName.replace(/\.[^.]+$/, '') || 'Imported Model';
        const object: SceneObject = {
          id,
          name: baseName,
          kind: 'model',
          // Drop new imports beside the formation rather than in front of the
          // camera, which would eclipse the default shot.
          position: [2.8, 0, 2.0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          visible: true,
          locked: false,
          castShadow: true,
          receiveShadow: true,
          model: { fileName, ext: ext.toLowerCase(), height: 2.2 },
          material: { ...DEFAULT_MATERIAL, color: '#b9bec6', roughness: 0.52, metalness: 0.08 }
        };
        setModelSource(id, arrayBufferToBase64(buffer));
        cacheParsedModel(id, parsed);
        useEditorStore.getState().addObject(object);
        useEditorStore.getState().setToast(`Imported ${fileName}`, 'success');
        if (useEditorStore.getState().mode === 'render') openMode('scene');
      } catch (error: any) {
        useEditorStore.getState().setToast(`Import failed: ${error?.message || error}`, 'error');
      } finally {
        setImporting(false);
      }
    },
    [importing, openMode]
  );

  const handleImport = useCallback(async () => {
    if (importing) return;
    const file = await openModelFile();
    if (!file) return;
    await importModelBuffer(file.name, file.ext, file.buffer);
  }, [importing, importModelBuffer]);

  const handleDrop = useCallback(
    async (event: React.DragEvent) => {
      event.preventDefault();
      setDragActive(false);
      const file = event.dataTransfer.files?.[0];
      if (!file) return;
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      if (ext === 'vxl' || ext === 'mstudio' || ext === 'json') {
        try {
          const parsed = JSON.parse(await file.text());
          const project = normalizeProject(parsed?.project ?? parsed);
          loadModelSources(parsed?.models && typeof parsed.models === 'object' ? parsed.models : {});
          useEditorStore.getState().setProject(project, null);
          openMode('scene');
          useEditorStore.getState().setToast(`Opened ${file.name}`, 'success');
        } catch (error: any) {
          useEditorStore.getState().setToast(`Could not open project: ${error?.message || error}`, 'error');
        }
        return;
      }
      if (!MODEL_EXTENSIONS.includes(ext)) {
        useEditorStore
          .getState()
          .setToast(`Unsupported file ".${ext}". Use GLB, GLTF, OBJ, STL, PLY, FBX or .vxl.`, 'error');
        return;
      }
      await importModelBuffer(file.name, ext, await file.arrayBuffer());
    },
    [importModelBuffer, openMode]
  );

  useEffect(() => {
    if (!window.desktop?.onMenuCommand) return;
    return window.desktop.onMenuCommand(({ command }) => {
      const state = useEditorStore.getState();
      switch (command) {
        case 'new-project':
          handleNew();
          break;
        case 'open-project':
          void handleOpen();
          break;
        case 'save-project':
          void handleSave();
          break;
        case 'project-settings':
          setSettingsOpen(true);
          break;
        case 'open-world':
          openMode('scene');
          state.setDockTab('world');
          break;
        case 'import-model':
          void handleImport();
          break;
        case 'open-render':
          openMode('render');
          break;
        case 'undo':
          state.undo();
          break;
        case 'redo':
          state.redo();
          break;
        case 'mode-scene':
          openMode('scene');
          break;
        case 'mode-animation':
          openMode('animation');
          break;
        case 'add-box':
          state.addPrimitive('box');
          break;
        case 'add-point-light':
          state.addLight('point');
          break;
        case 'add-spot-light':
          state.addLight('spot');
          break;
        case 'toggle-play':
          state.togglePlaying();
          break;
        case 'view-editor':
          state.setViewMode('editor');
          break;
        case 'view-camera':
          state.setViewMode('camera');
          break;
        case 'toggle-grid':
          state.setSettings({ gridVisible: !state.project.settings.gridVisible });
          break;
        case 'show-help':
          state.setShowHelp(true);
          break;
        case 'show-about':
          state.setShowAbout(true);
          break;
        default:
          break;
      }
    });
  }, [handleNew, handleOpen, handleSave, handleImport, openMode]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      const state = useEditorStore.getState();
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();

      if (mod) {
        if (key === 'z') {
          event.preventDefault();
          if (event.shiftKey) state.redo();
          else state.undo();
          return;
        }
        if (key === 'y') {
          event.preventDefault();
          state.redo();
          return;
        }
        if (key === 's') {
          event.preventDefault();
          void handleSave();
          return;
        }
        if (key === 'o') {
          event.preventDefault();
          void handleOpen();
          return;
        }
        if (key === 'n') {
          event.preventDefault();
          handleNew();
          return;
        }
        if (key === 'k') {
          event.preventDefault();
          setSettingsOpen(true);
          return;
        }
        if (key === 'i') {
          event.preventDefault();
          void handleImport();
          return;
        }
        if (key === 'd') {
          event.preventDefault();
          if (state.selectedId) state.duplicateObject(state.selectedId);
          return;
        }
        if (event.shiftKey && key === 'a') {
          event.preventDefault();
          setAiOpen((value) => !value);
          return;
        }
        if (key === 'a' && state.mode === 'animation') {
          event.preventDefault();
          state.selectAllKeys(state.selectedId);
          return;
        }
        if (event.shiftKey && key === 'r') {
          event.preventDefault();
          openMode('render');
          return;
        }
        if (key === '1') {
          event.preventDefault();
          openMode('scene');
          return;
        }
        if (key === '2') {
          event.preventDefault();
          openMode('animation');
          return;
        }
        if (key === '3') {
          event.preventDefault();
          openMode('render');
          return;
        }
        return;
      }

      if (event.altKey) return;

      if (key === 'escape') {
        if (settingsOpen) {
          setSettingsOpen(false);
          return;
        }
        if (aiOpen) {
          setAiOpen(false);
          return;
        }
        if (state.scriptEditorId) {
          state.closeScriptEditor();
        } else if (state.showHelp || state.showAbout) {
          state.setShowHelp(false);
          state.setShowAbout(false);
        } else if (state.selectedKeys.length) {
          state.clearKeySelection();
        } else if (state.selectedId) {
          state.setSelected(null);
        }
        return;
      }
      if (key === '?') {
        event.preventDefault();
        state.setShowHelp(true);
        return;
      }
      if (key === 'k') {
        event.preventDefault();
        if (state.selectedId) state.addTransformKeys(state.selectedId, state.time);
        return;
      }
      if (key === 'home') {
        event.preventDefault();
        state.seek(0);
        return;
      }
      if (key === 'end') {
        event.preventDefault();
        state.seek(state.project.timeline.duration);
        return;
      }
      if (key === '[' || key === ']') {
        event.preventDefault();
        const scoped = state.selectedId
          ? state.project.tracks.filter((track) => track.objectId === state.selectedId)
          : state.project.tracks;
        const times = [...new Set(scoped.flatMap((track) => track.keys.map((item) => item.time)))].sort(
          (a, b) => a - b
        );
        if (!times.length) return;
        const epsilon = 0.001;
        const target =
          key === ']'
            ? times.find((value) => value > state.time + epsilon) ?? state.time
            : [...times].reverse().find((value) => value < state.time - epsilon) ?? state.time;
        state.seek(target);
        return;
      }
      if (key === 'w') {
        state.setTransformMode('translate');
        return;
      }
      if (key === 'e') {
        state.setTransformMode('rotate');
        return;
      }
      if (key === 'r') {
        state.setTransformMode('scale');
        return;
      }
      if (key === 'f') {
        engineRef.current?.focusSelected();
        return;
      }
      if (key === ' ') {
        event.preventDefault();
        state.togglePlaying();
        return;
      }
      if (key === 'arrowleft') {
        event.preventDefault();
        state.seek(state.time - 1 / state.project.timeline.fps);
        return;
      }
      if (key === 'arrowright') {
        event.preventDefault();
        state.seek(state.time + 1 / state.project.timeline.fps);
        return;
      }
      if (key === 'delete' || key === 'backspace') {
        event.preventDefault();
        if (state.selectedKeys.length) {
          state.removeSelectedKeys();
        } else if (state.selectedKey) {
          state.removeKey(state.selectedKey.trackId, state.selectedKey.keyId);
        } else if (state.selectedId) {
          state.removeObject(state.selectedId);
        }
        return;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleNew, handleOpen, handleSave, handleImport, openMode, aiOpen, settingsOpen]);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const current = dockResize.current;
      if (!current) return;
      const next = current.startHeight + (current.startY - event.clientY);
      setDockHeight(Math.max(170, Math.min(560, next)));
    };
    const up = () => {
      dockResize.current = null;
      document.body.style.cursor = '';
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, []);

  const selected = project.objects.find((object) => object.id === selectedId);
  const renderMode = mode === 'render';
  const projectLabel = projectPath
    ? projectPath.split(/[\\/]/).pop() || project.name
    : 'Unsaved project';

  const beginDockResize = (event: React.PointerEvent) => {
    dockResize.current = { startY: event.clientY, startHeight: dockHeight };
    document.body.style.cursor = 'ns-resize';
  };

  const handleDragOver = useCallback((event: React.DragEvent) => {
    if (!event.dataTransfer?.types?.includes('Files')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent) => {
    const next = event.relatedTarget as Node | null;
    if (next && event.currentTarget.contains(next)) return;
    setDragActive(false);
  }, []);

  return (
    <div
      className="relative flex h-full w-full flex-col overflow-hidden bg-[#08090b] text-[#e5e7eb]"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Top bar */}
      <header className="flex h-11 flex-shrink-0 items-center gap-3 border-b border-[#232830] bg-gradient-to-b from-[#14171c] to-[#0d0f13] px-3">
        <div className="flex w-[228px] flex-shrink-0 items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-lg border border-cyan-500/25 bg-[#0a0d12] shadow-md shadow-cyan-950/40">
            <img src="./vexlum-mark.png" alt="Vexlum" className="h-6 w-6 object-contain" />
          </div>
          <div className="leading-none">
            <div className="text-[11px] font-bold tracking-[0.08em] text-white">
              VEX<span className="font-light text-[#8b95a5]">LUM</span>
            </div>
            <div className="mt-1 flex items-center gap-1 font-mono text-[8px] uppercase tracking-[0.12em] text-[#4b5563]">
              {renderMode ? (
                <Film className="h-2.5 w-2.5 text-red-400" />
              ) : mode === 'animation' ? (
                <Diamond className="h-2.5 w-2.5 text-amber-400" />
              ) : (
                <Box className="h-2.5 w-2.5 text-cyan-400" />
              )}
              {renderMode ? 'Cinema Render' : mode === 'animation' ? 'Keyframe Workspace' : 'Scene Workspace'}
            </div>
          </div>
        </div>

        <div className="flex min-w-0 items-center gap-1.5">
          <input
            value={project.name}
            onChange={(event) => setProjectName(event.target.value)}
            spellCheck={false}
            className="h-7 w-[190px] rounded-md border border-transparent bg-transparent px-2 text-[12px] font-medium text-[#dbe2ea] outline-none transition-colors hover:border-[#2a3038] hover:bg-[#11141a] focus:border-cyan-700 focus:bg-[#10171b]"
            title={projectPath || 'Project name'}
          />
          {dirty && <span className="h-1.5 w-1.5 rounded-full bg-amber-400" title="Unsaved changes" />}
          <span className="hidden max-w-[168px] truncate font-mono text-[8.5px] text-[#4b5563] xl:inline">
            {projectLabel}
          </span>
        </div>

        <div className="flex flex-1 items-center justify-center">
          <div className="flex items-center gap-0.5 rounded-lg border border-[#252b33] bg-[#0b0d10] p-0.5">
            <ModeTab
              active={mode === 'scene'}
              onClick={() => openMode('scene')}
              icon={<Box className="h-3.5 w-3.5" />}
              label="Scene"
              accent="bg-cyan-600/25 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.25)]"
            />
            <ModeTab
              active={mode === 'animation'}
              onClick={() => openMode('animation')}
              icon={<Diamond className="h-3.5 w-3.5" />}
              label="Animation"
              accent="bg-amber-600/25 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.25)]"
            />
            <ModeTab
              active={renderMode}
              onClick={() => openMode('render')}
              icon={<Film className="h-3.5 w-3.5" />}
              label="Render"
              accent="bg-rose-600/25 shadow-[inset_0_0_0_1px_rgba(244,63,94,0.3)]"
            />
          </div>
        </div>

        <div className="flex flex-shrink-0 items-center gap-0.5">
          <IconButton title="New project (Ctrl+N)" onClick={handleNew}>
            <FilePlus2 className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton title="Open project (Ctrl+O)" onClick={() => void handleOpen()}>
            <FolderOpen className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton title="Save project (Ctrl+S)" onClick={() => void handleSave()}>
            <Save className="h-3.5 w-3.5" />
          </IconButton>
          <div className="mx-1 h-5 w-px bg-[#2a3038]" />
          <IconButton title="Import 3D model (Ctrl+I)" onClick={() => void handleImport()} disabled={importing}>
            {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" /> : <Upload className="h-3.5 w-3.5" />}
          </IconButton>
          <IconButton title="Undo (Ctrl+Z)" onClick={() => useEditorStore.getState().undo()} disabled={!canUndo}>
            <Undo2 className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton title="Redo (Ctrl+Shift+Z)" onClick={() => useEditorStore.getState().redo()} disabled={!canRedo}>
            <Redo2 className="h-3.5 w-3.5" />
          </IconButton>
          <div className="mx-1 h-5 w-px bg-[#2a3038]" />
          <button
            type="button"
            onClick={() => setAiOpen(true)}
            className={`flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[10px] font-semibold transition-colors ${
              aiOpen
                ? 'border-cyan-500/40 bg-cyan-500/15 text-cyan-200'
                : 'border-[#2a3038] bg-[#15181d] text-[#9aa4b2] hover:border-cyan-500/40 hover:text-cyan-200'
            }`}
            title="Vexlum Copilot (Ctrl+Shift+A)"
          >
            <Bot className="h-3.5 w-3.5" />
            AI
          </button>
          <button
            type="button"
            onClick={() => openMode('render')}
            className={`flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[10px] font-semibold transition-colors ${
              renderMode
                ? 'border-rose-500/40 bg-rose-500/15 text-rose-200'
                : 'border-[#2a3038] bg-[#15181d] text-[#9aa4b2] hover:border-rose-500/40 hover:text-rose-300'
            }`}
            title="Render video (Ctrl+Shift+R)"
          >
            <Film className="h-3 w-3" />
            RENDER
          </button>
          <button
            type="button"
            onClick={() => setShowHelp(true)}
            className="flex h-7 items-center gap-1.5 rounded-md border border-[#2a3038] bg-[#15181d] px-2 text-[10px] font-semibold text-[#9aa4b2] transition-colors hover:border-cyan-500/40 hover:text-cyan-200"
            title="All keyboard shortcuts (?)"
          >
            <HelpCircle className="h-3.5 w-3.5" />
            <span className="hidden xl:inline">Shortcuts</span>
          </button>
          <IconButton title="About Vexlum" onClick={() => setShowAbout(true)}>
            <Info className="h-3.5 w-3.5" />
          </IconButton>
        </div>
      </header>

      {/* Workspace */}
      <div className="flex min-h-0 flex-1">
        {!renderMode && <Outliner onImportModel={() => void handleImport()} />}

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1">
            <Viewport engineRef={engineRef} onImportModel={() => void handleImport()} />
            {renderMode ? (
              <RenderPanel engineRef={engineRef} />
            ) : (
              <Inspector engineRef={engineRef} />
            )}
          </div>

          {!renderMode && (
            <>
              <div
                className="group relative z-20 h-[5px] flex-shrink-0 cursor-ns-resize border-t border-[#232830] bg-[#0b0d10] hover:bg-cyan-500/15"
                onPointerDown={beginDockResize}
                title="Drag to resize the timeline"
              >
                <div className="absolute left-1/2 top-1/2 h-[2px] w-12 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#2a3038] group-hover:bg-cyan-400/70" />
              </div>
              <div style={{ height: dockHeight }} className="flex flex-shrink-0 flex-col bg-[#0c0e11]">
                <div className="flex h-[26px] flex-shrink-0 items-center gap-2 border-b border-[#1d222a] bg-[#090b0e] px-3">
                  <Layers className="h-2.5 w-2.5 text-[#4b5563]" />
                  <span className="font-mono text-[8px] uppercase tracking-[0.14em] text-[#4b5563]">
                    Workspace
                  </span>
                  <span className="text-[9px] font-medium text-[#8b95a5]">
                    {DOCK_LABELS[dockTab] || 'Timeline'}
                  </span>
                  {selected && (
                    <span className="truncate font-mono text-[8.5px] text-[#4b5563]">
                      · {selected.name}
                    </span>
                  )}
                  <div className="ml-auto flex items-center gap-1.5">
                    <div className="hidden items-center gap-1 sm:flex">
                      {[
                        ['Compact', 196],
                        ['Normal', 292],
                        ['Tall', 460]
                      ].map(([label, height]) => (
                        <button
                          key={label}
                          type="button"
                          onClick={() => setDockHeight(height as number)}
                          className={`h-[17px] rounded border px-1.5 text-[8px] font-medium transition-colors ${
                            Math.abs(dockHeight - (height as number)) < 8
                              ? 'border-cyan-500/35 bg-cyan-500/10 text-cyan-200'
                              : 'border-[#232830] bg-[#101217] text-[#6b7280] hover:text-[#cbd5e1]'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    {dockTab === 'curves' && (
                      <div className="flex items-center gap-1.5">
                        <span className="hidden font-mono text-[8px] text-[#4b5563] md:inline">
                          Graph
                        </span>
                        <input
                          type="range"
                          min={GRAPH_ZOOM_MIN}
                          max={GRAPH_ZOOM_MAX}
                          step={0.05}
                          value={graphZoom}
                          onChange={(event) => setGraphZoom(Number(event.target.value))}
                          title="Widen or contract the graph horizontally (same as Shift/Ctrl + wheel)"
                          className="h-1 w-[86px] cursor-ew-resize accent-cyan-400"
                        />
                        <span className="w-8 text-right font-mono text-[8px] text-[#5f6a78]">
                          {graphZoom.toFixed(2)}×
                        </span>
                        <button
                          type="button"
                          onClick={() => setGraphZoom(1)}
                          className="h-[17px] rounded border border-[#232830] bg-[#101217] px-1.5 text-[8px] font-medium text-[#6b7280] hover:text-cyan-200"
                          title="Fit the whole timeline in the graph"
                        >
                          Fit
                        </button>
                      </div>
                    )}
                    <span className="hidden font-mono text-[8px] text-[#4b5563] md:inline">Panel</span>
                    <input
                      type="range"
                      min={DOCK_HEIGHT_MIN}
                      max={DOCK_HEIGHT_MAX}
                      step={4}
                      value={dockHeight}
                      onChange={(event) => setDockHeight(Number(event.target.value))}
                      title="Drag to resize the timeline / graph panel (laptop friendly)"
                      className="h-1 w-[92px] cursor-ns-resize accent-cyan-400"
                    />
                    <span className="w-6 text-right font-mono text-[8px] text-[#5f6a78]">
                      {Math.round(dockHeight)}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setDockHeight((height) =>
                          height > 400 ? 292 : Math.min(DOCK_HEIGHT_MAX, Math.max(420, Math.round(window.innerHeight * 0.55)))
                        )
                      }
                      className="flex h-[17px] w-[17px] items-center justify-center rounded border border-[#232830] bg-[#101217] text-[#6b7280] hover:text-cyan-200"
                      title={dockHeight > 400 ? 'Restore panel height' : 'Expand panel height'}
                    >
                      <ChevronDown
                        className={`h-2.5 w-2.5 transition-transform ${dockHeight > 400 ? 'rotate-180' : ''}`}
                      />
                    </button>
                  </div>
                </div>
                <div className="dock-tabs">
                  <button
                    type="button"
                    onClick={() => setDockTab('timeline')}
                    className={`tab-btn ${dockTab === 'timeline' ? 'active' : ''}`}
                  >
                    <Diamond className="h-3 w-3" />
                    Timeline
                    <span className="font-mono text-[8.5px] text-[#4b5563]">{project.tracks.length}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDockTab('curves')}
                    className={`tab-btn ${dockTab === 'curves' ? 'active' : ''}`}
                  >
                    <Sparkles className="h-3 w-3" />
                    Curve Editor
                  </button>
                  <button
                    type="button"
                    onClick={() => setDockTab('effects')}
                    className={`tab-btn ${dockTab === 'effects' ? 'active' : ''}`}
                  >
                    <Wand2 className="h-3 w-3" />
                    Effects
                    <span className="font-mono text-[8.5px] text-[#4b5563]">
                      {selected?.effects?.length || 0}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDockTab('world')}
                    className={`tab-btn ${dockTab === 'world' ? 'active' : ''}`}
                  >
                    <Globe2 className="h-3 w-3" />
                    World
                  </button>
                  <div className="ml-auto flex items-center gap-2 pr-1">
                    {selected && (
                      <span className="hidden items-center gap-1.5 truncate font-mono text-[9px] text-[#5f6a78] lg:flex">
                        <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
                        {selected.name}
                      </span>
                    )}
                    <div className="flex items-center gap-1 rounded border border-[#232830] bg-[#101217] px-1.5 py-0.5 font-mono text-[8.5px] text-[#5f6a78]">
                      <MonitorPlay className="h-2.5 w-2.5" />
                      {project.video.width}×{project.video.height} · {project.video.fps} fps
                    </div>
                  </div>
                </div>
                <div className="min-h-0 flex-1">
                  {dockTab === 'curves' ? (
                    <CurveEditor />
                  ) : dockTab === 'effects' ? (
                    <EffectsPanel />
                  ) : dockTab === 'world' ? (
                    <WorldPanel />
                  ) : (
                    <Timeline />
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Status strip */}
      <footer className="flex h-6 flex-shrink-0 items-center gap-3 border-t border-[#1d222a] bg-[#0a0c0f] px-3 font-mono text-[8.5px] text-[#4b5563]">
        <span className="flex items-center gap-1 text-[#6b7280]">
          {renderMode ? (
            <Film className="h-2.5 w-2.5 text-rose-400" />
          ) : mode === 'animation' ? (
            <Diamond className="h-2.5 w-2.5 text-amber-400" />
          ) : (
            <Camera className="h-2.5 w-2.5 text-cyan-400" />
          )}
          {renderMode ? 'RENDER STUDIO' : mode === 'animation' ? 'ANIMATION' : 'SCENE'}
        </span>
        <span className="text-[#232830]">|</span>
        <span>{project.objects.length} objects</span>
        <span>{project.tracks.length} curves</span>
        <span>{project.tracks.reduce((total, track) => total + track.keys.length, 0)} keys</span>
        <span className="ml-auto hidden items-center gap-3 md:flex">
          <span>W/E/R transform</span>
          <span>Space play</span>
          <span>Ctrl+Shift+R render</span>
        </span>
        <span className="flex items-center gap-1 text-[#5f6a78]">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              dirty ? 'bg-amber-400' : projectPath ? 'bg-emerald-500/80' : 'bg-[#4b5563]'
            }`}
          />
          {dirty ? 'UNSAVED' : projectPath ? 'SAVED' : 'READY'}
        </span>
      </footer>

      {toast && (
        <div
          key={toast.id}
          className={`animate-fade-in pointer-events-none fixed bottom-9 left-1/2 z-[70] -translate-x-1/2 rounded-lg border px-4 py-2 text-[11px] font-medium shadow-2xl backdrop-blur ${
            toast.tone === 'success'
              ? 'border-emerald-500/40 bg-emerald-950/85 text-emerald-200'
              : toast.tone === 'error'
                ? 'border-red-500/40 bg-red-950/85 text-red-200'
                : 'border-[#39414c] bg-[#11141a]/90 text-[#cbd5e1]'
          }`}
        >
          {toast.text}
        </div>
      )}

      {importing && (
        <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/55 backdrop-blur-sm">
          <div className="flex items-center gap-3 rounded-xl border border-[#2a3038] bg-[#0f1115] px-5 py-4 shadow-2xl">
            <Loader2 className="h-5 w-5 animate-spin text-emerald-400" />
            <div>
              <div className="text-[12px] font-semibold text-white">Importing model…</div>
              <div className="text-[10px] text-[#6b7280]">Parsing geometry and normalizing scale.</div>
            </div>
          </div>
        </div>
      )}

      {dragActive && (
        <div className="pointer-events-none fixed inset-0 z-[68] flex items-center justify-center bg-[#06070a]/70 backdrop-blur-[2px]">
          <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-cyan-400/60 bg-[#0b1015]/85 px-12 py-10 shadow-[0_0_80px_rgba(34,211,238,0.15)]">
            <Upload className="h-7 w-7 text-cyan-300" />
            <div className="text-[13px] font-semibold text-white">Drop to import</div>
            <div className="text-center font-mono text-[9.5px] uppercase tracking-[0.14em] text-[#6b7280]">
              GLB · GLTF · OBJ · STL · PLY · FBX · VXL
            </div>
          </div>
        </div>
      )}

      <HelpModal />
      <AboutModal />
      <ScriptEditor />
      <AIChat open={aiOpen} onClose={() => setAiOpen(false)} />
      <WelcomeScreen
        open={welcomeOpen}
        onClose={() => setWelcomeOpen(false)}
        onOpenProject={handleOpen}
      />
      <ProjectSettings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
};

export default App;
