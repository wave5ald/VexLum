import React, { useEffect, useState } from 'react';
import { Clock3, Film, FolderOpen, Loader2, Save, Settings2, X } from 'lucide-react';
import { useEditorStore } from '../editor/store';
import { joinPath, pickProjectFolder, safeProjectFileName } from '../editor/fileIO';
import { ColorField, NumberField, Section } from './ui';

interface ProjectSettingsProps {
  open: boolean;
  onClose: () => void;
}

const LENGTH_PRESETS = [30, 60, 120, 300, 600, 1800];

const RESOLUTIONS = [
  { label: '720p', width: 1280, height: 720 },
  { label: '1080p', width: 1920, height: 1080 },
  { label: '4K', width: 3840, height: 2160 },
  { label: 'Vertical', width: 1080, height: 1920 }
];

export const ProjectSettings: React.FC<ProjectSettingsProps> = ({ open, onClose }) => {
  const project = useEditorStore((state) => state.project);
  const projectPath = useEditorStore((state) => state.projectPath);

  const [name, setName] = useState(project.name);
  const [duration, setDuration] = useState(project.timeline.duration);
  const [fps, setFps] = useState(project.timeline.fps);
  const [width, setWidth] = useState(project.video.width);
  const [height, setHeight] = useState(project.video.height);
  const [path, setPath] = useState(projectPath || '');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const state = useEditorStore.getState();
    setName(state.project.name);
    setDuration(state.project.timeline.duration);
    setFps(state.project.timeline.fps);
    setWidth(state.project.video.width);
    setHeight(state.project.video.height);
    setPath(state.projectPath || '');
  }, [open]);

  if (!open) return null;

  const folder = path ? path.replace(/[\\/][^\\/]+$/, '') : '';
  const fileName = path ? path.split(/[\\/]/).pop() || '' : safeProjectFileName(name);

  const chooseFolder = async () => {
    const picked = await pickProjectFolder();
    if (!picked) return;
    setPath(joinPath(picked, fileName || safeProjectFileName(name)));
  };

  const apply = () => {
    const state = useEditorStore.getState();
    const nextDuration = Math.max(1, Math.min(3600, Math.round(duration)));
    const nextFps = Math.max(1, Math.min(120, Math.round(fps)));
    state.setProjectName(name);
    state.setTimeline({ duration: nextDuration, fps: nextFps });
    state.setVideo({
      width: Math.max(64, Math.round(width)),
      height: Math.max(64, Math.round(height)),
      fps: nextFps,
      start: 0,
      end: nextDuration
    });
    if (path !== (projectPath || '')) state.setProjectPath(path || null);
    state.setToast('Project settings updated', 'success');
    onClose();
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal max-w-[560px]" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[#232830] px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-cyan-400" />
            <div>
              <h2 className="text-[13px] font-semibold text-white">Project settings</h2>
              <p className="text-[9.5px] text-[#6b7280]">Ctrl+K · name, length, format and location</p>
            </div>
          </div>
          <button type="button" className="icon-btn" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[66vh] overflow-y-auto">
          <Section title="Identity" icon={<Film className="h-3 w-3" />}>
            <label className="mb-1 block text-[8.5px] font-bold uppercase tracking-[0.12em] text-[#5f6a78]">
              Project name
            </label>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              spellCheck={false}
              className="h-8 w-full rounded-md border border-[#2a3038] bg-[#080a0e] px-2.5 text-[11.5px] text-white outline-none focus:border-cyan-600"
            />
            <div className="mt-2 flex items-center gap-2 text-[9px] text-[#5f6a78]">
              <FolderOpen className="h-3 w-3" />
              <span className="truncate font-mono" title={path}>
                {path || 'Unsaved project — Ctrl+S chooses a location'}
              </span>
            </div>
          </Section>

          <Section title="Timeline & video" icon={<Clock3 className="h-3 w-3" />}>
            <div className="mb-2 flex flex-wrap gap-1">
              {LENGTH_PRESETS.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setDuration(value)}
                  className={`h-6 rounded border px-2 font-mono text-[9px] transition-colors ${
                    Math.round(duration) === value
                      ? 'border-cyan-500/50 bg-cyan-500/15 text-cyan-200'
                      : 'border-[#2a3038] bg-[#11151b] text-[#8b95a5] hover:text-white'
                  }`}
                >
                  {value >= 60 ? `${value / 60} min` : `${value}s`}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-[96px_1fr] items-center gap-x-2 gap-y-2">
              <span className="field-label">Length (s)</span>
              <NumberField
                value={duration}
                onChange={setDuration}
                step={1}
                min={1}
                max={3600}
                precision={0}
              />
              <span className="field-label">Frame rate</span>
              <div className="flex gap-1">
                {[24, 30, 60].map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setFps(value)}
                    className={`h-6 flex-1 rounded border font-mono text-[9px] ${
                      Math.round(fps) === value
                        ? 'border-cyan-500/50 bg-cyan-500/15 text-cyan-200'
                        : 'border-[#2a3038] bg-[#11151b] text-[#8b95a5] hover:text-white'
                    }`}
                  >
                    {value}
                  </button>
                ))}
              </div>
              <span className="field-label">Resolution</span>
              <div className="grid grid-cols-4 gap-1">
                {RESOLUTIONS.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => {
                      setWidth(item.width);
                      setHeight(item.height);
                    }}
                    className={`h-6 rounded border text-[9px] ${
                      width === item.width && height === item.height
                        ? 'border-cyan-500/50 bg-cyan-500/15 text-cyan-200'
                        : 'border-[#2a3038] bg-[#11151b] text-[#8b95a5] hover:text-white'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <span className="field-label">Width</span>
              <NumberField value={width} onChange={setWidth} step={2} min={64} max={7680} precision={0} />
              <span className="field-label">Height</span>
              <NumberField value={height} onChange={setHeight} step={2} min={64} max={4320} precision={0} />
            </div>

            <p className="mt-2.5 rounded border border-amber-500/20 bg-amber-500/[0.06] px-2 py-1.5 text-[9px] leading-relaxed text-amber-200/80">
              Shortening the length removes keyframes beyond the new end. Lengthening keeps them.
            </p>
          </Section>

          <Section title="Project location" icon={<FolderOpen className="h-3 w-3" />} defaultOpen={false}>
            <div className="flex gap-1.5">
              <input
                value={path}
                onChange={(event) => setPath(event.target.value)}
                spellCheck={false}
                placeholder="project path (.vxl)"
                className="h-7 min-w-0 flex-1 rounded border border-[#2a3038] bg-[#080a0e] px-2 font-mono text-[9px] text-[#cbd5e1] outline-none focus:border-cyan-600"
              />
              <button
                type="button"
                onClick={() => void chooseFolder()}
                className="btn h-7 px-2 text-[9px]"
              >
                <FolderOpen className="h-3 w-3" />
                Folder
              </button>
            </div>
            <p className="mt-1.5 truncate font-mono text-[8px] text-[#4b5563]">
              {folder || 'Choose a folder to keep this and future project files together.'}
            </p>
          </Section>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[#232830] px-5 py-3">
          <button type="button" className="btn h-7 px-3 text-[10px]" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-accent h-7 px-4 text-[10px]"
            onClick={apply}
            disabled={busy}
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            Apply settings
          </button>
        </div>
      </div>
    </div>
  );
};
