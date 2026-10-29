import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Clock3,
  FolderOpen,
  FolderPlus,
  Loader2,
  Plus,
  Sparkles,
  X
} from 'lucide-react';
import { useEditorStore } from '../editor/store';
import { normalizeProject } from '../editor/store';
import { ProjectFile } from '../editor/types';
import { loadModelSources } from '../editor/loaders';
import {
  getRecentProjects,
  joinPath,
  pickProjectFolder,
  readTextAt,
  RecentProject,
  rememberRecentProject,
  safeProjectFileName,
  writeTextAt
} from '../editor/fileIO';

interface WelcomeScreenProps {
  open: boolean;
  onClose: () => void;
  onOpenProject: () => Promise<boolean>;
}

const DURATIONS = [
  { label: '30 sec', value: 30 },
  { label: '1 min', value: 60 },
  { label: '5 min', value: 300 },
  { label: '10 min', value: 600 },
  { label: '30 min', value: 1800 },
  { label: 'Custom', value: 0 }
];

const FPS_OPTIONS = [24, 30, 60];

const LAST_FOLDER_KEY = 'vexlum.lastFolder.v1';

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ open, onClose, onOpenProject }) => {
  const [name, setName] = useState('Untitled Project');
  const [durationChoice, setDurationChoice] = useState(60);
  const [customDuration, setCustomDuration] = useState(120);
  const [fps, setFps] = useState(30);
  const [folder, setFolder] = useState('');
  const [recent, setRecent] = useState<RecentProject[]>([]);
  const [busy, setBusy] = useState<'create' | 'open' | 'recent' | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setRecent(getRecentProjects());
    try {
      setFolder(localStorage.getItem(LAST_FOLDER_KEY) || '');
    } catch {
      setFolder('');
    }
    const state = useEditorStore.getState();
    if (!state.dirty && state.project.objects.length) {
      setName(state.project.name === 'Vexlum — 9 Mannequins' ? 'Untitled Project' : state.project.name);
    }
  }, [open]);

  const duration = durationChoice || customDuration;
  const fileName = useMemo(() => safeProjectFileName(name), [name]);
  const targetPath = folder ? joinPath(folder, fileName) : '';

  const chooseFolder = async () => {
    const picked = await pickProjectFolder();
    if (!picked) return;
    setFolder(picked);
    try {
      localStorage.setItem(LAST_FOLDER_KEY, picked);
    } catch {
      // ignore
    }
  };

  const createProject = async () => {
    const state = useEditorStore.getState();
    if (state.dirty && !window.confirm('Discard unsaved changes and start a new project?')) return;
    setBusy('create');
    setError('');
    try {
      const finalDuration = Math.max(1, Math.min(3600, Math.round(duration)));
      state.newProject({
        name: name.trim() || 'Untitled Project',
        duration: finalDuration,
        fps,
        path: targetPath || null
      });
      const next = useEditorStore.getState();
      next.setMode('scene');
      next.setViewMode('editor');
      next.setSelected(null);
      next.setDockTab('timeline');
      if (targetPath && window.desktop?.writeTextAt) {
        const payload: ProjectFile = {
          app: 'vexlum',
          version: 1,
          savedAt: new Date().toISOString(),
          project: next.project,
          models: {}
        };
        const saved = await writeTextAt(targetPath, JSON.stringify(payload, null, 2));
        if (saved) {
          next.markSaved(targetPath);
          rememberRecentProject(targetPath, next.project.name);
        } else {
          next.setToast('Project created, but the file could not be written yet', 'info');
        }
      }
      onClose();
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setBusy(null);
    }
  };

  const openRecent = async (item: RecentProject) => {
    setBusy('recent');
    setError('');
    try {
      const state = useEditorStore.getState();
      if (state.dirty && !window.confirm('Discard unsaved changes and open this project?')) return;
      let text = await readTextAt(item.path);
      if (!text) {
        setError(`Could not read ${item.path}. It may have been moved or deleted.`);
        return;
      }
      const parsed = JSON.parse(text);
      const project = normalizeProject(parsed?.project ?? parsed);
      loadModelSources(parsed?.models && typeof parsed.models === 'object' ? parsed.models : {});
      state.setProject(project, item.path);
      state.setMode('scene');
      state.setViewMode('editor');
      state.setDockTab('timeline');
      rememberRecentProject(item.path, project.name);
      state.setToast(`Opened ${project.name}`, 'success');
      onClose();
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setBusy(null);
    }
  };

  const openExisting = async () => {
    setBusy('open');
    setError('');
    try {
      const ok = await onOpenProject();
      if (ok) onClose();
    } finally {
      setBusy(null);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto bg-[#06070a] px-6 py-8">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-[540px] w-[540px] rounded-full bg-violet-700/10 blur-[130px]" />
        <div className="absolute -bottom-52 right-[-120px] h-[620px] w-[620px] rounded-full bg-cyan-500/10 blur-[140px]" />
        <div className="absolute inset-0 opacity-[0.16] [background-image:linear-gradient(#1d2430_1px,transparent_1px),linear-gradient(90deg,#1d2430_1px,transparent_1px)] [background-size:64px_64px]" />
      </div>

      <button
        type="button"
        onClick={onClose}
        className="absolute right-5 top-5 z-20 flex h-8 w-8 items-center justify-center rounded-lg border border-[#252b33] bg-[#0d1015]/80 text-[#7b8595] transition-colors hover:text-white"
        title="Continue with the sample scene"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="relative z-10 grid w-full max-w-[1060px] grid-cols-1 gap-8 lg:grid-cols-[1.05fr_1fr]">
        <div className="flex flex-col justify-center">
          <div className="flex items-center gap-5">
            <img
              src="./vexlum-mark.png"
              alt="Vexlum"
              className="h-[92px] w-[92px] rounded-2xl border border-white/10 bg-[#0b0e13] object-contain shadow-[0_0_60px_rgba(56,189,248,0.18)]"
            />
            <div>
              <h1 className="text-[40px] font-bold leading-none tracking-[0.02em] text-white">
                VEX<span className="font-light text-[#9aa4b2]">LUM</span>
              </h1>
              <p className="mt-2.5 font-mono text-[9px] uppercase tracking-[0.28em] text-[#5f6a78]">
                Scene · Animation · Cinema
              </p>
            </div>
          </div>

          <p className="mt-7 max-w-[430px] text-[12.5px] leading-relaxed text-[#9aa4b2]">
            Build a scene, animate cameras and properties on frame-accurate curves, then render a
            cinema-quality video. Start a fresh project or jump back into recent work.
          </p>

          <div className="mt-8 max-w-[430px] space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#6b7280]">
                Recent projects
              </h2>
              {recent.length > 0 && (
                <span className="font-mono text-[8.5px] text-[#3f4854]">{recent.length}</span>
              )}
            </div>
            {recent.length === 0 ? (
              <div className="rounded-lg border border-dashed border-[#252b33] bg-[#0a0c10]/70 px-4 py-5 text-[11px] text-[#5f6a78]">
                Projects you create or open will appear here with their file path.
              </div>
            ) : (
              <div className="max-h-[236px] space-y-1 overflow-y-auto pr-1">
                {recent.map((item) => (
                  <button
                    key={item.path}
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void openRecent(item)}
                    className="group flex w-full items-center gap-3 rounded-lg border border-[#20252d] bg-[#0b0e12]/80 px-3 py-2.5 text-left transition-colors hover:border-cyan-500/35 hover:bg-[#0e141a] disabled:opacity-60"
                  >
                    <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border border-[#252b33] bg-[#11151b] text-cyan-400/80">
                      <FolderOpen className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[11.5px] font-semibold text-[#dbe2ea]">
                        {item.name}
                      </span>
                      <span className="mt-0.5 block truncate font-mono text-[8.5px] text-[#4b5563]">
                        {item.path}
                      </span>
                    </span>
                    {busy === 'recent' ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-400" />
                    ) : (
                      <ArrowRight className="h-3.5 w-3.5 text-[#3f4854] transition-colors group-hover:text-cyan-300" />
                    )}
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => void openExisting()}
              disabled={busy !== null}
              className="flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-[#2a3038] bg-[#11151b] text-[11px] font-medium text-[#a9b2c0] transition-colors hover:border-cyan-500/35 hover:text-white disabled:opacity-60"
            >
              {busy === 'open' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <FolderOpen className="h-3.5 w-3.5" />
              )}
              Open project from disk…
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-[#252b33] bg-[#0b0d12]/90 p-6 shadow-2xl backdrop-blur">
          <div className="flex items-center gap-2">
            <Plus className="h-3.5 w-3.5 text-cyan-400" />
            <h2 className="text-[13px] font-semibold text-white">New project</h2>
          </div>
          <p className="mt-1 text-[10px] text-[#5f6a78]">
            Name it, pick a length, then choose where the project file lives.
          </p>

          <label className="mt-5 block text-[9px] font-bold uppercase tracking-[0.14em] text-[#6b7280]">
            Project name
          </label>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            spellCheck={false}
            autoFocus
            className="mt-1.5 h-9 w-full rounded-lg border border-[#2a3038] bg-[#080a0e] px-3 text-[12px] text-white outline-none transition-colors focus:border-cyan-600"
          />

          <label className="mt-5 block text-[9px] font-bold uppercase tracking-[0.14em] text-[#6b7280]">
            Video / project length
          </label>
          <div className="mt-1.5 grid grid-cols-3 gap-1.5">
            {DURATIONS.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => setDurationChoice(item.value)}
                className={`h-8 rounded-md border text-[10.5px] font-medium transition-colors ${
                  durationChoice === item.value
                    ? 'border-cyan-500/50 bg-cyan-500/15 text-cyan-200'
                    : 'border-[#2a3038] bg-[#0f1217] text-[#8b95a5] hover:text-white'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          {durationChoice === 0 ? (
            <div className="mt-2 flex items-center gap-2">
              <Clock3 className="h-3.5 w-3.5 text-[#5f6a78]" />
              <input
                type="number"
                min={1}
                max={3600}
                value={customDuration}
                onChange={(event) => setCustomDuration(Math.max(1, Number(event.target.value) || 1))}
                className="h-8 w-28 rounded-md border border-[#2a3038] bg-[#080a0e] px-2 font-mono text-[11px] text-white outline-none focus:border-cyan-600"
              />
              <span className="text-[10px] text-[#5f6a78]">seconds</span>
            </div>
          ) : (
            <p className="mt-2 font-mono text-[9px] text-[#4b5563]">
              {duration}s timeline · {(duration / 60).toFixed(duration % 60 === 0 ? 0 : 1)} min
            </p>
          )}

          <div className="mt-5 flex items-center gap-3">
            <div className="flex-1">
              <label className="block text-[9px] font-bold uppercase tracking-[0.14em] text-[#6b7280]">
                Frame rate
              </label>
              <div className="mt-1.5 flex gap-1.5">
                {FPS_OPTIONS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setFps(value)}
                    className={`h-8 flex-1 rounded-md border font-mono text-[10px] transition-colors ${
                      fps === value
                        ? 'border-cyan-500/50 bg-cyan-500/15 text-cyan-200'
                        : 'border-[#2a3038] bg-[#0f1217] text-[#8b95a5] hover:text-white'
                    }`}
                  >
                    {value} fps
                  </button>
                ))}
              </div>
            </div>
          </div>

          <label className="mt-5 block text-[9px] font-bold uppercase tracking-[0.14em] text-[#6b7280]">
            Project folder
          </label>
          <div className="mt-1.5 flex gap-1.5">
            <input
              value={folder}
              onChange={(event) => setFolder(event.target.value)}
              placeholder="Choose a folder…"
              spellCheck={false}
              className="h-8 min-w-0 flex-1 rounded-md border border-[#2a3038] bg-[#080a0e] px-2.5 font-mono text-[9.5px] text-[#cbd5e1] outline-none focus:border-cyan-600"
            />
            <button
              type="button"
              onClick={() => void chooseFolder()}
              className="flex h-8 flex-shrink-0 items-center gap-1.5 rounded-md border border-[#2a3038] bg-[#15181d] px-2.5 text-[10px] text-[#a9b2c0] hover:border-cyan-500/40 hover:text-white"
            >
              <FolderPlus className="h-3 w-3" />
              Browse
            </button>
          </div>
          <p className="mt-2 truncate font-mono text-[8.5px] text-[#4b5563]" title={targetPath}>
            {targetPath || 'No folder chosen — you can save anywhere on your first Ctrl+S.'}
          </p>

          {error && (
            <div className="mt-3 rounded-md border border-red-500/30 bg-red-950/30 px-2.5 py-2 text-[10px] text-red-300">
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={() => void createProject()}
            disabled={busy !== null}
            className="mt-5 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-cyan-500 to-sky-500 text-[12px] font-bold text-[#04121a] shadow-lg shadow-cyan-950/40 transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {busy === 'create' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Create project
          </button>

          <button
            type="button"
            onClick={onClose}
            className="mt-3 w-full text-center text-[9.5px] text-[#4b5563] transition-colors hover:text-[#9aa4b2]"
          >
            Continue with the sample mannequin scene
          </button>
        </div>
      </div>
    </div>
  );
};
