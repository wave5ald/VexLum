import React, { useEffect, useRef, useState } from 'react';
import {
  Box,
  Boxes,
  Camera,
  ChevronDown,
  ChevronRight,
  Circle,
  CircleDashed,
  Code2,
  Copy,
  CornerDownRight,
  Eye,
  EyeOff,
  Lightbulb,
  Lock,
  Plus,
  Search,
  Square,
  Sun,
  Trash2,
  Unlock,
  Upload,
  User,
  Video,
  X
} from 'lucide-react';
import { useEditorStore } from '../editor/store';
import { LightKind, PrimitiveType, SceneObject } from '../editor/types';
import { PRIMITIVE_NAMES } from '../editor/defaultScene';

interface OutlinerProps {
  onImportModel: () => void;
}

const OBJECT_ICON: Record<string, React.ReactNode> = {
  camera: <Video className="h-3.5 w-3.5 text-cyan-400" />,
  mannequin: <User className="h-3.5 w-3.5 text-rose-400" />,
  primitive: <Box className="h-3.5 w-3.5 text-amber-400" />,
  model: <Boxes className="h-3.5 w-3.5 text-emerald-400" />,
  script: <Code2 className="h-3.5 w-3.5 text-cyan-300" />,
  null: <CircleDashed className="h-3.5 w-3.5 text-sky-300" />,
  light: <Lightbulb className="h-3.5 w-3.5 text-yellow-300" />
};

const PRIMITIVE_LIST: Array<{ type: PrimitiveType; label: string }> = [
  { type: 'box', label: 'Cube' },
  { type: 'monolith', label: 'Slab' },
  { type: 'sphere', label: 'Sphere' },
  { type: 'cylinder', label: 'Column' },
  { type: 'cone', label: 'Cone' },
  { type: 'torus', label: 'Torus' },
  { type: 'torusKnot', label: 'Knot' },
  { type: 'plane', label: 'Plane' },
  { type: 'icosahedron', label: 'Icosa' },
  { type: 'gear', label: 'Gear' },
  { type: 'suzanne', label: 'Suzanne' }
];

const LIGHT_LIST: Array<{ kind: LightKind; label: string }> = [
  { kind: 'point', label: 'Point Light' },
  { kind: 'spot', label: 'Spot Light' },
  { kind: 'directional', label: 'Directional Sun' },
  { kind: 'ambient', label: 'Ambient' },
  { kind: 'hemisphere', label: 'Hemisphere' }
];

export const Outliner: React.FC<OutlinerProps> = ({ onImportModel }) => {
  const project = useEditorStore((state) => state.project);
  const selectedId = useEditorStore((state) => state.selectedId);
  const setSelected = useEditorStore((state) => state.setSelected);
  const toggleVisibility = useEditorStore((state) => state.toggleObjectVisibility);
  const toggleLock = useEditorStore((state) => state.toggleObjectLock);
  const duplicateObject = useEditorStore((state) => state.duplicateObject);
  const removeObject = useEditorStore((state) => state.removeObject);
  const renameObject = useEditorStore((state) => state.renameObject);
  const addPrimitive = useEditorStore((state) => state.addPrimitive);
  const addLight = useEditorStore((state) => state.addLight);
  const addCamera = useEditorStore((state) => state.addCamera);
  const addScriptObject = useEditorStore((state) => state.addScriptObject);
  const addNull = useEditorStore((state) => state.addNull);
  const setToast = useEditorStore((state) => state.setToast);

  const [query, setQuery] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const addRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!addOpen) return;
    const handle = (event: MouseEvent) => {
      if (!addRef.current?.contains(event.target as Node)) setAddOpen(false);
    };
    window.addEventListener('mousedown', handle);
    return () => window.removeEventListener('mousedown', handle);
  }, [addOpen]);

  const filtered = project.objects.filter((object) =>
    query.trim() ? object.name.toLowerCase().includes(query.trim().toLowerCase()) : true
  );

  const groups: Array<{ id: string; label: string; objects: SceneObject[] }> = [
    { id: 'camera', label: 'Cameras', objects: filtered.filter((o) => o.kind === 'camera') },
    { id: 'light', label: 'Lights', objects: filtered.filter((o) => o.kind === 'light') },
    { id: 'null', label: 'Nulls', objects: filtered.filter((o) => o.kind === 'null') },
    { id: 'mannequin', label: 'Mannequins', objects: filtered.filter((o) => o.kind === 'mannequin') },
    {
      id: 'objects',
      label: 'Objects',
      objects: filtered.filter(
        (o) => o.kind === 'primitive' || o.kind === 'model' || o.kind === 'script'
      )
    }
  ].filter((group) => group.objects.length > 0);

  const commitName = () => {
    if (editingId && draftName.trim()) renameObject(editingId, draftName.trim());
    setEditingId(null);
  };

  const selected = project.objects.find((o) => o.id === selectedId);

  return (
    <aside className="flex w-[244px] flex-shrink-0 flex-col border-r border-[#232830] bg-[#0c0e11]">
      <div className="flex h-[38px] flex-shrink-0 items-center justify-between border-b border-[#232830] bg-gradient-to-b from-[#12151a] to-[#0e1014] px-3">
        <span className="text-[10px] font-bold uppercase tracking-[0.13em] text-[#8b95a5]">Scene</span>
        <div className="relative" ref={addRef}>
          <button
            type="button"
            onClick={() => setAddOpen((value) => !value)}
            className={`flex h-6 w-6 items-center justify-center rounded border transition-colors ${
              addOpen
                ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-300'
                : 'border-[#2a3038] bg-[#15181d] text-[#9aa4b2] hover:border-[#39414c] hover:text-white'
            }`}
            title="Add object"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          {addOpen && (
            <div className="animate-fade-in absolute right-0 top-8 z-40 w-[228px] overflow-hidden rounded-lg border border-[#2a3038] bg-[#0f1115] shadow-2xl">
              <div className="p-2">
                <div className="mb-1.5 flex items-center justify-between px-1">
                  <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#6b7280]">
                    Primitives
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {PRIMITIVE_LIST.map((item) => (
                    <button
                      key={item.type}
                      type="button"
                      onClick={() => {
                        addPrimitive(item.type);
                        setAddOpen(false);
                      }}
                      className="flex flex-col items-center gap-1 rounded-md border border-transparent px-1 py-1.5 text-[9px] text-[#9aa4b2] hover:border-[#2a3038] hover:bg-[#171a20] hover:text-white"
                    >
                      <Box className="h-3.5 w-3.5 text-amber-400" />
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="border-t border-[#232830] p-2">
                <span className="mb-1.5 block px-1 text-[9px] font-bold uppercase tracking-[0.12em] text-[#6b7280]">
                  Lights
                </span>
                <div className="grid grid-cols-2 gap-1">
                  {LIGHT_LIST.map((item) => (
                    <button
                      key={item.kind}
                      type="button"
                      onClick={() => {
                        addLight(item.kind);
                        setAddOpen(false);
                      }}
                      className="flex items-center gap-1.5 rounded-md border border-transparent px-1.5 py-1.5 text-[9.5px] text-[#9aa4b2] hover:border-[#2a3038] hover:bg-[#171a20] hover:text-white"
                    >
                      <Sun className="h-3 w-3 text-yellow-300" />
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="border-t border-[#232830] p-2">
                <button
                  type="button"
                  onClick={() => {
                    onImportModel();
                    setAddOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-[10px] text-emerald-300 hover:bg-emerald-500/10"
                >
                  <Upload className="h-3.5 w-3.5" />
                  Import 3D model…
                </button>
                <button
                  type="button"
                  onClick={() => {
                    addNull();
                    setAddOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-[10px] text-sky-300 hover:bg-sky-500/10"
                >
                  <CircleDashed className="h-3.5 w-3.5" />
                  Null (empty control)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    addCamera();
                    setAddOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-[10px] text-cyan-300 hover:bg-cyan-500/10"
                >
                  <Camera className="h-3.5 w-3.5" />
                  Add render camera
                </button>
                <button
                  type="button"
                  onClick={() => {
                    addScriptObject();
                    setAddOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-[10px] text-fuchsia-300 hover:bg-fuchsia-500/10"
                >
                  <Code2 className="h-3.5 w-3.5" />
                  Script object (code → 3D)
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="border-b border-[#1d222a] p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-[#4b5563]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search scene…"
            className="h-[26px] w-full rounded-md border border-[#232830] bg-[#101217] pl-7 pr-7 text-[11px] text-[#d1d5db] outline-none placeholder:text-[#4b5563] focus:border-cyan-700"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[#4b5563] hover:text-white"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 py-1.5">
        {groups.map((group) => {
          const isCollapsed = collapsed[group.id];
          return (
            <div key={group.id} className="mb-1">
              <button
                type="button"
                onClick={() => setCollapsed((prev) => ({ ...prev, [group.id]: !prev[group.id] }))}
                className="flex w-full items-center gap-1 px-1 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-[#5f6a78] hover:text-[#9aa4b2]"
              >
                {isCollapsed ? <ChevronRight className="h-2.5 w-2.5" /> : <ChevronDown className="h-2.5 w-2.5" />}
                {group.label}
                <span className="ml-auto font-mono text-[8.5px] text-[#3f4854]">{group.objects.length}</span>
              </button>
              {!isCollapsed &&
                group.objects.map((object) => (
                  <div
                    key={object.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelected(object.id)}
                    onDoubleClick={() => {
                      setEditingId(object.id);
                      setDraftName(object.name);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') setSelected(object.id);
                    }}
                    className={`outliner-row group relative pr-1 ${
                      selectedId === object.id ? 'selected' : ''
                    }`}
                  >
                    <span className="flex-shrink-0">{OBJECT_ICON[object.kind] || <Square className="h-3.5 w-3.5" />}</span>
                    {editingId === object.id ? (
                      <input
                        autoFocus
                        value={draftName}
                        onChange={(event) => setDraftName(event.target.value)}
                        onBlur={commitName}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') commitName();
                          if (event.key === 'Escape') setEditingId(null);
                        }}
                        className="h-5 min-w-0 flex-1 rounded border border-cyan-700 bg-[#10171b] px-1 text-[11px] text-white outline-none"
                        onClick={(event) => event.stopPropagation()}
                      />
                    ) : (
                      <span className={`min-w-0 flex-1 truncate ${!object.visible ? 'opacity-40' : ''}`}>
                        {object.name}
                      </span>
                    )}
                    {object.parentId && (
                      <span
                        className="flex flex-shrink-0 items-center text-[#4b5563]"
                        title={`Parented to ${project.objects.find((item) => item.id === object.parentId)?.name || 'Null'}`}
                      >
                        <CornerDownRight className="h-2.5 w-2.5" />
                      </span>
                    )}
                    {object.light && (
                      <span
                        className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
                        style={{ background: object.light.color }}
                      />
                    )}
                    {object.material && object.kind !== 'light' && (
                      <span
                        className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
                        style={{ background: object.material.color }}
                      />
                    )}
                    <button
                      type="button"
                      className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-[#5f6a78] opacity-0 hover:bg-white/10 hover:text-white group-hover:opacity-100"
                      onClick={(event) => {
                        event.stopPropagation();
                        duplicateObject(object.id);
                      }}
                      title="Duplicate"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-[#5f6a78] hover:bg-white/10 hover:text-white"
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleVisibility(object.id);
                      }}
                      title={object.visible ? 'Hide' : 'Show'}
                    >
                      {object.visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3 opacity-60" />}
                    </button>
                  </div>
                ))}
            </div>
          );
        })}
        {!filtered.length && (
          <div className="px-3 py-8 text-center text-[10.5px] text-[#4b5563]">No objects match “{query}”.</div>
        )}
      </div>

      <div className="flex-shrink-0 border-t border-[#232830] p-2">
        {selected ? (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between px-1">
              <span className="truncate font-mono text-[9px] uppercase tracking-wide text-[#5f6a78]">
                {selected.kind}
              </span>
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => toggleLock(selected.id)}
                  title={selected.locked ? 'Unlock' : 'Lock'}
                >
                  {selected.locked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                </button>
                <button
                  type="button"
                  className="icon-btn hover:!text-red-400"
                  onClick={() => removeObject(selected.id)}
                  title="Delete object"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-md border border-[#232830] bg-[#101217] px-2 py-1 font-mono text-[9px] text-[#5f6a78]">
              <span>OBJECTS {project.objects.length}</span>
              <span>CURVES {project.tracks.length}</span>
              <span className="flex items-center gap-1 text-amber-400">
                <Circle className="h-1.5 w-1.5 fill-current" />
                {(project.tracks.reduce((total, track) => total + track.keys.length, 0))} KEYS
              </span>
            </div>
          </div>
        ) : (
          <p className="px-1 py-1 text-center text-[9.5px] text-[#4b5563]">
            Select an object to edit its properties
          </p>
        )}
      </div>
    </aside>
  );
};
