import React, { useMemo } from 'react';
import {
  Box,
  Camera,
  ChevronDown,
  CircleDashed,
  Code2,
  Copy,
  Diamond,
  Focus,
  Gauge,
  Layers,
  Lightbulb,
  Link2,
  Lock,
  Move3D,
  RotateCcw,
  Sparkles,
  Target,
  Trash2,
  Video,
  Wand2
} from 'lucide-react';
import { useEditorStore, CameraMoveKind } from '../editor/store';
import { buildTrackIndex, evaluateObject, formatValue } from '../editor/animation';
import {
  Interpolation,
  KeyframeValue,
  LightKind,
  SceneObject,
  isColorProperty,
  PROPERTY_LABELS
} from '../editor/types';
import { SceneEngine } from '../editor/SceneEngine';
import { ColorField, KeyButton, NumberField, Row, Section, SliderField, Toggle } from './ui';

interface InspectorProps {
  engineRef: React.MutableRefObject<SceneEngine | null>;
}

const KIND_LABEL: Record<string, string> = {
  camera: 'Render Camera',
  mannequin: 'Mannequin',
  primitive: 'Primitive',
  model: 'Imported Model',
  light: 'Light',
  script: 'Script Object',
  null: 'Null Control'
};

export const Inspector: React.FC<InspectorProps> = ({ engineRef }) => {
  const project = useEditorStore((state) => state.project);
  const selectedId = useEditorStore((state) => state.selectedId);
  const time = useEditorStore((state) => state.time);
  const autoKey = useEditorStore((state) => state.autoKey);
  const defaultInterp = useEditorStore((state) => state.defaultInterp);
  const mode = useEditorStore((state) => state.mode);

  const updateObjectProperty = useEditorStore((state) => state.updateObjectProperty);
  const addKey = useEditorStore((state) => state.addKey);
  const addTransformKeys = useEditorStore((state) => state.addTransformKeys);
  const addAllMaterialKeys = useEditorStore((state) => state.addAllMaterialKeys);
  const addAllLightKeys = useEditorStore((state) => state.addAllLightKeys);
  const addAllCameraKeys = useEditorStore((state) => state.addAllCameraKeys);
  const clearObjectAnimation = useEditorStore((state) => state.clearObjectAnimation);
  const removeObject = useEditorStore((state) => state.removeObject);
  const duplicateObject = useEditorStore((state) => state.duplicateObject);
  const renameObject = useEditorStore((state) => state.renameObject);
  const toggleVisibility = useEditorStore((state) => state.toggleObjectVisibility);
  const setAutoKey = useEditorStore((state) => state.setAutoKey);
  const setDefaultInterp = useEditorStore((state) => state.setDefaultInterp);
  const setViewMode = useEditorStore((state) => state.setViewMode);
  const setToast = useEditorStore((state) => state.setToast);
  const setSceneCameraView = useEditorStore((state) => state.setSceneCameraView);
  const setSettings = useEditorStore((state) => state.setSettings);
  const setTimeline = useEditorStore((state) => state.setTimeline);
  const addCameraMove = useEditorStore((state) => state.addCameraMove);
  const setCameraAimMode = useEditorStore((state) => state.setCameraAimMode);
  const openScriptEditor = useEditorStore((state) => state.openScriptEditor);
  const setObjectParent = useEditorStore((state) => state.setObjectParent);
  const createParentNull = useEditorStore((state) => state.createParentNull);
  const setDockTab = useEditorStore((state) => state.setDockTab);
  const scriptErrors = useEditorStore((state) => state.scriptErrors);

  const base = project.objects.find((object) => object.id === selectedId) || null;
  const trackIndex = useMemo(() => buildTrackIndex(project.tracks), [project.tracks]);
  const displayed = useMemo(
    () => (base ? evaluateObject(base, trackIndex, time) : null),
    [base, trackIndex, time]
  );
  const objectTracks = base ? project.tracks.filter((track) => track.objectId === base.id) : [];
  const objectKeyCount = objectTracks.reduce((total, track) => total + track.keys.length, 0);

  const propertyTrack = (property: string) =>
    project.tracks.find((track) => track.objectId === base?.id && track.property === property);

  const keyAt = (property: string) =>
    propertyTrack(property)?.keys.some((key) => Math.abs(key.time - time) <= 0.03) || false;

  const keyButton = (property: string, value?: KeyframeValue) => {
    if (!base) return null;
    const track = propertyTrack(property);
    return (
      <KeyButton
        animated={Boolean(track?.keys.length)}
        active={keyAt(property)}
        onClick={() => addKey(base.id, property, time, value)}
      />
    );
  };

  const setProperty = (property: string, value: KeyframeValue) => {
    if (!base) return;
    updateObjectProperty(base.id, property, value);
  };

  return (
    <aside className="flex w-[304px] flex-shrink-0 flex-col border-l border-[#232830] bg-[#0c0e11]">
      <div className="flex h-[38px] flex-shrink-0 items-center justify-between border-b border-[#232830] bg-gradient-to-b from-[#12151a] to-[#0e1014] px-3">
        <span className="text-[10px] font-bold uppercase tracking-[0.13em] text-[#8b95a5]">Inspector</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setDockTab('effects')}
            className="chip hover:border-cyan-500/40 hover:text-cyan-200"
            title="Open the Effects panel"
          >
            <Wand2 className="h-2 w-2 text-fuchsia-400" />
            FX
          </button>
          <span className="chip">
            {mode === 'animation' ? <Diamond className="h-2 w-2 text-amber-400" /> : <Gauge className="h-2 w-2 text-cyan-400" />}
            {mode === 'animation' ? `${objectKeyCount} KEYS` : `${project.timeline.fps} FPS`}
          </span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {!base && <SceneSettingsPanel />}

        {base && displayed && (
          <>
            <div className="border-b border-[#232830] p-3">
              <div className="mb-2 flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#2a3038] bg-[#15181d]">
                  {base.kind === 'camera' ? (
                    <Video className="h-4 w-4 text-cyan-400" />
                  ) : base.kind === 'light' ? (
                    <Lightbulb className="h-4 w-4 text-yellow-300" />
                  ) : base.kind === 'model' ? (
                    <Box className="h-4 w-4 text-emerald-400" />
                  ) : (
                    <Box className="h-4 w-4 text-rose-400" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <input
                    value={base.name}
                    onChange={(event) => renameObject(base.id, event.target.value)}
                    className="h-6 w-full rounded border border-transparent bg-transparent px-1 text-[13px] font-semibold text-white outline-none hover:border-[#2a3038] focus:border-cyan-700 focus:bg-[#10171b]"
                  />
                  <div className="px-1 font-mono text-[8.5px] uppercase tracking-[0.1em] text-[#5f6a78]">
                    {KIND_LABEL[base.kind]} · {base.id.slice(-6)}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="btn h-6 flex-1 px-1.5 text-[10px]"
                  onClick={() => engineRef.current?.focusSelected()}
                  title="Frame selected (F)"
                >
                  <Focus className="h-3 w-3" /> Focus
                </button>
                <button
                  type="button"
                  className="btn h-6 px-1.5 text-[10px]"
                  onClick={() => setViewMode('camera')}
                  title="Look through the render camera"
                >
                  <Camera className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  className="btn h-6 px-1.5 text-[10px]"
                  onClick={() => duplicateObject(base.id)}
                  title="Duplicate (Ctrl+D)"
                >
                  <Copy className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  className="btn h-6 px-1.5 text-[10px] hover:!border-red-500/40 hover:!text-red-400"
                  onClick={() => removeObject(base.id)}
                  title="Delete (Del)"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
              {objectTracks.length > 0 && (
                <div className="mt-2 flex items-center gap-1.5 rounded-md border border-amber-500/20 bg-amber-500/5 px-2 py-1 text-[9.5px] text-amber-300">
                  <Diamond className="h-2.5 w-2.5" fill="currentColor" />
                  Animated · {objectTracks.length} curves · {objectKeyCount} keys
                </div>
              )}
            </div>

            <Section
              title="Transform"
              icon={<Move3D className="h-3 w-3" />}
              action={
                <button
                  type="button"
                  className="text-[9px] font-medium text-amber-400 hover:text-amber-300"
                  onClick={() => addTransformKeys(base.id, time)}
                  title="Key position, rotation and scale at playhead"
                >
                  KEY ALL
                </button>
              }
            >
              <AxisRow
                label="Position"
                values={displayed.position}
                step={0.05}
                suffix="m"
                onKey={() => addTransformKeys(base.id, time)}
                onChange={(axis, value) => setProperty(`position.${axis}`, value)}
                keyed={[keyAt('position.x'), keyAt('position.y'), keyAt('position.z')]}
                animated={Boolean(propertyTrack('position.x'))}
                onKeyAxis={(axis) => addKey(base.id, `position.${axis}`, time)}
              />
              <AxisRow
                label="Rotation"
                values={displayed.rotation}
                step={1}
                suffix="°"
                onKey={() => addTransformKeys(base.id, time)}
                onChange={(axis, value) => setProperty(`rotation.${axis}`, value)}
                keyed={[keyAt('rotation.x'), keyAt('rotation.y'), keyAt('rotation.z')]}
                animated={Boolean(propertyTrack('rotation.x'))}
                onKeyAxis={(axis) => addKey(base.id, `rotation.${axis}`, time)}
                disabled={base.kind === 'camera' && (displayed.camera?.aimMode ?? 'target') === 'target'}
                disabledHint="Look-at camera: rotation is computed from the target. Switch Aim to Free to key rotation."
              />
              <AxisRow
                label="Scale"
                values={displayed.scale}
                step={0.02}
                precision={3}
                onKey={() => addTransformKeys(base.id, time)}
                onChange={(axis, value) => setProperty(`scale.${axis}`, value)}
                keyed={[keyAt('scale.x'), keyAt('scale.y'), keyAt('scale.z')]}
                animated={Boolean(propertyTrack('scale.x'))}
                onKeyAxis={(axis) => addKey(base.id, `scale.${axis}`, time)}
              />
              <div className="mt-2 flex items-center justify-between rounded-md bg-[#101217] px-2 py-1">
                <span className="text-[9px] text-[#6b7280]">Visible</span>
                <Toggle checked={base.visible} onChange={() => toggleVisibility(base.id)} />
              </div>
            </Section>

            {base.kind !== 'camera' && base.kind !== 'light' && (
              <Section title="Hierarchy" icon={<Link2 className="h-3 w-3" />} defaultOpen={false}>
                <Row label="Parent">
                  <select
                    value={base.parentId || ''}
                    onChange={(event) => setObjectParent(base.id, event.target.value || null)}
                    className="h-[24px] w-full rounded border border-[#2a3038] bg-[#101217] px-1.5 text-[10px] text-[#cbd5e1] outline-none focus:border-cyan-700"
                  >
                    <option value="">Scene (no parent)</option>
                    {project.objects
                      .filter((object) => object.kind === 'null' && object.id !== base.id)
                      .map((object) => (
                        <option key={object.id} value={object.id}>
                          {object.name}
                        </option>
                      ))}
                  </select>
                </Row>
                {base.kind === 'null' ? (
                  <p className="mt-2 rounded-md border border-sky-500/20 bg-sky-500/5 px-2 py-1.5 text-[9px] leading-relaxed text-sky-200/80">
                    Move, rotate or animate this Null to drive every child object. Objects can pick a parent in
                    their own Hierarchy section.
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={() => createParentNull(base.id)}
                    className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-sky-500/25 bg-sky-500/10 py-1.5 text-[9.5px] font-medium text-sky-200 hover:bg-sky-500/20"
                  >
                    <CircleDashed className="h-3 w-3" />
                    Create control Null around this object
                  </button>
                )}
              </Section>
            )}

            {base.kind === 'camera' && displayed.camera && (
              <Section title="Render Camera" icon={<Video className="h-3 w-3" />}>
                <Row label="FOV" keyButton={keyButton('camera.fov', displayed.camera.fov)}>
                  <NumberField
                    value={displayed.camera.fov}
                    min={10}
                    max={120}
                    step={1}
                    precision={1}
                    suffix="°"
                    onChange={(value) => setProperty('camera.fov', value)}
                  />
                </Row>

                <div className="mb-1.5 mt-2 flex items-center justify-between">
                  <span className="field-label">Aim</span>
                  <div className="flex overflow-hidden rounded border border-[#2a3038]">
                    {(
                      [
                        ['target', 'Look-at', 'Rotation follows a target point'],
                        ['free', 'Free', 'Keyable rotation, no target']
                      ] as const
                    ).map(([mode, label, hint]) => (
                      <button
                        key={mode}
                        type="button"
                        title={hint}
                        onClick={() => setCameraAimMode(base.id, mode)}
                        className={`h-6 px-2 text-[9.5px] font-medium transition-colors ${
                          (displayed.camera?.aimMode ?? 'target') === mode
                            ? 'bg-cyan-500/20 text-cyan-200'
                            : 'bg-[#11141a] text-[#6b7280] hover:text-[#cbd5e1]'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {(displayed.camera.aimMode ?? 'target') === 'target' ? (
                  <>
                    <div className="mb-1.5 mt-2 flex items-center gap-1.5 text-[9px] uppercase tracking-[0.08em] text-[#5f6a78]">
                      <Target className="h-2.5 w-2.5 text-amber-400" />
                      Look target
                      <span className="ml-auto flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 font-mono text-[8px] normal-case tracking-normal text-amber-300">
                        <Lock className="h-2 w-2" /> AIM LOCKED
                      </span>
                    </div>
                    <AxisRow
                      label="Target"
                      values={displayed.camera.target}
                      step={0.05}
                      onChange={(axis, value) => setProperty(`camera.target.${axis}`, value)}
                      keyed={[keyAt('camera.target.x'), keyAt('camera.target.y'), keyAt('camera.target.z')]}
                      animated={Boolean(propertyTrack('camera.target.x'))}
                      onKeyAxis={(axis) => addKey(base.id, `camera.target.${axis}`, time)}
                      hideHeader
                    />
                    <p className="mt-1.5 rounded bg-[#0f1217] px-2 py-1.5 text-[9px] leading-relaxed text-[#5f6a78]">
                      The camera always looks at this point. Position keys therefore also pan and
                      tilt — that is the aim constraint, not a hidden link. Drag the amber crosshair
                      in the viewport to move it.
                    </p>
                  </>
                ) : (
                  <p className="mt-2 rounded bg-[#0f1217] px-2 py-1.5 text-[9px] leading-relaxed text-[#5f6a78]">
                    Free aim: the camera uses Rotation X/Y/Z from the Transform section. Key those
                    axes to animate the view. Switching back converts the rotation into a target.
                  </p>
                )}

                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    className="btn h-6 text-[9.5px]"
                    onClick={() => {
                      const view = engineRef.current?.alignSceneCameraToView();
                      if (view) {
                        setSceneCameraView(view);
                        setToast('Camera aligned to viewport', 'success');
                      }
                    }}
                  >
                    <Link2 className="h-3 w-3" /> Align to view
                  </button>
                  <button
                    type="button"
                    className="btn h-6 text-[9.5px]"
                    onClick={() => addAllCameraKeys(base.id, time)}
                  >
                    <Diamond className="h-3 w-3 text-amber-400" /> Key camera
                  </button>
                </div>
                <div className="mt-2 rounded-md border border-[#232830] bg-[#101217] p-2">
                  <div className="mb-1.5 flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.1em] text-[#6b7280]">
                    <Wand2 className="h-2.5 w-2.5 text-cyan-400" /> Camera moves
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    {(
                      [
                        ['dolly', 'Dolly In'],
                        ['orbit', 'Orbit 90°'],
                        ['orbit180', 'Orbit 180°'],
                        ['crane', 'Crane Up'],
                        ['reveal', 'Reveal']
                      ] as Array<[CameraMoveKind, string]>
                    ).map(([kind, label]) => (
                      <button
                        key={kind}
                        type="button"
                        className="rounded border border-[#2a3038] bg-[#15181d] px-1.5 py-1 text-[9px] text-[#9aa4b2] hover:border-cyan-700 hover:text-cyan-300"
                        onClick={() => addCameraMove(kind, project.timeline.duration)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </Section>
            )}

            {base.kind === 'light' && displayed.light && (
              <Section
                title="Light"
                icon={<Lightbulb className="h-3 w-3" />}
                action={
                  <button
                    type="button"
                    className="text-[9px] font-medium text-amber-400 hover:text-amber-300"
                    onClick={() => addAllLightKeys(base.id, time)}
                  >
                    KEY ALL
                  </button>
                }
              >
                <Row label="Type">
                  <span className="font-mono text-[10px] uppercase text-[#9aa4b2]">{displayed.light.kind}</span>
                </Row>
                <Row label="Color" keyButton={keyButton('light.color', displayed.light.color)}>
                  <ColorField value={displayed.light.color} onChange={(value) => setProperty('light.color', value)} />
                </Row>
                <Row label="Intensity" keyButton={keyButton('light.intensity', displayed.light.intensity)}>
                  <NumberField
                    value={displayed.light.intensity}
                    step={0.1}
                    min={0}
                    precision={2}
                    onChange={(value) => setProperty('light.intensity', value)}
                  />
                </Row>
                <SliderField
                  value={Math.min(displayed.light.intensity, 300)}
                  min={0}
                  max={300}
                  step={0.5}
                  onChange={(value) => setProperty('light.intensity', value)}
                  format={(value) => value.toFixed(0)}
                />
                {(displayed.light.kind === 'point' ||
                  displayed.light.kind === 'spot' ||
                  displayed.light.kind === 'rect') && (
                  <>
                    <Row label="Distance">
                      <NumberField
                        value={displayed.light.distance}
                        min={0}
                        step={0.5}
                        onChange={(value) => setProperty('light.distance', value)}
                      />
                    </Row>
                    <Row label="Decay">
                      <NumberField
                        value={displayed.light.decay}
                        min={0}
                        step={0.1}
                        onChange={(value) => setProperty('light.decay', value)}
                      />
                    </Row>
                  </>
                )}
                {displayed.light.kind === 'spot' && (
                  <>
                    <Row label="Cone">
                      <SliderField
                        value={displayed.light.angle}
                        min={0.05}
                        max={1.5}
                        step={0.01}
                        onChange={(value) => setProperty('light.angle', value)}
                        format={(value) => `${Math.round((value * 180) / Math.PI)}°`}
                      />
                    </Row>
                    <Row label="Penumbra">
                      <SliderField
                        value={displayed.light.penumbra}
                        min={0}
                        max={1}
                        step={0.01}
                        onChange={(value) => setProperty('light.penumbra', value)}
                      />
                    </Row>
                  </>
                )}
                {displayed.light.kind === 'hemisphere' && (
                  <Row label="Ground">
                    <ColorField
                      value={displayed.light.groundColor}
                      onChange={(value) => setProperty('light.groundColor', value)}
                    />
                  </Row>
                )}
                {['directional', 'spot'].includes(displayed.light.kind) && (
                  <>
                    <div className="mb-1.5 mt-2 text-[9px] uppercase tracking-[0.08em] text-[#5f6a78]">Aim target</div>
                    <AxisRow
                      label="Target"
                      values={displayed.light.target}
                      step={0.05}
                      onChange={(axis, value) => setProperty(`light.target.${axis}`, value)}
                      keyed={[
                        keyAt('light.target.x'),
                        keyAt('light.target.y'),
                        keyAt('light.target.z')
                      ]}
                      animated={Boolean(propertyTrack('light.target.x'))}
                      onKeyAxis={(axis) => addKey(base.id, `light.target.${axis}`, time)}
                      hideHeader
                    />
                  </>
                )}
                <div className="mt-2 flex items-center justify-between rounded-md bg-[#101217] px-2 py-1">
                  <span className="text-[9px] text-[#6b7280]">Cast shadows</span>
                  <Toggle
                    checked={displayed.light.castShadow}
                    onChange={(value) => setProperty('light.castShadow' as string, value)}
                  />
                </div>
              </Section>
            )}

            {displayed.material && displayed.kind !== 'script' && (
              <Section
                title="Material"
                icon={<Sparkles className="h-3 w-3" />}
                action={
                  <button
                    type="button"
                    className="text-[9px] font-medium text-amber-400 hover:text-amber-300"
                    onClick={() => addAllMaterialKeys(base.id, time)}
                  >
                    KEY ALL
                  </button>
                }
              >
                <Row label="Base color" keyButton={keyButton('material.color', displayed.material.color)}>
                  <ColorField
                    value={displayed.material.color}
                    onChange={(value) => setProperty('material.color', value)}
                  />
                </Row>
                <Row label="Emissive" keyButton={keyButton('material.emissive', displayed.material.emissive)}>
                  <ColorField
                    value={displayed.material.emissive}
                    onChange={(value) => setProperty('material.emissive', value)}
                  />
                </Row>
                <Row
                  label="Emission"
                  keyButton={keyButton('material.emissiveIntensity', displayed.material.emissiveIntensity)}
                >
                  <SliderField
                    value={displayed.material.emissiveIntensity}
                    min={0}
                    max={5}
                    step={0.05}
                    onChange={(value) => setProperty('material.emissiveIntensity', value)}
                  />
                </Row>
                <Row label="Roughness" keyButton={keyButton('material.roughness', displayed.material.roughness)}>
                  <SliderField
                    value={displayed.material.roughness}
                    min={0}
                    max={1}
                    step={0.01}
                    onChange={(value) => setProperty('material.roughness', value)}
                  />
                </Row>
                <Row label="Metalness" keyButton={keyButton('material.metalness', displayed.material.metalness)}>
                  <SliderField
                    value={displayed.material.metalness}
                    min={0}
                    max={1}
                    step={0.01}
                    onChange={(value) => setProperty('material.metalness', value)}
                  />
                </Row>
                <Row label="Opacity" keyButton={keyButton('material.opacity', displayed.material.opacity)}>
                  <SliderField
                    value={displayed.material.opacity}
                    min={0.05}
                    max={1}
                    step={0.01}
                    onChange={(value) => setProperty('material.opacity', value)}
                  />
                </Row>
                <div className="mt-2 space-y-1.5">
                  <div className="flex items-center justify-between rounded-md bg-[#101217] px-2 py-1">
                    <span className="text-[9px] text-[#6b7280]">Wireframe</span>
                    <Toggle
                      checked={displayed.material.wireframe}
                      onChange={(value) => setProperty('material.wireframe', value)}
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-md bg-[#101217] px-2 py-1">
                    <span className="text-[9px] text-[#6b7280]">Flat shading</span>
                    <Toggle
                      checked={displayed.material.flatShading}
                      onChange={(value) => setProperty('material.flatShading' as string, value)}
                    />
                  </div>
                </div>
              </Section>
            )}

            {displayed.script && (
              <Section
                title="Script"
                icon={<Code2 className="h-3 w-3" />}
                action={
                  <button
                    type="button"
                    className="text-[9px] font-medium text-cyan-400 hover:text-cyan-300"
                    onClick={() => openScriptEditor(base.id)}
                  >
                    EDIT CODE
                  </button>
                }
              >
                {scriptErrors[base.id] ? (
                  <div className="mb-2 rounded-md border border-red-500/30 bg-red-950/30 px-2 py-1.5 font-mono text-[9px] leading-relaxed text-red-300">
                    {scriptErrors[base.id]}
                  </div>
                ) : (
                  <div className="mb-2 flex items-center gap-1.5 rounded-md border border-emerald-500/25 bg-emerald-950/20 px-2 py-1 font-mono text-[9px] text-emerald-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    Script compiled — geometry is live
                  </div>
                )}
                <pre className="max-h-[104px] overflow-hidden rounded-md border border-[#232830] bg-[#0b0d10] p-2 font-mono text-[8.5px] leading-relaxed text-[#7b8595]">
                  {displayed.script.source.split('\n').slice(0, 7).join('\n')}
                </pre>
                <button
                  type="button"
                  className="btn mt-2 h-6 w-full text-[9.5px]"
                  onClick={() => openScriptEditor(base.id)}
                >
                  <Code2 className="h-3 w-3 text-cyan-400" /> Edit script / templates
                </button>
                <p className="mt-1.5 text-[8.5px] leading-relaxed text-[#5f6a78]">
                  Runs locally with <span className="font-mono text-[#8b95a5]">THREE</span> in scope and
                  returns any Object3D. Key its transform and material like any other object.
                </p>
              </Section>
            )}

            <Section title="Animation" icon={<Diamond className="h-3 w-3" />} defaultOpen>
              <div className="mb-2 flex items-center justify-between rounded-md border border-[#232830] bg-[#101217] px-2 py-1.5">
                <div>
                  <div className="text-[9.5px] font-medium text-[#cbd5e1]">Auto-key</div>
                  <div className="text-[8.5px] text-[#5f6a78]">Record edits at playhead</div>
                </div>
                <Toggle checked={autoKey} onChange={setAutoKey} />
              </div>
              <div className="mb-2 flex items-center justify-between rounded-md border border-[#232830] bg-[#101217] px-2 py-1.5">
                <div>
                  <div className="text-[9.5px] font-medium text-[#cbd5e1]">Interpolation</div>
                  <div className="text-[8.5px] text-[#5f6a78]">New keyframes</div>
                </div>
                <select
                  value={defaultInterp}
                  onChange={(event) => setDefaultInterp(event.target.value as Interpolation)}
                  className="h-6 rounded border border-[#2a3038] bg-[#15181d] px-1 text-[9.5px] text-[#cbd5e1] outline-none"
                >
                  <option value="bezier">Bezier</option>
                  <option value="ease">Ease</option>
                  <option value="linear">Linear</option>
                  <option value="step">Step</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  className="btn h-6 text-[9.5px]"
                  onClick={() => addTransformKeys(base.id, time)}
                >
                  <Diamond className="h-3 w-3 text-amber-400" /> Key transform
                </button>
                <button
                  type="button"
                  className="btn h-6 text-[9.5px]"
                  onClick={() => {
                    clearObjectAnimation(base.id);
                    setToast(`${base.name} animation cleared`, 'info');
                  }}
                >
                  <RotateCcw className="h-3 w-3" /> Clear
                </button>
              </div>
              {objectTracks.length > 0 && (
                <div className="mt-2 max-h-24 overflow-y-auto rounded-md border border-[#232830] bg-[#101217] p-1">
                  {objectTracks.map((track) => (
                    <div
                      key={track.id}
                      className="flex items-center justify-between rounded px-1 py-0.5 font-mono text-[8.5px] text-[#7b8595]"
                    >
                      <span className="truncate">{PROPERTY_LABELS[track.property] || track.property}</span>
                      <span className="text-amber-400/70">{track.keys.length}</span>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            <SceneSettingsPanel compact />
          </>
        )}
      </div>
    </aside>
  );
};

const AxisRow: React.FC<{
  label: string;
  values: [number, number, number];
  step: number;
  precision?: number;
  suffix?: string;
  onChange: (axis: 'x' | 'y' | 'z', value: number) => void;
  onKey?: () => void;
  keyed: [boolean, boolean, boolean];
  animated: boolean;
  onKeyAxis: (axis: 'x' | 'y' | 'z') => void;
  hideHeader?: boolean;
  disabled?: boolean;
  disabledHint?: string;
}> = ({ label, values, step, precision, suffix, onChange, keyed, onKeyAxis, hideHeader, disabled, disabledHint }) => {
  if (disabled) {
    return (
      <div
        className="mb-1.5 rounded-md border border-[#232830] bg-[#101217] px-2 py-1"
        title={disabledHint}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="field-label">{label}</span>
          <span className="flex items-center gap-1 font-mono text-[8px] uppercase tracking-wide text-[#5f6a78]">
            <Lock className="h-2.5 w-2.5" /> aim locked
          </span>
        </div>
        <div className="mt-0.5 font-mono text-[9px] text-[#4b5563]">
          {values.map((value) => value.toFixed(1)).join('  /  ')}
        </div>
      </div>
    );
  }
  return (
  <div className="mb-1.5">
    {!hideHeader && (
      <div className="mb-1 flex items-center justify-between">
        <span className="field-label">{label}</span>
        <span className="flex items-center">
          {(['x', 'y', 'z'] as const).map((axis) => (
            <KeyButton
              key={axis}
              active={keyed[['x', 'y', 'z'].indexOf(axis)]}
              onClick={() => onKeyAxis(axis)}
              title={`Key ${label} ${axis.toUpperCase()}`}
            />
          ))}
        </span>
      </div>
    )}
    <div className="grid grid-cols-3 gap-1">
      {(['x', 'y', 'z'] as const).map((axis, index) => (
        <div key={axis} className="relative flex items-center gap-0.5">
          <span
            className={`w-2 flex-shrink-0 text-center font-mono text-[8px] font-bold ${
              axis === 'x' ? 'text-red-400' : axis === 'y' ? 'text-green-400' : 'text-blue-400'
            }`}
          >
            {axis.toUpperCase()}
          </span>
          <NumberField
            value={values[index]}
            step={step}
            precision={precision ?? (label === 'Rotation' ? 1 : 3)}
            suffix={suffix}
            onChange={(value) => onChange(axis, value)}
          />
          {hideHeader && (
            <button
              type="button"
              className={`keyframe-btn !h-4 !w-4 ${keyed[index] ? 'has-key' : ''}`}
              onClick={() => onKeyAxis(axis)}
              title={`Key ${label} ${axis.toUpperCase()}`}
            >
              <Diamond className="h-2.5 w-2.5" fill={keyed[index] ? 'currentColor' : 'none'} />
            </button>
          )}
        </div>
      ))}
    </div>
  </div>
  );
};

const SceneSettingsPanel: React.FC<{ compact?: boolean }> = ({ compact }) => {
  const project = useEditorStore((state) => state.project);
  const setSettings = useEditorStore((state) => state.setSettings);
  const setTimeline = useEditorStore((state) => state.setTimeline);
  const settings = project.settings;

  return (
    <Section title={compact ? 'Scene' : 'Scene Settings'} icon={<Layers className="h-3 w-3" />} defaultOpen={!compact}>
      <Row label="Background">
        <ColorField value={settings.background} onChange={(value) => setSettings({ background: value })} />
      </Row>
      <Row label="Floor">
        <ColorField value={settings.floorColor} onChange={(value) => setSettings({ floorColor: value })} />
      </Row>
      <Row label="Wall">
        <ColorField value={settings.wallColor} onChange={(value) => setSettings({ wallColor: value })} />
      </Row>
      <Row label="Exposure">
        <SliderField
          value={settings.exposure}
          min={0.2}
          max={2.5}
          step={0.01}
          onChange={(value) => setSettings({ exposure: value })}
        />
      </Row>
      <div className="mb-1.5 mt-2 flex items-center justify-between">
        <span className="field-label">Fog</span>
        <Toggle checked={settings.fogEnabled} onChange={(value) => setSettings({ fogEnabled: value })} />
      </div>
      {settings.fogEnabled && (
        <>
          <Row label="Fog color">
            <ColorField value={settings.fogColor} onChange={(value) => setSettings({ fogColor: value })} />
          </Row>
          <Row label="Density">
            <SliderField
              value={settings.fogDensity}
              min={0}
              max={0.15}
              step={0.001}
              onChange={(value) => setSettings({ fogDensity: value })}
              format={(value) => value.toFixed(3)}
            />
          </Row>
        </>
      )}
      <div className="mt-2 space-y-1.5">
        <div className="flex items-center justify-between rounded-md bg-[#101217] px-2 py-1">
          <span className="text-[9px] text-[#6b7280]">Contact shadows</span>
          <Toggle
            checked={settings.contactShadows}
            onChange={(value) => setSettings({ contactShadows: value })}
          />
        </div>
        <div className="flex items-center justify-between rounded-md bg-[#101217] px-2 py-1">
          <span className="text-[9px] text-[#6b7280]">Engineering schematics</span>
          <Toggle
            checked={settings.schematicsVisible}
            onChange={(value) => setSettings({ schematicsVisible: value })}
          />
        </div>
        <div className="flex items-center justify-between rounded-md bg-[#101217] px-2 py-1">
          <span className="text-[9px] text-[#6b7280]">Editor grid</span>
          <Toggle checked={settings.gridVisible} onChange={(value) => setSettings({ gridVisible: value })} />
        </div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <div>
          <span className="field-label mb-1 block">Duration (s)</span>
          <NumberField
            value={project.timeline.duration}
            min={1}
            max={120}
            step={1}
            precision={1}
            onChange={(value) => setTimeline({ duration: value })}
          />
        </div>
        <div>
          <span className="field-label mb-1 block">Scene FPS</span>
          <NumberField
            value={project.timeline.fps}
            min={1}
            max={120}
            step={1}
            precision={0}
            onChange={(value) => setTimeline({ fps: Math.round(value) })}
          />
        </div>
      </div>
    </Section>
  );
};
