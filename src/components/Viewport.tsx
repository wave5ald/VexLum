import React, { useEffect, useRef, useState } from 'react';
import {
  Box,
  Camera,
  Circle,
  Crosshair,
  Grid3X3,
  Image,
  Lightbulb,
  Magnet,
  Maximize2,
  MousePointer2,
  Move,
  Plus,
  RotateCw,
  Scaling,
  ScanLine,
  Sparkles,
  Square,
  Sun,
  Triangle,
  Upload,
  Aperture
} from 'lucide-react';
import { SceneEngine, EDITOR_CAMERA_PRESETS, ViewMode } from '../editor/SceneEngine';
import { useEditorStore } from '../editor/store';
import { saveBlob } from '../editor/fileIO';
import { TransformMode } from '../editor/SceneEngine';

interface ViewportProps {
  engineRef: React.MutableRefObject<SceneEngine | null>;
  onImportModel?: () => void;
}

const TOOL_BUTTON =
  'flex h-8 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium transition-colors';

const MenuLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="px-2 pb-1 pt-2 text-[8px] font-bold uppercase tracking-[0.14em] text-[#4b5563]">
    {children}
  </div>
);

const MenuItem: React.FC<{
  icon: React.ReactNode;
  label: string;
  hint?: string;
  onClick: () => void;
}> = ({ icon, label, hint, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="flex w-full items-center gap-2.5 rounded-md px-2 py-[5px] text-left transition-colors hover:bg-white/[0.06]"
  >
    <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded bg-white/[0.03]">
      {icon}
    </span>
    <span className="min-w-0 flex-1 truncate text-[10.5px] text-[#cbd5e1]">{label}</span>
    {hint && <span className="font-mono text-[7.5px] text-[#3f4854]">{hint}</span>}
  </button>
);

export const Viewport: React.FC<ViewportProps> = ({ engineRef, onImportModel }) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [engineReady, setEngineReady] = useState(false);
  const [fps, setFps] = useState(60);
  const [showPresetMenu, setShowPresetMenu] = useState(false);
  const [editorPreset, setEditorPreset] = useState('cinema');
  const [capturing, setCapturing] = useState(false);
  const [addMenu, setAddMenu] = useState<{ x: number; y: number } | null>(null);

  const project = useEditorStore((state) => state.project);
  const selectedId = useEditorStore((state) => state.selectedId);
  const time = useEditorStore((state) => state.time);
  const playing = useEditorStore((state) => state.playing);
  const autoKey = useEditorStore((state) => state.autoKey);
  const transformMode = useEditorStore((state) => state.transformMode);
  const transformSpace = useEditorStore((state) => state.transformSpace);
  const snap = useEditorStore((state) => state.snap);
  const viewMode = useEditorStore((state) => state.viewMode);
  const settings = useEditorStore((state) => state.project.settings);

  const setSelected = useEditorStore((state) => state.setSelected);
  const autoKeyTransform = useEditorStore((state) => state.autoKeyTransform);
  const setPlaying = useEditorStore((state) => state.setPlaying);
  const setTransformMode = useEditorStore((state) => state.setTransformMode);
  const setTransformSpace = useEditorStore((state) => state.setTransformSpace);
  const setSnap = useEditorStore((state) => state.setSnap);
  const setViewMode = useEditorStore((state) => state.setViewMode);
  const setSettings = useEditorStore((state) => state.setSettings);
  const setToast = useEditorStore((state) => state.setToast);
  const setSceneCameraView = useEditorStore((state) => state.setSceneCameraView);
  const addPrimitive = useEditorStore((state) => state.addPrimitive);
  const addLight = useEditorStore((state) => state.addLight);
  const addCamera = useEditorStore((state) => state.addCamera);
  const addNull = useEditorStore((state) => state.addNull);
  const addScriptObject = useEditorStore((state) => state.addScriptObject);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const engine = new SceneEngine(mount, {
      onSelect: (id) => setSelected(id),
      onTransform: (id, transform) => {
        const state = useEditorStore.getState();
        autoKeyTransform(id, transform, state.time);
      },
      onTime: (nextTime) => {
        useEditorStore.setState({ time: nextTime });
      },
      onPlayingChange: (isPlaying) => setPlaying(isPlaying),
      onStats: (value) => setFps(value),
      onModelReady: () => {
        // Model meshes are swapped in-place by the engine.
      },
      onAimTarget: (id, target, final) => {
        const state = useEditorStore.getState();
        if (!final) {
          if (!state.interactionStart) state.beginInteraction();
          state.setCameraTarget(id, target, false);
        } else {
          state.setCameraTarget(id, target, false);
          state.endInteraction();
        }
      },
      onScriptError: (id, message) => {
        useEditorStore.getState().setScriptError(id, message);
      },
      onContextMenu: (x, y) => {
        setAddMenu({ x, y });
        setShowPresetMenu(false);
      }
    });
    engineRef.current = engine;
    engine.setProject(useEditorStore.getState().project);
    setEngineReady(true);
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, [engineRef, setSelected, autoKeyTransform, setPlaying]);

  useEffect(() => {
    engineRef.current?.setProject(project);
  }, [project, engineRef]);

  useEffect(() => {
    engineRef.current?.setSelected(selectedId, false);
  }, [selectedId, engineRef]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (playing) {
      engine.setTime(useEditorStore.getState().time);
      engine.setPlaying(true);
    } else {
      engine.setPlaying(false);
    }
  }, [playing, engineRef]);

  useEffect(() => {
    if (!playing) engineRef.current?.setTime(time);
  }, [time, playing, engineRef]);

  useEffect(() => {
    engineRef.current?.setTransformMode(transformMode);
  }, [transformMode, engineRef]);

  useEffect(() => {
    engineRef.current?.setTransformSpace(transformSpace);
  }, [transformSpace, engineRef]);

  useEffect(() => {
    engineRef.current?.setSnap(snap);
  }, [snap, engineRef]);

  useEffect(() => {
    engineRef.current?.setViewMode(viewMode);
  }, [viewMode, engineRef]);

  useEffect(() => {
    if (!addMenu) return;
    const close = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-add-menu]')) return;
      setAddMenu(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAddMenu(null);
    };
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', close, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [addMenu]);

  const selected = project.objects.find((object) => object.id === selectedId);

  const handleScreenshot = async () => {
    if (!engineRef.current || capturing) return;
    setCapturing(true);
    try {
      const blob = await engineRef.current.captureSnapshot(project.video.width, project.video.height);
      const safeName = project.name.replace(/[^a-z0-9-_]+/gi, '-');
      const result = await saveBlob(blob, `${safeName}-still-${Date.now()}.png`, [
        { name: 'PNG Image', extensions: ['png'] }
      ]);
      if (result.saved) setToast('Still frame exported', 'success');
    } catch (error: any) {
      setToast(`Still export failed: ${error.message || error}`, 'error');
    } finally {
      setCapturing(false);
    }
  };

  const handleAlignCamera = () => {
    if (!engineRef.current) return;
    const view = engineRef.current.alignSceneCameraToView();
    setSceneCameraView(view);
    setToast('Render camera aligned to current view', 'success');
  };

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-[#08090b]">
      <div className="relative min-h-0 flex-1">
        <div
          ref={mountRef}
          data-testid="viewport"
          className="absolute inset-0 cursor-grab active:cursor-grabbing"
        />

        {addMenu && (
          <div
            data-add-menu
            className="animate-fade-in fixed z-[80] w-[248px] overflow-hidden rounded-lg border border-[#2a3038] bg-[#0d1015]/95 shadow-[0_24px_70px_rgba(0,0,0,0.65)] backdrop-blur"
            style={{
              left: Math.min(addMenu.x, Math.max(8, window.innerWidth - 264)),
              top: Math.min(addMenu.y, Math.max(8, window.innerHeight - 470))
            }}
            onContextMenu={(event) => event.preventDefault()}
          >
            <div className="flex items-center gap-2 border-b border-[#232830] px-3 py-2">
              <Plus className="h-3 w-3 text-cyan-400" />
              <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#8b95a5]">
                Add to scene
              </span>
              <span className="ml-auto font-mono text-[8px] text-[#3f4854]">RMB</span>
            </div>
            <div className="max-h-[440px] overflow-y-auto p-1.5">
              <MenuLabel>Control</MenuLabel>
              <MenuItem
                icon={<Crosshair className="h-3.5 w-3.5 text-cyan-300" />}
                label="Null / Control"
                hint="parent other objects"
                onClick={() => {
                  addNull();
                  setAddMenu(null);
                }}
              />
              <MenuItem
                icon={<Camera className="h-3.5 w-3.5 text-amber-300" />}
                label="Render camera"
                hint="look-at rig"
                onClick={() => {
                  addCamera();
                  setAddMenu(null);
                }}
              />

              <MenuLabel>Shapes</MenuLabel>
              <MenuItem
                icon={<Box className="h-3.5 w-3.5 text-[#a9b2c0]" />}
                label="Cube"
                onClick={() => {
                  addPrimitive('box');
                  setAddMenu(null);
                }}
              />
              <MenuItem
                icon={<Square className="h-3.5 w-3.5 text-[#a9b2c0]" />}
                label="Plane"
                onClick={() => {
                  addPrimitive('plane');
                  setAddMenu(null);
                }}
              />
              <MenuItem
                icon={<Circle className="h-3.5 w-3.5 text-[#a9b2c0]" />}
                label="Sphere"
                onClick={() => {
                  addPrimitive('sphere');
                  setAddMenu(null);
                }}
              />
              <MenuItem
                icon={<Box className="h-3.5 w-3.5 text-[#a9b2c0]" />}
                label="Cylinder"
                onClick={() => {
                  addPrimitive('cylinder');
                  setAddMenu(null);
                }}
              />
              <MenuItem
                icon={<Triangle className="h-3.5 w-3.5 text-[#a9b2c0]" />}
                label="Cone"
                onClick={() => {
                  addPrimitive('cone');
                  setAddMenu(null);
                }}
              />
              <MenuItem
                icon={<Circle className="h-3.5 w-3.5 text-[#a9b2c0]" />}
                label="Torus"
                onClick={() => {
                  addPrimitive('torus');
                  setAddMenu(null);
                }}
              />
              <MenuItem
                icon={<Sparkles className="h-3.5 w-3.5 text-[#a9b2c0]" />}
                label="Torus knot"
                onClick={() => {
                  addPrimitive('torusKnot');
                  setAddMenu(null);
                }}
              />
              <MenuItem
                icon={<Box className="h-3.5 w-3.5 text-[#a9b2c0]" />}
                label="Icosahedron"
                onClick={() => {
                  addPrimitive('icosahedron');
                  setAddMenu(null);
                }}
              />

              <MenuLabel>Lights</MenuLabel>
              <MenuItem
                icon={<Lightbulb className="h-3.5 w-3.5 text-amber-300" />}
                label="Point light"
                onClick={() => {
                  addLight('point');
                  setAddMenu(null);
                }}
              />
              <MenuItem
                icon={<Sun className="h-3.5 w-3.5 text-amber-300" />}
                label="Spot light"
                onClick={() => {
                  addLight('spot');
                  setAddMenu(null);
                }}
              />
              <MenuItem
                icon={<Sun className="h-3.5 w-3.5 text-amber-200" />}
                label="Directional light"
                onClick={() => {
                  addLight('directional');
                  setAddMenu(null);
                }}
              />
              <MenuItem
                icon={<Square className="h-3.5 w-3.5 text-amber-200" />}
                label="Area light"
                onClick={() => {
                  addLight('rect');
                  setAddMenu(null);
                }}
              />
              <MenuItem
                icon={<Lightbulb className="h-3.5 w-3.5 text-[#a9b2c0]" />}
                label="Ambient light"
                onClick={() => {
                  addLight('ambient');
                  setAddMenu(null);
                }}
              />

              <MenuLabel>More</MenuLabel>
              <MenuItem
                icon={<Upload className="h-3.5 w-3.5 text-emerald-300" />}
                label="Import 3D model…"
                hint="GLB · OBJ · FBX"
                onClick={() => {
                  setAddMenu(null);
                  onImportModel?.();
                }}
              />
              <MenuItem
                icon={<Sparkles className="h-3.5 w-3.5 text-violet-300" />}
                label="Script object"
                hint="Three.js geometry"
                onClick={() => {
                  setAddMenu(null);
                  addScriptObject();
                }}
              />
            </div>
          </div>
        )}

        {/* Top-left tool strip */}
        <div className="glass-toolbar pointer-events-auto absolute left-3 top-3 z-20 flex items-center gap-1 rounded-lg p-1">
          {(
            [
              { mode: 'translate' as TransformMode, icon: Move, label: 'Move', key: 'W' },
              { mode: 'rotate' as TransformMode, icon: RotateCw, label: 'Rotate', key: 'E' },
              { mode: 'scale' as TransformMode, icon: Scaling, label: 'Scale', key: 'R' }
            ] as const
          ).map((tool) => (
            <button
              key={tool.mode}
              type="button"
              title={`${tool.label} (${tool.key})`}
              onClick={() => setTransformMode(tool.mode)}
              className={`${TOOL_BUTTON} ${
                transformMode === tool.mode
                  ? 'bg-cyan-500/15 text-cyan-300'
                  : 'text-[#8b95a5] hover:bg-white/5 hover:text-white'
              }`}
            >
              <tool.icon className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">{tool.label}</span>
            </button>
          ))}
          <div className="mx-1 h-5 w-px bg-[#2a3038]" />
          <button
            type="button"
            title="Toggle world / local space"
            onClick={() => setTransformSpace(transformSpace === 'world' ? 'local' : 'world')}
            className={`${TOOL_BUTTON} text-[#8b95a5] hover:bg-white/5 hover:text-white`}
          >
            <Circle className="h-3 w-3" />
            <span className="font-mono text-[9px] uppercase">{transformSpace}</span>
          </button>
          <button
            type="button"
            title="Snap increments"
            onClick={() => setSnap(!snap)}
            className={`${TOOL_BUTTON} ${
              snap ? 'bg-amber-500/15 text-amber-300' : 'text-[#8b95a5] hover:bg-white/5 hover:text-white'
            }`}
          >
            <Magnet className="h-3.5 w-3.5" />
          </button>
          <div className="mx-1 h-5 w-px bg-[#2a3038]" />
          <button
            type="button"
            title="Toggle editor grid"
            onClick={() => setSettings({ gridVisible: !settings.gridVisible })}
            className={`${TOOL_BUTTON} ${
              settings.gridVisible
                ? 'bg-cyan-500/15 text-cyan-300'
                : 'text-[#8b95a5] hover:bg-white/5 hover:text-white'
            }`}
          >
            <Grid3X3 className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Top-right view controls */}
        <div className="pointer-events-auto absolute right-3 top-3 z-20 flex items-center gap-2">
          <div className="glass-toolbar flex rounded-lg p-1">
            <button
              type="button"
              onClick={() => setViewMode('editor')}
              className={`${TOOL_BUTTON} ${
                viewMode === 'editor' ? 'bg-white/10 text-white' : 'text-[#8b95a5] hover:text-white'
              }`}
            >
              <MousePointer2 className="h-3.5 w-3.5" />
              <span className="hidden md:inline">Editor</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('camera')}
              className={`${TOOL_BUTTON} ${
                viewMode === 'camera'
                  ? 'bg-red-500/15 text-red-300'
                  : 'text-[#8b95a5] hover:text-white'
              }`}
            >
              <Aperture className="h-3.5 w-3.5" />
              <span className="hidden md:inline">Camera</span>
            </button>
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setShowPresetMenu((value) => !value)}
              className="glass-toolbar flex h-[38px] items-center gap-2 rounded-lg px-2.5 text-[11px] text-[#cbd5e1] hover:text-white"
              title="Editor camera presets"
            >
              <Camera className="h-3.5 w-3.5 text-cyan-400" />
              <span className="hidden xl:inline">
                {EDITOR_CAMERA_PRESETS.find((preset) => preset.id === editorPreset)?.name || 'View'}
              </span>
            </button>
            {showPresetMenu && (
              <div className="animate-fade-in absolute right-0 top-11 z-30 w-48 overflow-hidden rounded-lg border border-[#2a3038] bg-[#0f1115] p-1 shadow-2xl">
                {EDITOR_CAMERA_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      engineRef.current?.setEditorPreset(preset.id);
                      setEditorPreset(preset.id);
                      setShowPresetMenu(false);
                    }}
                    className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-[11px] ${
                      editorPreset === preset.id
                        ? 'bg-cyan-500/10 text-cyan-300'
                        : 'text-[#9aa4b2] hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    {preset.name}
                    <span className="font-mono text-[9px] text-[#4b5563]">{preset.fov}°</span>
                  </button>
                ))}
                <div className="my-1 h-px bg-[#232830]" />
                <button
                  type="button"
                  onClick={() => {
                    handleAlignCamera();
                    setShowPresetMenu(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[11px] text-amber-300 hover:bg-amber-500/10"
                >
                  <ScanLine className="h-3.5 w-3.5" />
                  Align render camera
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleScreenshot}
            disabled={capturing}
            title="Export current frame as PNG"
            className="glass-toolbar flex h-[38px] w-[38px] items-center justify-center rounded-lg text-[#cbd5e1] hover:text-white disabled:opacity-50"
          >
            {capturing ? <Maximize2 className="h-3.5 w-3.5 animate-pulse" /> : <Image className="h-3.5 w-3.5" />}
          </button>
        </div>

        {/* Camera view badge */}
        {viewMode === 'camera' && (
          <div className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded-full border border-red-500/40 bg-red-950/60 px-3 py-1 text-[10px] font-semibold tracking-[0.15em] text-red-300 backdrop-blur">
            <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-red-500 pulse-dot" />
            RENDER CAMERA
          </div>
        )}

        {/* Bottom status */}
        <div className="pointer-events-none absolute bottom-3 left-3 z-20 flex items-center gap-3 rounded-md bg-black/45 px-2.5 py-1.5 font-mono text-[9.5px] text-[#8b95a5] backdrop-blur">
          <span className="text-emerald-400">{fps} FPS</span>
          <span className="text-[#2a3038]">|</span>
          <span>{project.objects.length} OBJECTS</span>
          <span className="text-[#2a3038]">|</span>
          <span>{project.tracks.length} CURVES</span>
          {selected && (
            <>
              <span className="text-[#2a3038]">|</span>
              <span className="max-w-[180px] truncate text-cyan-300">{selected.name}</span>
            </>
          )}
          {playing && <span className="text-red-400">• PLAYING</span>}
        </div>

        <div className="pointer-events-none absolute bottom-3 right-3 z-20 hidden items-center gap-3 rounded-md bg-black/45 px-2.5 py-1.5 font-mono text-[9px] text-[#6b7280] backdrop-blur md:flex">
          <span>LMB orbit</span>
          <span>RMB click add</span>
          <span>RMB drag pan</span>
          <span>Wheel zoom</span>
          {autoKey && <span className="text-amber-400">AUTO-KEY</span>}
        </div>

        {!engineReady && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#08090b]">
            <div className="text-center">
              <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-[#2a3038] border-t-cyan-400" />
              <p className="text-xs text-[#8b95a5]">Initializing renderer…</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
