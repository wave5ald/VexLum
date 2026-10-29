import React, { useEffect, useState } from 'react';
import {
  CircleDot,
  Gauge,
  Pause,
  Play,
  Plus,
  Sparkles,
  Trash2,
  Wand2,
  Zap
} from 'lucide-react';
import { useEditorStore } from '../editor/store';
import { EFFECT_DEFINITIONS, EFFECT_ORDER, PHYSICS_PRESETS } from '../editor/effects';
import { EffectKind, PhysicsMaterial, SceneEffect } from '../editor/types';
import { NumberField, Row, Toggle } from './ui';

const EFFECT_ICON: Record<EffectKind, React.ReactNode> = {
  physics: <Zap className="h-3 w-3 text-amber-300" />,
  spin: <Sparkles className="h-3 w-3 text-cyan-300" />,
  float: <Sparkles className="h-3 w-3 text-sky-300" />,
  orbit: <CircleDot className="h-3 w-3 text-indigo-300" />,
  shake: <Gauge className="h-3 w-3 text-orange-300" />,
  glow: <Sparkles className="h-3 w-3 text-fuchsia-300" />,
  fade: <Sparkles className="h-3 w-3 text-slate-300" />,
  pulse: <Sparkles className="h-3 w-3 text-emerald-300" />,
  lookAt: <CircleDot className="h-3 w-3 text-cyan-300" />,
  colorCycle: <Sparkles className="h-3 w-3 text-rose-300" />
};

const selectClass =
  'h-[25px] w-full rounded border border-[#2a3038] bg-[#101217] px-1.5 text-[10px] text-[#cbd5e1] outline-none focus:border-cyan-700';

export const EffectsPanel: React.FC = () => {
  const project = useEditorStore((state) => state.project);
  const selectedId = useEditorStore((state) => state.selectedId);
  const time = useEditorStore((state) => state.time);
  const playing = useEditorStore((state) => state.playing);
  const setPlaying = useEditorStore((state) => state.setPlaying);
  const addEffect = useEditorStore((state) => state.addEffect);
  const updateEffect = useEditorStore((state) => state.updateEffect);
  const removeEffect = useEditorStore((state) => state.removeEffect);
  const triggerEffect = useEditorStore((state) => state.triggerEffect);
  const [selectedEffectId, setSelectedEffectId] = useState<string | null>(null);

  const object = project.objects.find((item) => item.id === selectedId) || null;
  const effects = object?.effects || [];
  const effect = effects.find((item) => item.id === selectedEffectId) || effects[0] || null;

  useEffect(() => {
    if (selectedEffectId && !effects.some((item) => item.id === selectedEffectId)) {
      setSelectedEffectId(effects[0]?.id || null);
    }
  }, [effects, selectedEffectId]);

  const canEffect = Boolean(
    object && object.kind !== 'camera' && object.kind !== 'light'
  );

  const add = (kind: EffectKind) => {
    if (!object) return;
    const id = addEffect(object.id, kind, time);
    if (id) setSelectedEffectId(id);
  };

  const deleteEffect = (id: string) => {
    if (!object) return;
    removeEffect(object.id, id);
    setSelectedEffectId(null);
  };

  // Backspace / Delete removes the effect that is currently selected in the
  // list. The handler lives on the list so the global object-delete shortcut
  // still works everywhere else in the editor.
  const handleListKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== 'Backspace' && event.key !== 'Delete') return;
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
    if (!effect) return;
    event.preventDefault();
    event.stopPropagation();
    deleteEffect(effect.id);
  };

  if (!object) {
    return (
      <div className="flex h-full items-center justify-center gap-3 text-center">
        <Wand2 className="h-5 w-5 text-fuchsia-400/50" />
        <div>
          <div className="text-[11px] font-medium text-[#9aa4b2]">Select an object to add effects</div>
          <div className="mt-0.5 text-[9.5px] text-[#5f6a78]">
            Physics drops, fades, spins, glows and more. Effects start at the playhead.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0" onKeyDown={handleListKeyDown}>
      <div className="flex w-[252px] flex-shrink-0 flex-col border-r border-[#1d222a]">
        <div className="flex h-[36px] flex-shrink-0 items-center gap-1.5 border-b border-[#1d222a] px-2.5">
          <Wand2 className="h-3 w-3 text-fuchsia-300" />
          <span className="min-w-0 flex-1 truncate text-[10px] font-semibold text-[#cbd5e1]">{object.name}</span>
          <span className="rounded bg-[#15181d] px-1.5 py-0.5 font-mono text-[8px] uppercase text-[#5f6a78]">
            {object.kind}
          </span>
        </div>
        <div className="border-b border-[#1d222a] p-2">
          <div className="mb-1.5 flex items-center gap-1.5">
            <Plus className="h-3 w-3 text-fuchsia-300" />
            <span className="text-[8.5px] font-bold uppercase tracking-[0.12em] text-[#6b7280]">
              Add effect
            </span>
            <span className="ml-auto font-mono text-[8px] text-[#4b5563]">at {time.toFixed(2)}s</span>
          </div>
          <div className="grid grid-cols-2 gap-1">
            {EFFECT_ORDER.map((kind) => (
              <button
                key={kind}
                type="button"
                disabled={!canEffect}
                onClick={() => add(kind)}
                title={`${EFFECT_DEFINITIONS[kind].hint} — click to add at the playhead`}
                className={`flex items-center gap-1 rounded border px-1.5 py-1 text-left text-[9.5px] transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
                  kind === 'physics'
                    ? 'border-amber-500/25 bg-amber-500/5 text-amber-200 hover:border-amber-400/45 hover:bg-amber-500/15'
                    : 'border-[#2a3038] bg-[#101217] text-[#9aa4b2] hover:border-fuchsia-500/40 hover:text-fuchsia-200'
                }`}
              >
                {EFFECT_ICON[kind]}
                <span className="min-w-0 flex-1 truncate">
                  {kind === 'physics' ? 'Physics drop' : EFFECT_DEFINITIONS[kind].label}
                </span>
              </button>
            ))}
          </div>
        </div>
        <div className="flex h-[22px] flex-shrink-0 items-center gap-1.5 border-b border-[#1d222a] px-2 text-[8.5px] font-bold uppercase tracking-[0.1em] text-[#4b5563]">
          On this object
          <span className="ml-auto font-mono text-[8px] normal-case tracking-normal text-[#3f4854]">
            {effects.length} active
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-1.5 outline-none">
          {effects.length ? (
            effects.map((item, index) => (
              <div
                key={item.id}
                className={`group mb-1 flex w-full items-center gap-1 rounded-md border px-1.5 py-1.5 transition-colors ${
                  effect?.id === item.id
                    ? 'border-fuchsia-500/35 bg-fuchsia-500/10'
                    : 'border-transparent hover:border-[#2a3038] hover:bg-[#12151a]'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setSelectedEffectId(item.id)}
                  title={`Select ${EFFECT_DEFINITIONS[item.kind].label} · Backspace to delete`}
                  className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                >
                  <span className="font-mono text-[8px] text-[#3f4854]">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  {EFFECT_ICON[item.kind]}
                  <span
                    className={`min-w-0 flex-1 truncate text-[10px] ${
                      item.enabled ? 'text-[#cbd5e1]' : 'text-[#5f6a78] line-through'
                    }`}
                  >
                    {item.kind === 'physics'
                      ? `Physics · ${PHYSICS_PRESETS[item.material || 'sponge'].label}`
                      : EFFECT_DEFINITIONS[item.kind].label}
                  </span>
                  <span className="font-mono text-[8px] text-[#4b5563]">{item.start.toFixed(2)}s</span>
                </button>
                <button
                  type="button"
                  onClick={() => deleteEffect(item.id)}
                  title="Delete effect (Backspace)"
                  className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-[#4b5563] opacity-0 transition-opacity hover:bg-red-500/15 hover:text-red-300 group-hover:opacity-100"
                >
                  <Trash2 className="h-2.5 w-2.5" />
                </button>
              </div>
            ))
          ) : (
            <div className="px-2 py-5 text-center text-[9.5px] leading-relaxed text-[#4b5563]">
              No effects yet — click any effect above to add it at the playhead.
            </div>
          )}
        </div>
        <div className="flex h-6 flex-shrink-0 items-center gap-1.5 border-t border-[#1d222a] px-2 font-mono text-[8px] text-[#4b5563]">
          <Play className="h-2 w-2" />
          {effect ? 'Backspace deletes the selected effect' : `playhead ${time.toFixed(2)}s`}
        </div>
      </div>

      <div className="min-w-0 flex-1 overflow-y-auto p-3">
        {!canEffect && (
          <div className="rounded-md border border-amber-500/25 bg-amber-500/5 px-2.5 py-2 text-[10px] text-amber-200/80">
            Effects drive object transforms and materials. Select a mesh, model, mannequin, script object or Null.
          </div>
        )}
        {canEffect && !effect && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <Zap className="mb-2 h-6 w-6 text-amber-300/50" />
            <div className="text-[11px] text-[#9aa4b2]">Add your first effect</div>
            <div className="mt-1 max-w-[360px] text-[9.5px] leading-relaxed text-[#5f6a78]">
              Click any effect on the left to add it at the playhead. Physics is deterministic and
              export-safe: place the object in the air, then pick glass, paper, sponge or slime here.
            </div>
          </div>
        )}
        {canEffect && effect && (
          <EffectDetails
            objectId={object.id}
            effect={effect}
            time={time}
            playing={playing}
            setPlaying={setPlaying}
            updateEffect={updateEffect}
            removeEffect={deleteEffect}
            triggerEffect={(id) => {
              triggerEffect(object.id, id, time);
              setPlaying(true);
            }}
          />
        )}
      </div>
    </div>
  );
};

const EffectDetails: React.FC<{
  objectId: string;
  effect: SceneEffect;
  time: number;
  playing: boolean;
  setPlaying: (playing: boolean) => void;
  updateEffect: (objectId: string, effectId: string, patch: Partial<SceneEffect>) => void;
  removeEffect: (id: string) => void;
  triggerEffect: (id: string) => void;
}> = ({ objectId, effect, time, playing, setPlaying, updateEffect, removeEffect, triggerEffect }) => {
  const update = (patch: Partial<SceneEffect>) => updateEffect(objectId, effect.id, patch);
  const definition = EFFECT_DEFINITIONS[effect.kind];
  const isPhysics = effect.kind === 'physics';

  return (
    <div className="mx-auto max-w-[560px]">
      <div className="flex items-center gap-2">
        {EFFECT_ICON[effect.kind]}
        <div className="min-w-0">
          <div className="text-[12px] font-semibold text-white">{definition.label}</div>
          <div className="text-[9px] text-[#5f6a78]">{definition.hint}</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Toggle checked={effect.enabled} onChange={(checked) => update({ enabled: checked })} />
          <button
            type="button"
            onClick={() => removeEffect(effect.id)}
            className="flex h-6 w-6 items-center justify-center rounded text-[#6b7280] hover:bg-red-500/10 hover:text-red-300"
            title="Remove effect"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
        <Row label="Start">
          <NumberField value={effect.start} min={0} max={600} step={0.05} precision={2} suffix="s" onChange={(value) => update({ start: value })} />
        </Row>
        <div className="flex items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={() => triggerEffect(effect.id)}
            className={`flex h-[24px] items-center gap-1 rounded border px-2 text-[9.5px] font-semibold ${
              isPhysics
                ? 'border-amber-500/35 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25'
                : 'border-cyan-500/30 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20'
            }`}
          >
            {isPhysics ? <Zap className="h-3 w-3" /> : <Play className="h-3 w-3" />}
            {isPhysics ? 'Drop at playhead' : 'Start at playhead'}
          </button>
          <button
            type="button"
            onClick={() => setPlaying(!playing)}
            className="flex h-[24px] w-7 items-center justify-center rounded border border-[#2a3038] bg-[#15181d] text-[#9aa4b2] hover:text-white"
            title={playing ? 'Pause' : 'Play'}
          >
            {playing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
          </button>
        </div>
      </div>

      {isPhysics && (
        <>
          <div className="mt-2 text-[8.5px] font-bold uppercase tracking-[0.12em] text-[#5f6a78]">Material</div>
          <div className="mt-1 grid grid-cols-4 gap-1">
            {(Object.keys(PHYSICS_PRESETS) as PhysicsMaterial[]).map((material) => {
              const preset = PHYSICS_PRESETS[material];
              return (
                <button
                  key={material}
                  type="button"
                  onClick={() => update({ material })}
                  className={`rounded-md border px-1.5 py-1.5 text-left transition-colors ${
                    (effect.material || 'sponge') === material
                      ? 'border-amber-400/45 bg-amber-500/10'
                      : 'border-[#2a3038] bg-[#101217] hover:border-[#39414c]'
                  }`}
                >
                  <span className="flex items-center gap-1 text-[10px] font-semibold text-[#dbe2ea]">
                    <span className="h-2 w-2 rounded-full" style={{ background: preset.color }} />
                    {preset.label}
                  </span>
                  <span className="mt-0.5 block text-[8px] leading-snug text-[#5f6a78]">{preset.hint}</span>
                </button>
              );
            })}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5">
            <Row label="Push" hint="Sideways starting velocity in m/s.">
              <NumberField value={effect.amount ?? 0} min={-20} max={20} step={0.1} precision={2} onChange={(value) => update({ amount: value })} />
            </Row>
            <Row label="Gravity">
              <NumberField value={effect.gravity ?? PHYSICS_PRESETS[effect.material || 'sponge'].gravity} min={0} max={80} step={0.5} precision={1} suffix="m/s²" onChange={(value) => update({ gravity: value })} />
            </Row>
            <Row label="Bounce">
              <NumberField value={effect.bounce ?? PHYSICS_PRESETS[effect.material || 'sponge'].bounce} min={0} max={1} step={0.02} precision={2} onChange={(value) => update({ bounce: value })} />
            </Row>
            <Row label="Floor Y">
              <NumberField value={effect.ground ?? 0} min={-20} max={20} step={0.05} precision={2} suffix="m" onChange={(value) => update({ ground: value })} />
            </Row>
          </div>
          <p className="mt-1.5 text-[8.5px] leading-snug text-[#4b5563]">
            Start is deterministic: scrubbing and video rendering compute the same fall. The object's current
            position is the drop origin; floor Y is the landing plane.
          </p>
        </>
      )}

      {effect.kind === 'spin' && (
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5">
          <Row label="Speed">
            <NumberField value={effect.amount ?? 90} min={-1440} max={1440} step={5} precision={0} suffix="°/s" onChange={(value) => update({ amount: value })} />
          </Row>
          <Row label="Axis">
            <select className={selectClass} value={effect.axis || 'y'} onChange={(event) => update({ axis: event.target.value as 'x' | 'y' | 'z' })}>
              <option value="x">X</option>
              <option value="y">Y</option>
              <option value="z">Z</option>
            </select>
          </Row>
        </div>
      )}

      {(effect.kind === 'float' || effect.kind === 'orbit' || effect.kind === 'shake' || effect.kind === 'pulse') && (
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5">
          <Row label={effect.kind === 'orbit' ? 'Radius' : effect.kind === 'float' ? 'Height' : 'Strength'}>
            <NumberField value={effect.amount ?? 0.2} min={0} max={20} step={0.01} precision={3} onChange={(value) => update({ amount: value })} />
          </Row>
          <Row label="Speed">
            <NumberField value={effect.speed ?? 1} min={0} max={60} step={0.05} precision={2} suffix="Hz" onChange={(value) => update({ speed: value })} />
          </Row>
        </div>
      )}

      {effect.kind === 'glow' && (
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5">
          <Row label="Intensity">
            <NumberField value={effect.amount ?? 2.4} min={0} max={20} step={0.1} precision={2} onChange={(value) => update({ amount: value })} />
          </Row>
          <Row label="Speed">
            <NumberField value={effect.speed ?? 1.5} min={0} max={20} step={0.05} precision={2} suffix="Hz" onChange={(value) => update({ speed: value })} />
          </Row>
          <Row label="Colour">
            <input type="color" className="color-swatch" value={effect.color || '#38bdf8'} onChange={(event) => update({ color: event.target.value })} />
          </Row>
        </div>
      )}

      {effect.kind === 'fade' && (
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5">
          <Row label="Duration">
            <NumberField value={effect.amount ?? 1.2} min={0.05} max={60} step={0.05} precision={2} suffix="s" onChange={(value) => update({ amount: value })} />
          </Row>
        </div>
      )}

      {effect.kind === 'colorCycle' && (
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5">
          <Row label="Speed">
            <NumberField value={effect.speed ?? 0.08} min={0} max={5} step={0.01} precision={2} suffix="Hz" onChange={(value) => update({ speed: value })} />
          </Row>
        </div>
      )}

      {effect.kind === 'lookAt' && (
        <p className="mt-2 text-[9px] text-[#5f6a78]">
          The object faces the render camera from the effect start onwards. Useful for cards, eyes and billboards.
        </p>
      )}

      <div className="mt-2 flex items-center justify-between rounded-md border border-[#232830] bg-[#101217] px-2 py-1 font-mono text-[8.5px] text-[#4b5563]">
        <span>START {effect.start.toFixed(2)}s</span>
        <span>PLAYHEAD {time.toFixed(2)}s</span>
        <span>ID {effect.id.slice(0, 12)}</span>
      </div>
    </div>
  );
};
