import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Diamond,
  Pause,
  Play,
  Repeat,
  SkipBack,
  SkipForward,
  StepBack,
  StepForward,
  Trash2,
  ZoomIn,
  ZoomOut
} from 'lucide-react';
import { useEditorStore } from '../editor/store';
import { buildTrackIndex, evaluateObject, formatValue, getNestedValue } from '../editor/animation';
import {
  Interpolation,
  KeyframeValue,
  PROPERTY_LABELS,
  SceneObject,
  isBooleanProperty,
  isColorProperty
} from '../editor/types';

const LABEL_WIDTH = 208;
const RULER_HEIGHT = 28;
const ROW_HEIGHT = 24;
const MIN_PPS = 12;
const MAX_PPS = 900;

const BASE_PROPERTIES = [
  'position.x',
  'position.y',
  'position.z',
  'rotation.x',
  'rotation.y',
  'rotation.z',
  'scale.x',
  'scale.y',
  'scale.z',
  'visible'
];

function propertiesFor(object: SceneObject): string[] {
  const lookAtCamera = object.kind === 'camera' && object.camera?.aimMode !== 'free';
  const list = BASE_PROPERTIES.filter(
    (property) => !(lookAtCamera && property.startsWith('rotation.'))
  );
  if (object.material && object.kind !== 'script') {
    list.push(
      'material.color',
      'material.roughness',
      'material.metalness',
      'material.emissive',
      'material.emissiveIntensity',
      'material.opacity',
      'material.wireframe'
    );
  }
  if (object.light) {
    list.push(
      'light.color',
      'light.intensity',
      'light.distance',
      'light.decay',
      'light.angle',
      'light.penumbra',
      'light.target.x',
      'light.target.y',
      'light.target.z'
    );
  }
  if (object.camera) {
    list.push('camera.fov', 'camera.target.x', 'camera.target.y', 'camera.target.z');
  }
  return list;
}

interface DragAnchor {
  trackId: string;
  keyId: string;
  startTime: number;
}

interface DragSession {
  startX: number;
  delta: number;
  moved: boolean;
  anchors: DragAnchor[];
}

interface MarqueeRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  additive: boolean;
}

export const Timeline: React.FC = () => {
  const project = useEditorStore((state) => state.project);
  const selectedId = useEditorStore((state) => state.selectedId);
  const selectedKey = useEditorStore((state) => state.selectedKey);
  const selectedKeys = useEditorStore((state) => state.selectedKeys);
  const time = useEditorStore((state) => state.time);
  const playing = useEditorStore((state) => state.playing);
  const autoKey = useEditorStore((state) => state.autoKey);

  const seek = useEditorStore((state) => state.seek);
  const setPlaying = useEditorStore((state) => state.setPlaying);
  const togglePlaying = useEditorStore((state) => state.togglePlaying);
  const setAutoKey = useEditorStore((state) => state.setAutoKey);
  const setTimeline = useEditorStore((state) => state.setTimeline);
  const setSelectedKey = useEditorStore((state) => state.setSelectedKey);
  const selectKeys = useEditorStore((state) => state.selectKeys);
  const clearKeySelection = useEditorStore((state) => state.clearKeySelection);
  const removeSelectedKeys = useEditorStore((state) => state.removeSelectedKeys);
  const setKeyTimes = useEditorStore((state) => state.setKeyTimes);
  const beginInteraction = useEditorStore((state) => state.beginInteraction);
  const endInteraction = useEditorStore((state) => state.endInteraction);
  const updateKey = useEditorStore((state) => state.updateKey);
  const removeKey = useEditorStore((state) => state.removeKey);
  const addKey = useEditorStore((state) => state.addKey);
  const setKeyInterp = useEditorStore((state) => state.setKeyInterp);
  const setSelected = useEditorStore((state) => state.setSelected);
  const removeTrack = useEditorStore((state) => state.removeTrack);

  const [pps, setPps] = useState(110);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [snapFrames, setSnapFrames] = useState(true);
  const [scrubbing, setScrubbing] = useState(false);
  const [draggingKeys, setDraggingKeys] = useState(false);
  const [marquee, setMarquee] = useState<MarqueeRect | null>(null);
  const [zoomRegion, setZoomRegion] = useState<{ start: number; current: number } | null>(null);

  const rulerRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragSession | null>(null);
  const marqueeRef = useRef<(MarqueeRect & { moved: boolean }) | null>(null);

  const { fps, duration } = project.timeline;
  const contentWidth = Math.max(600, duration * pps);
  const trackIndex = useMemo(() => buildTrackIndex(project.tracks), [project.tracks]);
  const selectedSignatures = useMemo(
    () => new Set(selectedKeys.map((key) => `${key.trackId}:${key.keyId}`)),
    [selectedKeys]
  );

  const objects = project.objects;
  const [orderDrag, setOrderDrag] = useState<{ id: string; targetIndex: number } | null>(null);
  const orderPressRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    active: boolean;
    targetIndex: number;
    timer: number;
  } | null>(null);
  const orderDragRef = useRef<{ id: string; targetIndex: number } | null>(null);
  const reorderObject = useEditorStore((state) => state.reorderObject);

  const cancelOrderPress = useCallback(() => {
    const press = orderPressRef.current;
    if (press) window.clearTimeout(press.timer);
    orderPressRef.current = null;
    orderDragRef.current = null;
    setOrderDrag(null);
    document.body.style.cursor = '';
  }, []);

  const beginOrderPress = (event: React.PointerEvent, id: string) => {
    if (event.button !== 0) return;
    const index = project.objects.findIndex((object) => object.id === id);
    if (index < 0) return;
    const press = {
      id,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
      targetIndex: index,
      timer: 0
    };
    press.timer = window.setTimeout(() => {
      const current = orderPressRef.current;
      if (!current || current !== press) return;
      current.active = true;
      const drag = { id, targetIndex: index };
      orderDragRef.current = drag;
      setOrderDrag(drag);
      document.body.style.cursor = 'grabbing';
    }, 360);
    orderPressRef.current = press;
  };

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const press = orderPressRef.current;
      if (!press) return;
      if (!press.active) {
        if (Math.hypot(event.clientX - press.startX, event.clientY - press.startY) <= 5) return;
        // A deliberate drag starts immediately; a short hold still activates it.
        window.clearTimeout(press.timer);
        press.active = true;
        document.body.style.cursor = 'grabbing';
      }
      event.preventDefault();
      const under = document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest('[data-object-id]') as HTMLElement | null;
      const targetId = under?.dataset.objectId;
      if (!targetId) return;
      const targetIndex = project.objects.findIndex((object) => object.id === targetId);
      if (targetIndex < 0) return;
      const drag = { id: press.id, targetIndex };
      orderDragRef.current = drag;
      press.targetIndex = targetIndex;
      setOrderDrag(drag);
    };
    const up = () => {
      const press = orderPressRef.current;
      const drag = orderDragRef.current;
      if (press?.active && drag) {
        reorderObject(press.id, drag.targetIndex);
        useEditorStore.getState().setToast('Track order updated', 'success');
      }
      cancelOrderPress();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [project.objects, reorderObject, cancelOrderPress]);

  const clampPps = (value: number) => Math.max(MIN_PPS, Math.min(MAX_PPS, value));

  const timeFromClientX = useCallback(
    (clientX: number) => {
      const rect = rulerRef.current?.getBoundingClientRect();
      if (!rect) return 0;
      const raw = (clientX - rect.left) / pps;
      const snapped = snapFrames ? Math.round(raw * fps) / fps : raw;
      return Math.max(0, Math.min(duration, snapped));
    },
    [pps, snapFrames, fps, duration]
  );

  useEffect(() => {
    if (!scrubbing) return;
    const move = (event: PointerEvent) => seek(timeFromClientX(event.clientX));
    const up = () => setScrubbing(false);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [scrubbing, timeFromClientX, seek]);

  // ---- Multi-key drag -------------------------------------------------------
  useEffect(() => {
    if (!draggingKeys) return;
    const move = (event: PointerEvent) => {
      const session = dragRef.current;
      if (!session) return;
      const rawDelta = (event.clientX - session.startX) / pps;
      let delta = snapFrames ? Math.round(rawDelta * fps) / fps : rawDelta;
      const earliest = Math.min(...session.anchors.map((anchor) => anchor.startTime));
      const latest = Math.max(...session.anchors.map((anchor) => anchor.startTime));
      if (earliest + delta < 0) delta = -earliest;
      if (latest + delta > duration) delta = duration - latest;
      session.delta = delta;
      session.moved = session.moved || Math.abs(event.clientX - session.startX) > 2;
      if (session.moved && !useEditorStore.getState().interactionStart) beginInteraction();

      const moves = session.anchors.map((anchor) => ({
        trackId: anchor.trackId,
        keyId: anchor.keyId,
        time: anchor.startTime + delta
      }));
      setKeyTimes(moves, false);
      const anchor = session.anchors[0];
      if (anchor) seek(anchor.startTime + delta);
    };

    const up = () => {
      const session = dragRef.current;
      if (session) {
        if (session.moved) {
          setKeyTimes(
            session.anchors.map((anchor) => ({
              trackId: anchor.trackId,
              keyId: anchor.keyId,
              time: anchor.startTime + session.delta
            })),
            false
          );
          endInteraction();
        }
      }
      dragRef.current = null;
      setDraggingKeys(false);
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [draggingKeys, pps, fps, duration, snapFrames, setKeyTimes, seek, beginInteraction, endInteraction]);

  // ---- Marquee --------------------------------------------------------------
  useEffect(() => {
    if (!marquee) return;
    const move = (event: PointerEvent) => {
      const session = marqueeRef.current;
      const content = contentRef.current;
      if (!session || !content) return;
      const rect = content.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      session.x1 = x;
      session.y1 = y;
      session.moved = session.moved || Math.hypot(x - session.x0, y - session.y0) > 3;
      setMarquee({ ...session });
    };
    const up = () => {
      const session = marqueeRef.current;
      marqueeRef.current = null;
      setMarquee(null);
      if (session?.moved) {
        applyMarquee(session);
      } else if (session && !session.additive) {
        clearKeySelection();
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marquee?.x0, marquee?.y0, pps, objects, collapsed, project.tracks]);

  // ---- Zoom region ----------------------------------------------------------
  useEffect(() => {
    if (!zoomRegion) return;
    const body = bodyRef.current;
    const content = contentRef.current;
    if (!body || !content) return;
    const rect = content.getBoundingClientRect();
    const timeAt = (clientX: number) =>
      Math.max(0, Math.min(duration, (clientX - rect.left - LABEL_WIDTH) / pps));

    const move = (event: PointerEvent) =>
      setZoomRegion((previous) =>
        previous ? { ...previous, current: timeAt(event.clientX) } : previous
      );
    const up = () => {
      setZoomRegion((previous) => {
        if (!previous) return null;
        const start = Math.min(previous.start, previous.current);
        const end = Math.max(previous.start, previous.current);
        if (end - start > 0.04) {
          const laneWidth = Math.max(200, body.clientWidth - LABEL_WIDTH);
          const next = clampPps(laneWidth / (end - start));
          setPps(next);
          window.requestAnimationFrame(() => {
            body.scrollLeft = Math.max(0, start * next);
          });
        }
        return null;
      });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomRegion !== null, pps, duration]);

  // ---- Wheel: Shift magnifies, Alt pans sideways ---------------------------
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const onWheel = (event: WheelEvent) => {
      // Alt + wheel walks the timeline left/right, which is the only way to
      // reach later frames on a laptop once you have zoomed in.
      if (event.altKey) {
        event.preventDefault();
        const delta = (event.deltaY || event.deltaX) * 1.8;
        body.scrollLeft = Math.max(0, body.scrollLeft + delta);
        return;
      }
      if (!event.shiftKey) return;
      event.preventDefault();
      const rect = body.getBoundingClientRect();
      const cursorX = event.clientX - rect.left;
      const timeAtCursor = Math.max(
        0,
        (cursorX + body.scrollLeft - LABEL_WIDTH) / Math.max(1, pps)
      );
      const factor = event.deltaY > 0 ? 0.86 : 1.16;
      const next = clampPps(pps * factor);
      const nextScroll = LABEL_WIDTH + timeAtCursor * next - cursorX;
      setPps(next);
      window.requestAnimationFrame(() => {
        body.scrollLeft = Math.max(0, nextScroll);
      });
    };
    body.addEventListener('wheel', onWheel, { passive: false });
    return () => body.removeEventListener('wheel', onWheel);
  }, [pps]);

  const selectedKeyData = useMemo(() => {
    if (!selectedKey) return null;
    const track = project.tracks.find((item) => item.id === selectedKey.trackId);
    const key = track?.keys.find((item) => item.id === selectedKey.keyId);
    return track && key ? { track, key } : null;
  }, [selectedKey, project.tracks]);

  const selectedInterp: Interpolation | '' = useMemo(() => {
    if (!selectedKeys.length) return '';
    const values = selectedKeys
      .map((signature) => {
        const track = project.tracks.find((item) => item.id === signature.trackId);
        return track?.keys.find((item) => item.id === signature.keyId)?.interp;
      })
      .filter(Boolean) as Interpolation[];
    if (!values.length) return '';
    return values.every((value) => value === values[0]) ? values[0] : '';
  }, [selectedKeys, project.tracks]);

  const seekByFrames = (frames: number) => {
    seek(time + frames / fps);
  };

  const ticks: Array<{ time: number; major: boolean }> = [];
  const tickStep = pps > 240 ? 0.1 : pps > 160 ? 0.25 : pps > 80 ? 0.5 : 1;
  for (let t = 0; t <= duration + 0.0001; t += tickStep) {
    ticks.push({ time: Number(t.toFixed(3)), major: Math.abs(t - Math.round(t)) < 0.0001 });
  }

  const addPropertyToSelection = (property: string) => {
    if (!selectedId) return;
    const base = project.objects.find((object) => object.id === selectedId);
    if (!base) return;
    const evaluated = evaluateObject(base, trackIndex, time);
    const value = getNestedValue(evaluated, property);
    addKey(
      selectedId,
      property,
      time,
      typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
        ? value
        : 0
    );
  };

  const addKeyAtClick = (
    event: React.MouseEvent,
    object: SceneObject,
    trackId: string,
    property: string
  ) => {
    event.stopPropagation();
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const raw = (event.clientX - rect.left) / pps;
    const t = Math.max(0, Math.min(duration, snapFrames ? Math.round(raw * fps) / fps : raw));
    const evaluated = evaluateObject(object, trackIndex, t);
    const value = getNestedValue(evaluated, property);
    addKey(
      object.id,
      property,
      t,
      typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? value : 0
    );
  };

  const availableProperties = selectedId
    ? (() => {
        const object = project.objects.find((item) => item.id === selectedId);
        if (!object) return [];
        const existing = new Set(
          project.tracks.filter((track) => track.objectId === object.id).map((track) => track.property)
        );
        return propertiesFor(object).filter((property) => !existing.has(property));
      })()
    : [];

  /** Vertical row geometry used by the marquee selection. */
  const buildLayout = useCallback(() => {
    const layout = new Map<string, number>();
    let y = RULER_HEIGHT;
    for (const object of objects) {
      y += ROW_HEIGHT;
      if (collapsed[object.id]) continue;
      for (const track of project.tracks.filter((item) => item.objectId === object.id)) {
        layout.set(track.id, y);
        y += ROW_HEIGHT;
      }
    }
    return layout;
  }, [objects, collapsed, project.tracks]);

  const applyMarquee = useCallback(
    (rect: MarqueeRect) => {
      const layout = buildLayout();
      const x0 = Math.min(rect.x0, rect.x1);
      const x1 = Math.max(rect.x0, rect.x1);
      const y0 = Math.min(rect.y0, rect.y1);
      const y1 = Math.max(rect.y0, rect.y1);
      const hits: Array<{ trackId: string; keyId: string }> = [];
      for (const track of project.tracks) {
        const top = layout.get(track.id);
        if (top === undefined) continue;
        const center = top + ROW_HEIGHT / 2;
        if (center < y0 || center > y1) continue;
        for (const key of track.keys) {
          const x = LABEL_WIDTH + key.time * pps;
          if (x >= x0 - 8 && x <= x1 + 4) hits.push({ trackId: track.id, keyId: key.id });
        }
      }
      if (hits.length || rect.additive) {
        selectKeys(hits, rect.additive ? 'add' : 'replace');
      }
    },
    [buildLayout, project.tracks, pps, selectKeys]
  );

  const beginKeyDrag = (
    event: React.PointerEvent,
    trackId: string,
    keyId: string,
    keyTime: number
  ) => {
    event.stopPropagation();
    const signature = `${trackId}:${keyId}`;
    const additive = event.shiftKey || event.ctrlKey || event.metaKey;

    if (additive) {
      selectKeys([{ trackId, keyId }], 'toggle');
      seek(keyTime);
      return;
    }

    const alreadySelected = selectedSignatures.has(signature);
    if (!alreadySelected) {
      selectKeys([{ trackId, keyId }], 'replace');
    }

    const anchors: DragAnchor[] = alreadySelected
      ? selectedKeys
          .map((item) => {
            const track = project.tracks.find((candidate) => candidate.id === item.trackId);
            const key = track?.keys.find((candidate) => candidate.id === item.keyId);
            return key && track ? { trackId: track.id, keyId: key.id, startTime: key.time } : null;
          })
          .filter((item): item is DragAnchor => Boolean(item))
      : [{ trackId, keyId, startTime: keyTime }];

    dragRef.current = { startX: event.clientX, delta: 0, moved: false, anchors };
    setDraggingKeys(true);
    seek(keyTime);
  };

  const marqueeStart = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const content = contentRef.current;
    if (!content) return;
    const rect = content.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    if (x < LABEL_WIDTH || y < RULER_HEIGHT) return;
    const session = {
      x0: x,
      y0: y,
      x1: x,
      y1: y,
      additive: event.shiftKey || event.ctrlKey || event.metaKey,
      moved: false
    };
    marqueeRef.current = session;
    setMarquee(session);
  };

  const startScrub = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    if (event.shiftKey) {
      const t = timeFromClientX(event.clientX);
      setZoomRegion({ start: t, current: t });
      event.preventDefault();
      return;
    }
    setScrubbing(true);
    seek(timeFromClientX(event.clientX));
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#0c0e11]">
      {/* Transport toolbar */}
      <div className="flex h-10 flex-shrink-0 items-center gap-2 border-b border-[#232830] bg-[#0e1014] px-2.5">
        <div className="flex items-center gap-0.5">
          <button type="button" className="icon-btn" onClick={() => seek(0)} title="Go to start (Home)">
            <SkipBack className="h-3.5 w-3.5" />
          </button>
          <button type="button" className="icon-btn" onClick={() => seekByFrames(-1)} title="Previous frame">
            <StepBack className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={togglePlaying}
            className={`mx-0.5 flex h-7 w-8 items-center justify-center rounded-md transition-colors ${
              playing ? 'bg-red-500/20 text-red-300' : 'bg-white/5 text-white hover:bg-white/10'
            }`}
            title="Play / Pause (Space)"
          >
            {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          </button>
          <button type="button" className="icon-btn" onClick={() => seekByFrames(1)} title="Next frame">
            <StepForward className="h-3.5 w-3.5" />
          </button>
          <button type="button" className="icon-btn" onClick={() => seek(duration)} title="Go to end (End)">
            <SkipForward className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className={`icon-btn ${project.timeline.loop ? 'active' : ''}`}
            onClick={() => setTimeline({ loop: !project.timeline.loop })}
            title="Loop playback"
          >
            <Repeat className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="mx-1 h-5 w-px bg-[#2a3038]" />

        <div className="rounded border border-[#2a3038] bg-[#11141a] px-2 py-0.5 font-mono text-[10.5px] text-cyan-300">
          {time.toFixed(2)}s
          <span className="ml-1.5 text-[#4b5563]">
            F{String(Math.round(time * fps)).padStart(3, '0')}/{Math.round(duration * fps)}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="field-label">Duration</span>
          <input
            type="number"
            min={1}
            max={120}
            step={0.5}
            value={duration}
            onChange={(event) => {
              const value = parseFloat(event.target.value);
              if (Number.isFinite(value) && value >= 1) setTimeline({ duration: value });
            }}
            className="h-6 w-14 rounded border border-[#2a3038] bg-[#11141a] px-1 text-right font-mono text-[10px] text-[#cbd5e1] outline-none focus:border-cyan-700"
          />
          <select
            value={fps}
            onChange={(event) => setTimeline({ fps: parseInt(event.target.value, 10) })}
            className="h-6 rounded border border-[#2a3038] bg-[#11141a] px-1 font-mono text-[10px] text-[#cbd5e1] outline-none"
          >
            {[12, 24, 25, 30, 50, 60].map((value) => (
              <option key={value} value={value}>
                {value} fps
              </option>
            ))}
          </select>
        </div>

        <div className="mx-1 h-5 w-px bg-[#2a3038]" />

        <button
          type="button"
          onClick={() => setAutoKey(!autoKey)}
          className={`flex h-6 items-center gap-1.5 rounded border px-2 text-[9.5px] font-semibold tracking-wide ${
            autoKey
              ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
              : 'border-[#2a3038] bg-[#11141a] text-[#6b7280]'
          }`}
          title="Auto-key edits at the playhead"
        >
          <span className={`h-1.5 w-1.5 rounded-full ${autoKey ? 'bg-amber-400' : 'bg-[#4b5563]'}`} />
          AUTO-KEY
        </button>

        <button
          type="button"
          onClick={() => setSnapFrames(!snapFrames)}
          className={`flex h-6 items-center gap-1.5 rounded border px-2 text-[9.5px] ${
            snapFrames
              ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300'
              : 'border-[#2a3038] bg-[#11141a] text-[#6b7280]'
          }`}
          title="Snap playhead and keys to frame boundaries"
        >
          SNAP FRAMES
        </button>

        {selectedId && availableProperties.length > 0 && (
          <select
            value=""
            onChange={(event) => {
              if (event.target.value) addPropertyToSelection(event.target.value);
            }}
            className="h-6 max-w-[130px] rounded border border-[#2a3038] bg-[#11141a] px-1 text-[9.5px] text-[#9aa4b2] outline-none"
            title="Add a property track at the playhead"
          >
            <option value="">+ Property…</option>
            {availableProperties.map((property) => (
              <option key={property} value={property}>
                {PROPERTY_LABELS[property] || property}
              </option>
            ))}
          </select>
        )}

        <div className="ml-auto flex items-center gap-1">
          {selectedKeys.length > 0 && (
            <>
              <span className="chip text-cyan-300">
                {selectedKeys.length} KEY{selectedKeys.length === 1 ? '' : 'S'}
              </span>
              <select
                value={selectedInterp}
                onChange={(event) => {
                  const interp = event.target.value as Interpolation;
                  for (const key of selectedKeys) setKeyInterp(key.trackId, key.keyId, interp);
                }}
                className="h-6 rounded border border-[#2a3038] bg-[#11141a] px-1 text-[9.5px] text-amber-300 outline-none"
                title="Interpolation for every selected keyframe"
              >
                {selectedInterp === '' && <option value="">Mixed…</option>}
                <option value="bezier">Bezier</option>
                <option value="ease">Ease</option>
                <option value="linear">Linear</option>
                <option value="step">Step</option>
              </select>
              <button
                type="button"
                className="icon-btn hover:!text-red-400"
                onClick={() => removeSelectedKeys()}
                title="Delete selected keyframes (Delete)"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
              <div className="mx-1 h-5 w-px bg-[#2a3038]" />
            </>
          )}
          {selectedKeyData && selectedKeys.length <= 1 && (
            <span className="chip hidden text-amber-300 xl:inline">
              {PROPERTY_LABELS[selectedKeyData.track.property] || selectedKeyData.track.property} ·{' '}
              {formatValue(selectedKeyData.key.value, selectedKeyData.track.property)} @{' '}
              {selectedKeyData.key.time.toFixed(2)}s
            </span>
          )}
          <button
            type="button"
            className="icon-btn"
            onClick={() => {
              const body = bodyRef.current;
              const next = clampPps(pps / 1.3);
              setPps(next);
              if (body) {
                const laneWidth = Math.max(200, body.clientWidth - LABEL_WIDTH);
                const centerTime = (body.scrollLeft + laneWidth / 2) / pps;
                window.requestAnimationFrame(() => {
                  body.scrollLeft = Math.max(0, centerTime * next - laneWidth / 2);
                });
              }
            }}
            title="Zoom out (Shift+wheel)"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => {
              const body = bodyRef.current;
              const next = clampPps(pps * 1.3);
              setPps(next);
              if (body) {
                const laneWidth = Math.max(200, body.clientWidth - LABEL_WIDTH);
                const centerTime = (body.scrollLeft + laneWidth / 2) / pps;
                window.requestAnimationFrame(() => {
                  body.scrollLeft = Math.max(0, centerTime * next - laneWidth / 2);
                });
              }
            }}
            title="Zoom in (Shift+wheel)"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Dope sheet */}
      <div ref={bodyRef} className="min-h-0 flex-1 overflow-auto">
        <div
          ref={contentRef}
          className="relative select-none"
          style={{ width: LABEL_WIDTH + contentWidth }}
          onPointerDown={marqueeStart}
        >
          {/* Ruler */}
          <div
            className="sticky top-0 z-30 flex bg-[#0b0d10]/95 backdrop-blur"
            style={{ height: RULER_HEIGHT }}
          >
            <div
              className="sticky left-0 z-40 flex flex-shrink-0 items-center justify-between border-b border-r border-[#232830] bg-[#0b0d10] px-2"
              style={{ width: LABEL_WIDTH }}
            >
              <span className="text-[8.5px] font-bold uppercase tracking-[0.12em] text-[#4b5563]">
                Tracks
              </span>
              <span
                className="font-mono text-[8px] text-[#4b5563]"
                title="Hold a row and drag to reorder it"
              >
                hold to reorder · {Math.round(pps)}px/s
              </span>
            </div>
            <div
              ref={rulerRef}
              className="relative flex-1 cursor-ew-resize border-b border-[#232830]"
              style={{ width: contentWidth }}
              onPointerDown={startScrub}
              onDoubleClick={() => {
                setPps(110);
                if (bodyRef.current) bodyRef.current.scrollLeft = 0;
              }}
              title="Drag to scrub · Shift+drag to magnify a range · Shift+wheel zoom · Alt+wheel pan · double-click to reset zoom"
            >
              {ticks.map((tick) => (
                <div
                  key={tick.time}
                  className="absolute bottom-0 top-0"
                  style={{ left: tick.time * pps }}
                >
                  <div
                    className={`absolute bottom-0 w-px ${
                      tick.major ? 'h-2.5 bg-[#4b5563]' : 'h-1.5 bg-[#2a3038]'
                    }`}
                  />
                  {tick.major && (
                    <span className="absolute left-1 top-1 font-mono text-[8.5px] text-[#5f6a78]">
                      {tick.time}s
                    </span>
                  )}
                </div>
              ))}
              {zoomRegion && (
                <div
                  className="pointer-events-none absolute inset-y-0 border-x border-cyan-400/70 bg-cyan-400/15"
                  style={{
                    left: Math.min(zoomRegion.start, zoomRegion.current) * pps,
                    width: Math.abs(zoomRegion.current - zoomRegion.start) * pps
                  }}
                />
              )}
              <div
                className="pointer-events-none absolute top-0 z-10 h-full w-px bg-cyan-400"
                style={{ left: time * pps }}
              >
                <div className="absolute -left-[3px] top-0 h-2 w-2 rotate-45 bg-cyan-400" />
              </div>
            </div>
          </div>

          {objects.length === 0 && (
            <div className="flex h-28 items-center justify-center">
              <div className="text-center">
                <Diamond className="mx-auto mb-2 h-5 w-5 text-[#2a3038]" />
                <p className="text-[10.5px] text-[#5f6a78]">
                  No animated objects yet. Select an object and key its properties to build a timeline.
                </p>
              </div>
            </div>
          )}

          {objects.map((object, objectIndex) => {
            const objectTracks = project.tracks.filter((track) => track.objectId === object.id);
            const isCollapsed = collapsed[object.id];
            const isSelected = selectedId === object.id;
            const isOrderSource = orderDrag?.id === object.id;
            const isOrderTarget = orderDrag?.targetIndex === objectIndex && !isOrderSource;
            return (
              <div
                key={object.id}
                data-object-id={object.id}
                className={`relative ${isOrderSource ? 'z-10 opacity-80' : ''}`}
              >
                {isOrderTarget && (
                  <div className="pointer-events-none absolute left-0 right-0 top-0 z-30 h-[2px] bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.7)]" />
                )}
                <div
                  className={`flex border-b border-[#161a20] ${
                    isOrderSource
                      ? 'bg-cyan-500/[0.09] ring-1 ring-inset ring-cyan-400/40'
                      : isSelected
                        ? 'bg-cyan-500/[0.04]'
                        : 'bg-[#0e1014]'
                  }`}
                  style={{ height: ROW_HEIGHT }}
                >
                  <button
                    type="button"
                    onPointerDown={(event) => beginOrderPress(event, object.id)}
                    onClick={() => setSelected(object.id)}
                    className="sticky left-0 z-20 flex flex-shrink-0 cursor-grab items-center gap-1 border-r border-[#232830] bg-[#0e1014] px-1.5 text-left hover:bg-[#151920] active:cursor-grabbing"
                    style={{ width: LABEL_WIDTH }}
                    title="Click to select · hold and drag to reorder tracks"
                  >
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(event) => {
                        event.stopPropagation();
                        setCollapsed((prev) => ({ ...prev, [object.id]: !prev[object.id] }));
                      }}
                      onKeyDown={() => undefined}
                      className="text-[#5f6a78] hover:text-white"
                    >
                      {isCollapsed ? (
                        <ChevronRight className="h-2.5 w-2.5" />
                      ) : (
                        <ChevronDown className="h-2.5 w-2.5" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[10.5px] font-semibold text-[#cbd5e1]">
                      {object.name}
                    </span>
                    <span className="font-mono text-[8px] text-[#4b5563]">{objectTracks.length}</span>
                  </button>
                  <div className="relative flex-1" style={{ width: contentWidth }}>
                    {[...new Set(objectTracks.flatMap((track) => track.keys.map((key) => key.time)))].map(
                      (keyTime) => (
                        <div
                          key={keyTime}
                          className="pointer-events-none absolute top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[1px] bg-amber-400/60"
                          style={{ left: keyTime * pps }}
                          title={`${keyTime.toFixed(2)}s`}
                        />
                      )
                    )}
                  </div>
                </div>

                {!isCollapsed &&
                  objectTracks.map((track) => (
                    <div
                      key={track.id}
                      className={`timeline-row border-b border-[#12161c] ${
                        isSelected ? 'bg-cyan-500/[0.02]' : ''
                      }`}
                    >
                      <div
                        className="sticky left-0 z-20 flex flex-shrink-0 items-center justify-between gap-1 border-r border-[#1d222a] bg-[#0b0d10] pl-7 pr-1.5"
                        style={{ width: LABEL_WIDTH }}
                      >
                        <span className="truncate text-[9.5px] text-[#7b8595]">
                          {isColorProperty(track.property) && (
                            <span className="mr-1 inline-block h-2 w-2 rounded-full bg-gradient-to-br from-rose-400 to-cyan-400 align-middle" />
                          )}
                          {PROPERTY_LABELS[track.property] || track.property}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeTrack(track.id)}
                          className="text-[#3f4854] hover:text-red-400"
                          title="Remove curve"
                        >
                          <Trash2 className="h-2.5 w-2.5" />
                        </button>
                      </div>
                      <div
                        className="relative flex-1 cursor-crosshair"
                        style={{ width: contentWidth }}
                        onDoubleClick={(event) => addKeyAtClick(event, object, track.id, track.property)}
                        title="Double-click to add a keyframe · drag empty space to box-select"
                      >
                        {track.keys.map((key) => {
                          const isKeySelected = selectedSignatures.has(`${track.id}:${key.id}`);
                          return (
                            <div
                              key={key.id}
                              className={`key-diamond ${isKeySelected ? 'selected' : ''}`}
                              style={{ left: key.time * pps }}
                              title={`${formatValue(key.value, track.property)} @ ${key.time.toFixed(2)}s · ${key.interp} · drag to retime`}
                              onPointerDown={(event) =>
                                beginKeyDrag(event, track.id, key.id, key.time)
                              }
                              onDoubleClick={(event) => {
                                event.stopPropagation();
                                setSelectedKey({ trackId: track.id, keyId: key.id });
                                seek(key.time);
                              }}
                            />
                          );
                        })}
                      </div>
                    </div>
                  ))}

                {!isCollapsed && objectTracks.length === 0 && (
                  <div className="flex" style={{ height: ROW_HEIGHT }}>
                    <div
                      className="sticky left-0 z-20 flex flex-shrink-0 items-center border-r border-[#1d222a] bg-[#0b0d10] pl-7 text-[9px] text-[#3f4854]"
                      style={{ width: LABEL_WIDTH }}
                    >
                      No keyframes
                    </div>
                    <div className="flex-1" style={{ width: contentWidth }} />
                  </div>
                )}
              </div>
            );
          })}

          {/* Playhead line */}
          <div
            className="pointer-events-none absolute bottom-0 z-10 w-px bg-cyan-400/55"
            style={{ left: LABEL_WIDTH + time * pps, top: RULER_HEIGHT }}
          />

          {/* Box selection overlay */}
          {marquee && (
            <div
              className="pointer-events-none absolute z-40 border border-cyan-400/80 bg-cyan-400/10"
              style={{
                left: Math.min(marquee.x0, marquee.x1),
                top: Math.min(marquee.y0, marquee.y1),
                width: Math.abs(marquee.x1 - marquee.x0),
                height: Math.abs(marquee.y1 - marquee.y0)
              }}
            />
          )}
        </div>
      </div>

      <div className="flex h-6 flex-shrink-0 items-center justify-between border-t border-[#232830] bg-[#0b0d10] px-2.5 font-mono text-[8.5px] text-[#4b5563]">
        <span>
          {project.tracks.length} curves · {project.tracks.reduce((total, track) => total + track.keys.length, 0)} keys
          {selectedKeys.length > 0 && <span className="text-cyan-400"> · {selectedKeys.length} selected</span>}
        </span>
        <span>              Drag diamonds · Shift-click add · drag empty lane box-select · Shift+wheel zoom · Alt+wheel pan · double-click lane add key
        </span>
      </div>
    </div>
  );
};
