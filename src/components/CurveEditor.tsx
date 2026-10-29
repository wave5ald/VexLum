import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ClipboardPaste,
  Copy,
  Eye,
  EyeOff,
  Gauge,
  Maximize2,
  Spline,
  Trash2
} from 'lucide-react';
import { useEditorStore } from '../editor/store';
import { keyInfluence, keyTangent, sampleSpeed, sampleTrack, sortedKeys } from '../editor/animation';
import {
  createGraphClipboard,
  readGraphClipboard,
  writeGraphClipboard
} from '../editor/graphClipboard';
import {
  Interpolation,
  PROPERTY_COLORS,
  PROPERTY_LABELS,
  Track,
  isBooleanProperty,
  isColorProperty
} from '../editor/types';

type GraphMode = 'value' | 'speed';

interface ViewBox {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

const PAD_LEFT = 52;
const PAD_RIGHT = 16;
const PAD_TOP = 14;
const PAD_BOTTOM = 24;
const MENU_ITEM =
  'flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[10px] text-[#cbd5e1] transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-35';

export const CurveEditor: React.FC = () => {
  const project = useEditorStore((state) => state.project);
  const selectedId = useEditorStore((state) => state.selectedId);
  const selectedKey = useEditorStore((state) => state.selectedKey);
  const selectedKeys = useEditorStore((state) => state.selectedKeys);
  const time = useEditorStore((state) => state.time);
  const updateKey = useEditorStore((state) => state.updateKey);
  const removeKey = useEditorStore((state) => state.removeKey);
  const removeSelectedKeys = useEditorStore((state) => state.removeSelectedKeys);
  const setSelectedKey = useEditorStore((state) => state.setSelectedKey);
  const selectKeys = useEditorStore((state) => state.selectKeys);
  const clearKeySelection = useEditorStore((state) => state.clearKeySelection);
  const setKeyTangent = useEditorStore((state) => state.setKeyTangent);
  const setKeyInfluence = useEditorStore((state) => state.setKeyInfluence);
  const resetKeyTangent = useEditorStore((state) => state.resetKeyTangent);
  const seek = useEditorStore((state) => state.seek);
  const graphZoom = useEditorStore((state) => state.graphZoom);
  const graphZoomSeq = useEditorStore((state) => state.graphZoomSeq);
  const reportGraphZoom = useEditorStore((state) => state.reportGraphZoom);
  const beginInteraction = useEditorStore((state) => state.beginInteraction);
  const endInteraction = useEditorStore((state) => state.endInteraction);
  const setToast = useEditorStore((state) => state.setToast);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hoveringRef = useRef(false);
  const [size, setSize] = useState({ width: 800, height: 240 });
  const [objectId, setObjectId] = useState<string>('');
  const [visibleTracks, setVisibleTracks] = useState<Record<string, boolean>>({});
  const [mode, setMode] = useState<GraphMode>('value');
  const [view, setView] = useState<ViewBox>({ xMin: 0, xMax: 8, yMin: -1, yMax: 4 });
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const [drag, setDrag] = useState<{ trackId: string; keyId: string } | null>(null);
  const [handleDrag, setHandleDrag] = useState<{
    trackId: string;
    keyId: string;
    side: 'in' | 'out';
    keyTime: number;
    span: number;
    baseValue: number;
  } | null>(null);
  const [pan, setPan] = useState<{ x: number; y: number; view: ViewBox } | null>(null);
  const [scrub, setScrub] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; trackId: string | null } | null>(
    null
  );

  const objectTracks = useMemo(
    () =>
      project.tracks.filter(
        (track) =>
          track.objectId === objectId &&
          !isColorProperty(track.property) &&
          !isBooleanProperty(track.property)
      ),
    [project.tracks, objectId]
  );

  const objectsWithTracks = useMemo(() => {
    const ids = [...new Set(project.tracks.map((track) => track.objectId))];
    return ids
      .map((id) => project.objects.find((object) => object.id === id))
      .filter((object): object is NonNullable<typeof object> => Boolean(object));
  }, [project.tracks, project.objects]);

  // Include the selected object even before it has curves so copied graphs can
  // be pasted onto a completely fresh object.
  const selectableObjects = useMemo(() => {
    const list = [...objectsWithTracks];
    const selected = project.objects.find((object) => object.id === selectedId);
    if (selected && !list.some((object) => object.id === selected.id)) list.unshift(selected);
    return list;
  }, [objectsWithTracks, project.objects, selectedId]);

  // Workspace slider: widen or contract the visible time span around centre.
  const lastZoomSeq = useRef(0);
  useEffect(() => {
    if (graphZoomSeq === lastZoomSeq.current) return;
    lastZoomSeq.current = graphZoomSeq;
    const span = Math.max(0.1, project.timeline.duration / Math.max(0.05, graphZoom));
    setView((prev) => {
      const center = (prev.xMin + prev.xMax) / 2;
      return { ...prev, xMin: center - span / 2, xMax: center + span / 2 };
    });
  }, [graphZoomSeq, graphZoom, project.timeline.duration]);

  // Keep the slider readout honest when the graph is zoomed with the wheel.
  useEffect(() => {
    const span = view.xMax - view.xMin;
    if (span > 0.05) reportGraphZoom(project.timeline.duration / span);
  }, [view.xMin, view.xMax, project.timeline.duration, reportGraphZoom]);

  const lastSelectedId = useRef<string | null>(null);
  useEffect(() => {
    const selectionChanged = selectedId !== lastSelectedId.current;
    lastSelectedId.current = selectedId;
    if (
      selectionChanged &&
      selectedId &&
      project.objects.some((object) => object.id === selectedId)
    ) {
      setObjectId(selectedId);
      return;
    }
    if (objectId && selectableObjects.some((object) => object.id === objectId)) return;
    setObjectId(selectableObjects[0]?.id || '');
  }, [selectableObjects, selectedId, objectId, project.objects]);

  useEffect(() => {
    const map: Record<string, boolean> = {};
    for (const track of objectTracks) map[track.id] = true;
    setVisibleTracks(map);
  }, [objectId, project.tracks.length]);

  const selectedSignatures = useMemo(
    () => new Set(selectedKeys.map((key) => `${key.trackId}:${key.keyId}`)),
    [selectedKeys]
  );

  const visibleObjectTracks = useMemo(
    () => objectTracks.filter((track) => visibleTracks[track.id] !== false),
    [objectTracks, visibleTracks]
  );

  const visibleSignature = useMemo(
    () => visibleObjectTracks.map((track) => track.id).sort().join('|'),
    [visibleObjectTracks]
  );

  /**
   * Fit the view to the curves that are actually drawn. The Y range is taken
   * from the sampled curve (so bezier overshoot and eased sections are
   * included, not just the keyframe values) and then scaled to fill the whole
   * plot area. Hidden curves are ignored.
   */
  const computeFit = useCallback(
    (tracks: Track[], duration: number, graphMode: GraphMode): ViewBox => {
      let min = Number.POSITIVE_INFINITY;
      let max = Number.NEGATIVE_INFINITY;
      const span = Math.max(0.01, duration);
      for (const track of tracks) {
        const samples = 160;
        for (let i = 0; i <= samples; i++) {
          const t = (span * i) / samples;
          const value = graphMode === 'speed' ? sampleSpeed(track, t) : Number(sampleTrack(track, t, 0));
          if (!Number.isFinite(value)) continue;
          min = Math.min(min, value);
          max = Math.max(max, value);
        }
        if (graphMode === 'speed') {
          min = Math.min(min, 0);
          max = Math.max(max, 0);
        }
        if (graphMode === 'value') {
          for (const key of track.keys) {
            const value = typeof key.value === 'number' ? key.value : parseFloat(String(key.value));
            if (!Number.isFinite(value)) continue;
            min = Math.min(min, value);
            max = Math.max(max, value);
          }
        }
      }
      if (!Number.isFinite(min) || !Number.isFinite(max)) {
        min = -1;
        max = 1;
      }
      if (Math.abs(max - min) < 0.0001) {
        min -= 0.5;
        max += 0.5;
      }
      // A shallow margin keeps the extremes visible while the graph still
      // fills the panel instead of hugging a narrow band of keyframe values.
      const padding = (max - min) * 0.08;
      return {
        xMin: 0,
        xMax: Math.max(1, duration),
        yMin: min - padding,
        yMax: max + padding
      };
    },
    []
  );

  const fitView = useCallback(
    (tracks?: Track[]) => {
      const list = tracks && tracks.length ? tracks : visibleObjectTracks;
      setView(
        computeFit(list.length ? list : objectTracks, project.timeline.duration, mode)
      );
    },
    [computeFit, objectTracks, visibleObjectTracks, project.timeline.duration, mode]
  );

  useEffect(() => {
    if (!objectTracks.length) return;
    // Refit when the object, mode, duration or the set of visible curves
    // changes. Editing keys must never move the view under the cursor.
    fitView();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objectId, mode, project.timeline.duration, visibleSignature]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => {
      const rect = container.getBoundingClientRect();
      setSize({ width: Math.max(200, rect.width), height: Math.max(140, rect.height) });
    });
    observer.observe(container);
    const rect = container.getBoundingClientRect();
    setSize({ width: Math.max(200, rect.width), height: Math.max(140, rect.height) });
    return () => observer.disconnect();
  }, []);

  const plotWidth = Math.max(20, size.width - PAD_LEFT - PAD_RIGHT);
  const plotHeight = Math.max(20, size.height - PAD_TOP - PAD_BOTTOM);
  const xToPx = (value: number) =>
    PAD_LEFT + ((value - view.xMin) / Math.max(0.000001, view.xMax - view.xMin)) * plotWidth;
  const yToPx = (value: number) =>
    PAD_TOP + ((view.yMax - value) / Math.max(0.000001, view.yMax - view.yMin)) * plotHeight;
  const pxToX = (px: number) =>
    view.xMin + ((px - PAD_LEFT) / Math.max(1, plotWidth)) * (view.xMax - view.xMin);
  const pxToY = (py: number) =>
    view.yMax - ((py - PAD_TOP) / Math.max(1, plotHeight)) * (view.yMax - view.yMin);

  const selectedKeyData = useMemo(() => {
    if (!selectedKey) return null;
    const track = project.tracks.find((item) => item.id === selectedKey.trackId);
    const key = track?.keys.find((item) => item.id === selectedKey.keyId);
    return track && key ? { track, key } : null;
  }, [selectedKey, project.tracks]);

  /** Screen position of a bezier tangent handle for a key. */
  const handlePosition = useCallback(
    (track: Track, keyId: string, side: 'in' | 'out') => {
      const keys = sortedKeys(track);
      const index = keys.findIndex((key) => key.id === keyId);
      if (index < 0) return null;
      const key = keys[index];
      const value = Number(key.value);
      if (!Number.isFinite(value)) return null;
      const neighbour = side === 'out' ? keys[index + 1] : keys[index - 1];
      if (!neighbour) return null;
      const span = Math.abs(neighbour.time - key.time);
      if (span < 1e-5) return null;
      const dt = Math.max(0.02, span * keyInfluence(key, side));
      const slope = keyTangent(key, keys, index, side);
      return {
        keyTime: key.time,
        value,
        dt,
        span,
        slope,
        time: side === 'out' ? key.time + dt : key.time - dt,
        handleValue: side === 'out' ? value + slope * dt : value - slope * dt
      };
    },
    []
  );

  // Draw graph
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(size.width * dpr);
    canvas.height = Math.round(size.height * dpr);
    canvas.style.width = `${size.width}px`;
    canvas.style.height = `${size.height}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.width, size.height);
    ctx.fillStyle = '#0a0c0f';
    ctx.fillRect(0, 0, size.width, size.height);

    // Grid
    ctx.strokeStyle = '#171c23';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#566171';
    ctx.font = '9px "Cascadia Code", Consolas, monospace';
    const gridX = 8;
    const gridY = 6;
    for (let i = 0; i <= gridX; i++) {
      const x = PAD_LEFT + (plotWidth * i) / gridX;
      ctx.beginPath();
      ctx.moveTo(x, PAD_TOP);
      ctx.lineTo(x, PAD_TOP + plotHeight);
      ctx.stroke();
      const value = view.xMin + ((view.xMax - view.xMin) * i) / gridX;
      ctx.textAlign = 'center';
      ctx.fillText(`${value.toFixed(2)}s`, x, size.height - 8);
    }
    for (let i = 0; i <= gridY; i++) {
      const y = PAD_TOP + (plotHeight * i) / gridY;
      ctx.beginPath();
      ctx.moveTo(PAD_LEFT, y);
      ctx.lineTo(PAD_LEFT + plotWidth, y);
      ctx.stroke();
      const value = view.yMax - ((view.yMax - view.yMin) * i) / gridY;
      const label =
        mode === 'speed'
          ? `${Math.abs(value) < 0.005 ? '0.00' : value.toFixed(2)}`
          : value.toFixed(Math.abs(value) < 10 ? 2 : 1);
      ctx.textAlign = 'right';
      ctx.fillText(label, PAD_LEFT - 6, y + 3);
    }
    if (mode === 'speed') {
      ctx.fillStyle = '#6b7280';
      ctx.textAlign = 'left';
      ctx.fillText('units / sec', PAD_LEFT + 4, PAD_TOP + 10);
    }

    // Plot border
    ctx.strokeStyle = '#2a3038';
    ctx.strokeRect(PAD_LEFT, PAD_TOP, plotWidth, plotHeight);

    const tracks = objectTracks.filter((track) => visibleTracks[track.id] !== false);
    const samples = Math.max(80, Math.floor(plotWidth / 2));

    for (const track of tracks) {
      const color = PROPERTY_COLORS[track.property] || '#38bdf8';
      const hasSelection = track.keys.some((key) =>
        selectedSignatures.has(`${track.id}:${key.id}`)
      );
      ctx.strokeStyle = color;
      ctx.lineWidth = hasSelection ? 2.1 : 1.5;
      ctx.globalAlpha = hasSelection ? 1 : 0.75;
      ctx.beginPath();
      for (let i = 0; i <= samples; i++) {
        const t = view.xMin + ((view.xMax - view.xMin) * i) / samples;
        const value =
          mode === 'speed' ? sampleSpeed(track, t) : Number(sampleTrack(track, t, 0));
        const x = xToPx(t);
        const y = yToPx(value);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Keys
      for (const key of track.keys) {
        const value =
          mode === 'speed' ? sampleSpeed(track, key.time) : Number(key.value);
        if (!Number.isFinite(value)) continue;
        const x = xToPx(key.time);
        const y = yToPx(value);
        if (x < PAD_LEFT - 8 || x > PAD_LEFT + plotWidth + 8) continue;
        if (y < PAD_TOP - 8 || y > PAD_TOP + plotHeight + 8) continue;
        const isSelected = selectedSignatures.has(`${track.id}:${key.id}`);

        if (mode === 'value' && isSelected && key.interp === 'bezier') {
          for (const side of ['in', 'out'] as const) {
            const handle = handlePosition(track, key.id, side);
            if (!handle) continue;
            const hx = xToPx(handle.time);
            const hy = yToPx(handle.handleValue);
            ctx.strokeStyle = 'rgba(251, 191, 36, 0.65)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(hx, hy);
            ctx.stroke();
            ctx.fillStyle = '#fbbf24';
            ctx.beginPath();
            ctx.arc(hx, hy, 3.4, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#08090b';
            ctx.stroke();
          }
        }

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = isSelected ? '#67e8f9' : color;
        ctx.fillRect(-3.6, -3.6, 7.2, 7.2);
        ctx.strokeStyle = '#08090b';
        ctx.lineWidth = 1;
        ctx.strokeRect(-3.6, -3.6, 7.2, 7.2);
        ctx.restore();

        if (mode === 'speed') {
          ctx.fillStyle = 'rgba(148, 163, 184, 0.6)';
          ctx.font = '8px "Cascadia Code", Consolas, monospace';
          ctx.textAlign = 'left';
          ctx.fillText(
            Math.abs(value) < 0.005 ? '0.00' : value.toFixed(2),
            x + 6,
            y - 6
          );
        }
      }
    }

    // Playhead
    const playheadX = xToPx(time);
    if (playheadX >= PAD_LEFT - 1 && playheadX <= PAD_LEFT + plotWidth + 1) {
      ctx.strokeStyle = 'rgba(34, 211, 238, 0.65)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(playheadX, PAD_TOP);
      ctx.lineTo(playheadX, PAD_TOP + plotHeight);
      ctx.stroke();
      ctx.fillStyle = 'rgba(34, 211, 238, 0.08)';
      ctx.fillRect(PAD_LEFT, PAD_TOP, playheadX - PAD_LEFT, plotHeight);
    }

    // Hover crosshair + readout
    if (hover) {
      const hoverTime = pxToX(hover.x);
      const hoverValue = pxToY(hover.y);
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.28)';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(hover.x, PAD_TOP);
      ctx.lineTo(hover.x, PAD_TOP + plotHeight);
      ctx.moveTo(PAD_LEFT, hover.y);
      ctx.lineTo(PAD_LEFT + plotWidth, hover.y);
      ctx.stroke();
      ctx.setLineDash([]);
      const text = `${hoverTime.toFixed(2)}s  ${hoverValue.toFixed(2)}${mode === 'speed' ? '/s' : ''}`;
      ctx.font = '9px "Cascadia Code", Consolas, monospace';
      const textWidth = ctx.measureText(text).width;
      const boxX = Math.min(hover.x + 8, size.width - textWidth - 16);
      const boxY = Math.max(4, hover.y - 20);
      ctx.fillStyle = 'rgba(15, 17, 21, 0.92)';
      ctx.fillRect(boxX, boxY, textWidth + 10, 16);
      ctx.strokeStyle = '#2a3038';
      ctx.strokeRect(boxX, boxY, textWidth + 10, 16);
      ctx.fillStyle = '#9aa4b2';
      ctx.textAlign = 'left';
      ctx.fillText(text, boxX + 5, boxY + 11);
    }
  }, [
    size,
    view,
    objectTracks,
    visibleTracks,
    time,
    selectedSignatures,
    hover,
    mode,
    handlePosition
  ]);

  const nearestKey = (x: number, y: number) => {
    for (const track of objectTracks.filter((item) => visibleTracks[item.id] !== false)) {
      for (const key of track.keys) {
        const value = mode === 'speed' ? sampleSpeed(track, key.time) : Number(key.value);
        if (Math.abs(xToPx(key.time) - x) <= 7 && Math.abs(yToPx(value) - y) <= 7) {
          return { track, key };
        }
      }
    }
    return null;
  };

  const nearestHandle = (x: number, y: number) => {
    if (mode !== 'value') return null;
    for (const track of objectTracks.filter((item) => visibleTracks[item.id] !== false)) {
      for (const key of track.keys) {
        if (!selectedSignatures.has(`${track.id}:${key.id}`)) continue;
        if (key.interp !== 'bezier') continue;
        for (const side of ['in', 'out'] as const) {
          const handle = handlePosition(track, key.id, side);
          if (!handle) continue;
          if (
            Math.abs(xToPx(handle.time) - x) <= 6 &&
            Math.abs(yToPx(handle.handleValue) - y) <= 6
          ) {
            return { track, key, side, dt: handle.dt, span: handle.span };
          }
        }
      }
    }
    return null;
  };

  /** The curve closest to a screen point, used by the right-click menu. */
  const nearestCurve = (x: number, y: number): Track | null => {
    let best: { track: Track; distance: number } | null = null;
    const at = pxToX(x);
    for (const track of objectTracks) {
      if (visibleTracks[track.id] === false) continue;
      const value =
        mode === 'speed' ? sampleSpeed(track, at) : Number(sampleTrack(track, at, 0));
      if (!Number.isFinite(value)) continue;
      const distance = Math.abs(yToPx(value) - y);
      if (distance > 14) continue;
      if (!best || distance < best.distance) best = { track, distance };
    }
    return best?.track || null;
  };

  const canvasPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  useEffect(() => {
    if (!drag) return;
    const move = (event: PointerEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      let nextTime = Math.max(0, Math.min(project.timeline.duration, pxToX(x)));
      if (event.shiftKey) nextTime = Math.round(nextTime * project.timeline.fps) / project.timeline.fps;
      if (!useEditorStore.getState().interactionStart) beginInteraction();
      if (mode === 'speed') {
        updateKey(drag.trackId, drag.keyId, { time: nextTime, interp: 'bezier' }, false);
        const slope = pxToY(y);
        setKeyTangent(drag.trackId, drag.keyId, 'in', slope, false);
        setKeyTangent(drag.trackId, drag.keyId, 'out', slope, false);
      } else {
        updateKey(
          drag.trackId,
          drag.keyId,
          { time: nextTime, value: pxToY(y) },
          false
        );
      }
    };
    const up = () => {
      endInteraction();
      setDrag(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [drag, pxToX, pxToY, project.timeline.duration, project.timeline.fps, mode, updateKey, setKeyTangent, beginInteraction, endInteraction]);

  useEffect(() => {
    if (!handleDrag) return;
    const move = (event: PointerEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const value = pxToY(y);
      const span = Math.max(0.02, handleDrag.span);
      // Horizontal movement stretches the handle (its influence on the
      // segment), vertical movement bends its slope. Both drive the curve.
      const rawDelta =
        handleDrag.side === 'out'
          ? pxToX(x) - handleDrag.keyTime
          : handleDrag.keyTime - pxToX(x);
      const reach = Math.max(0.02, Math.min(span * 0.93, Math.abs(rawDelta)));
      const slope =
        handleDrag.side === 'out'
          ? (value - handleDrag.baseValue) / reach
          : (handleDrag.baseValue - value) / reach;
      if (!useEditorStore.getState().interactionStart) beginInteraction();
      setKeyInfluence(
        handleDrag.trackId,
        handleDrag.keyId,
        handleDrag.side,
        reach / span,
        false
      );
      setKeyTangent(handleDrag.trackId, handleDrag.keyId, handleDrag.side, slope, false);
    };
    const up = () => {
      endInteraction();
      setHandleDrag(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [
    handleDrag,
    pxToX,
    pxToY,
    setKeyTangent,
    setKeyInfluence,
    beginInteraction,
    endInteraction
  ]);

  // Playhead scrub: drag the cyan line sideways to sample the curves over time.
  useEffect(() => {
    if (!scrub) return;
    const move = (event: PointerEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      let next = pxToX(event.clientX - rect.left);
      if (event.shiftKey) next = Math.round(next * project.timeline.fps) / project.timeline.fps;
      seek(Math.max(0, Math.min(project.timeline.duration, next)));
    };
    const up = () => setScrub(false);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [scrub, pxToX, seek, project.timeline.duration, project.timeline.fps]);

  useEffect(() => {
    if (!pan) return;
    const move = (event: PointerEvent) => {
      const dx = event.clientX - pan.x;
      const dy = event.clientY - pan.y;
      const xRange = pan.view.xMax - pan.view.xMin;
      const yRange = pan.view.yMax - pan.view.yMin;
      setView({
        xMin: pan.view.xMin - (dx / Math.max(1, plotWidth)) * xRange,
        xMax: pan.view.xMax - (dx / Math.max(1, plotWidth)) * xRange,
        yMin: pan.view.yMin + (dy / Math.max(1, plotHeight)) * yRange,
        yMax: pan.view.yMax + (dy / Math.max(1, plotHeight)) * yRange
      });
    };
    const up = () => setPan(null);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [pan, plotWidth, plotHeight]);

  const copyGraph = useCallback(() => {
    const state = useEditorStore.getState();
    const visible = objectTracks.filter((track) => visibleTracks[track.id] !== false);
    const fallback = (visible.length ? visible : objectTracks).map((track) => track.id);
    const clipboard = createGraphClipboard(state.project.tracks, state.selectedKeys, fallback);
    if (!clipboard) {
      state.setToast('Select keyframes or show a curve to copy', 'info');
      return;
    }
    writeGraphClipboard(clipboard);
    state.setToast(
      `Copied ${clipboard.keys.length} key${clipboard.keys.length === 1 ? '' : 's'}`,
      'success'
    );
  }, [objectTracks, visibleTracks]);

  /** Copies every key of one curve so it can be pasted onto another object. */
  const copyCurve = useCallback((trackId: string) => {
    const state = useEditorStore.getState();
    const track = state.project.tracks.find((item) => item.id === trackId);
    if (!track || !track.keys.length) {
      state.setToast('This curve has no keys to copy', 'info');
      return;
    }
    const clipboard = createGraphClipboard(state.project.tracks, [], [trackId]);
    if (!clipboard) {
      state.setToast('This curve has no keys to copy', 'info');
      return;
    }
    writeGraphClipboard(clipboard);
    const label = PROPERTY_LABELS[track.property] || track.property;
    state.setToast(`Copied the ${label} curve · ${clipboard.keys.length} keys`, 'success');
  }, []);

  const pasteGraph = useCallback(async () => {
    const state = useEditorStore.getState();
    const target = objectId || state.selectedId;
    if (!target) {
      state.setToast('Select an object before pasting keys', 'error');
      return;
    }
    const selectedTrack = state.selectedKeys
      .map((key) => state.project.tracks.find((track) => track.id === key.trackId))
      .find((track) => track?.objectId === target);
    const fallbackTrack = objectTracks.find((track) => visibleTracks[track.id] !== false);
    const clipboard = await readGraphClipboard({
      fps: state.project.timeline.fps,
      targetProperty: selectedTrack?.property || fallbackTrack?.property
    });
    if (!clipboard) {
      state.setToast('Clipboard has no keyframe data', 'error');
      return;
    }
    const pasted = state.pasteGraphClipboard(target, clipboard, state.time);
    if (!pasted.length) {
      state.setToast('No keys were pasted', 'error');
      return;
    }
    state.setToast(
      `Pasted ${pasted.length} key${pasted.length === 1 ? '' : 's'} at ${state.time.toFixed(2)}s`,
      'success'
    );
  }, [objectId, objectTracks, visibleTracks]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
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
      const mod = event.ctrlKey || event.metaKey;
      if (!mod || event.altKey) return;
      const canvas = canvasRef.current;
      const graphFocused = Boolean(canvas && document.activeElement === canvas);
      if (!hoveringRef.current && !graphFocused) return;
      const key = event.key.toLowerCase();
      if (key === 'c') {
        event.preventDefault();
        copyGraph();
      } else if (key === 'v') {
        event.preventDefault();
        void pasteGraph();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [copyGraph, pasteGraph]);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(null);
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [menu]);

  const handleWheel = (event: React.WheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const zoomBoth = event.ctrlKey || event.metaKey;
    const expandTime = event.shiftKey && !event.altKey;
    const factor = event.deltaY > 0 ? 1.15 : 0.87;

    // Shift + wheel expands or contracts the graph from both sides (the time
    // axis only), so you can widen a cramped curve without touching Y.
    if (expandTime) {
      const anchorX = pxToX(x);
      setView((prev) => ({
        ...prev,
        xMin: anchorX + (prev.xMin - anchorX) * factor,
        xMax: anchorX + (prev.xMax - anchorX) * factor
      }));
      return;
    }

    if (zoomBoth) {
      const anchorX = pxToX(x);
      const anchorY = pxToY(y);
      setView((prev) => ({
        xMin: anchorX + (prev.xMin - anchorX) * factor,
        xMax: anchorX + (prev.xMax - anchorX) * factor,
        yMin: anchorY + (prev.yMin - anchorY) * factor,
        yMax: anchorY + (prev.yMax - anchorY) * factor
      }));
      return;
    }

    // Plain wheel / trackpad pans the graph.
    const deltaX = event.deltaX;
    const deltaY = event.deltaY;
    setView((prev) => {
      const xStep = ((prev.xMax - prev.xMin) / Math.max(1, plotWidth)) * 1.1;
      const yStep = ((prev.yMax - prev.yMin) / Math.max(1, plotHeight)) * 1.1;
      return {
        xMin: prev.xMin + deltaX * xStep,
        xMax: prev.xMax + deltaX * xStep,
        yMin: prev.yMin + deltaY * yStep,
        yMax: prev.yMax + deltaY * yStep
      };
    });
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const { x, y } = canvasPoint(event);
    event.currentTarget.focus({ preventScroll: true });

    // Right click selects (and opens the graph menu) without moving the
    // playhead or the view. This is the After Effects graph-editor behaviour.
    if (event.button === 2) {
      event.preventDefault();
      event.stopPropagation();
      const hit = nearestKey(x, y);
      const curve = hit?.track || nearestCurve(x, y);
      if (hit) {
        const target = { trackId: hit.track.id, keyId: hit.key.id };
        if (event.shiftKey || event.ctrlKey || event.metaKey) selectKeys([target], 'toggle');
        else setSelectedKey(target);
      } else {
        clearKeySelection();
      }
      // Remember which curve was under the cursor so the menu can copy the
      // whole curve, even when you did not click exactly on a key.
      setMenu({ x: event.clientX, y: event.clientY, trackId: curve?.id ?? null });
      return;
    }

    // Empty-space left clicks never seek or move the graph. A left drag pans
    // freely on both axes; middle-drag or Alt+drag does the same.
    if (event.button === 1 || (event.button === 0 && event.altKey)) {
      event.preventDefault();
      setPan({ x: event.clientX, y: event.clientY, view });
      return;
    }
    if (event.button !== 0) return;
    event.preventDefault();

    const handle = nearestHandle(x, y);
    if (handle) {
      setSelectedKey({ trackId: handle.track.id, keyId: handle.key.id });
      setHandleDrag({
        trackId: handle.track.id,
        keyId: handle.key.id,
        side: handle.side,
        keyTime: handle.key.time,
        span: handle.span,
        baseValue: Number(handle.key.value)
      });
      return;
    }
    const hit = nearestKey(x, y);
    if (hit) {
      const additive = event.shiftKey || event.ctrlKey || event.metaKey;
      const signature = { trackId: hit.track.id, keyId: hit.key.id };
      if (additive) {
        const wasSelected = selectedSignatures.has(`${hit.track.id}:${hit.key.id}`);
        selectKeys([signature], 'toggle');
        if (!wasSelected) setDrag(signature);
      } else {
        if (!selectedSignatures.has(`${hit.track.id}:${hit.key.id}`)) {
          setSelectedKey(signature);
        }
        setDrag(signature);
      }
      return;
    }
    // Grab the playhead line to scrub time straight from the graph.
    if (Math.abs(xToPx(time) - x) <= 5) {
      setScrub(true);
      seek(Math.max(0, Math.min(project.timeline.duration, pxToX(x))));
      return;
    }

    // Dragging empty space pans the graph horizontally and vertically.
    clearKeySelection();
    setMenu(null);
    setPan({ x: event.clientX, y: event.clientY, view });
  };

  const selectedObject = project.objects.find((object) => object.id === objectId);
  const numericCount = objectTracks.length;

  const applyTangentReset = () => {
    for (const signature of selectedKeys) resetKeyTangent(signature.trackId, signature.keyId);
  };

  const applyInterpolation = (interp: Interpolation) => {
    if (!selectedKeys.length) return;
    beginInteraction();
    for (const item of selectedKeys) updateKey(item.trackId, item.keyId, { interp }, false);
    endInteraction();
    setMenu(null);
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#0b0d10]">
      <div className="flex h-10 flex-shrink-0 items-center gap-2 border-b border-[#232830] bg-[#0e1014] px-2.5">
        <Spline className="h-3.5 w-3.5 text-cyan-400" />
        <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#6b7280]">Curve Editor</span>
        <select
          value={objectId}
          onChange={(event) => setObjectId(event.target.value)}
          className="ml-1 h-6 max-w-[180px] rounded border border-[#2a3038] bg-[#11141a] px-1.5 text-[10px] text-[#cbd5e1] outline-none"
        >
          {selectableObjects.length === 0 && <option value="">No objects</option>}
          {selectableObjects.map((object) => (
            <option key={object.id} value={object.id}>
              {object.name}
              {objectsWithTracks.some((item) => item.id === object.id) ? '' : ' · no curves'}
            </option>
          ))}
        </select>

        <div className="flex overflow-hidden rounded border border-[#2a3038]">
          {(
            [
              ['value', 'Value', Spline],
              ['speed', 'Speed', Gauge]
            ] as const
          ).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              className={`flex h-6 items-center gap-1 px-2 text-[9.5px] font-medium transition-colors ${
                mode === value
                  ? 'bg-cyan-500/20 text-cyan-200'
                  : 'bg-[#11141a] text-[#6b7280] hover:text-[#cbd5e1]'
              }`}
              title={
                value === 'value'
                  ? 'Value graph: drag diamonds and tangent handles'
                  : 'Speed graph: drag a key up/down to set its easing speed'
              }
            >
              <Icon className="h-3 w-3" />
              {label}
            </button>
          ))}
        </div>

        <span className="hidden font-mono text-[8.5px] text-[#4b5563] md:inline">
          {selectedObject ? `${numericCount} numeric curves` : 'Key the camera or an object to begin'}
        </span>

        <div className="ml-auto flex items-center gap-1">
          {selectedKeyData && (
            <>
              <span className="chip text-amber-300">
                {PROPERTY_LABELS[selectedKeyData.track.property] || selectedKeyData.track.property} ·{' '}
                {selectedKeyData.key.time.toFixed(2)}s · {String(selectedKeyData.key.value).slice(0, 8)}
                {mode === 'speed' && (
                  <span className="ml-1 text-cyan-300">
                    {sampleSpeed(selectedKeyData.track, selectedKeyData.key.time).toFixed(2)}/s
                  </span>
                )}
              </span>
              <select
                value={selectedKeyData.key.interp}
                onChange={(event) =>
                  updateKey(selectedKeyData.track.id, selectedKeyData.key.id, {
                    interp: event.target.value as Interpolation
                  })
                }
                className="h-6 rounded border border-[#2a3038] bg-[#11141a] px-1 text-[9.5px] text-amber-300 outline-none"
              >
                <option value="bezier">Bezier</option>
                <option value="ease">Ease</option>
                <option value="linear">Linear</option>
                <option value="step">Step</option>
              </select>
              <button
                type="button"
                className="btn h-6 px-2 text-[9px]"
                onClick={applyTangentReset}
                title="Reset tangents to automatic smooth slopes"
              >
                <Check className="h-3 w-3 text-cyan-400" /> Auto
              </button>
              {selectedKeys.length > 1 ? (
                <button
                  type="button"
                  className="icon-btn hover:!text-red-400"
                  onClick={() => removeSelectedKeys()}
                  title={`Delete ${selectedKeys.length} selected keys`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              ) : (
                <button
                  type="button"
                  className="icon-btn hover:!text-red-400"
                  onClick={() => removeKey(selectedKeyData.track.id, selectedKeyData.key.id)}
                  title="Delete selected key"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </>
          )}
          <button
            type="button"
            className="icon-btn"
            onClick={copyGraph}
            title="Copy selected keys (Ctrl+C). With nothing selected, copies the visible curves."
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => void pasteGraph()}
            title="Paste keys at the playhead (Ctrl+V)"
          >
            <ClipboardPaste className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="btn h-6 text-[9.5px]"
            onClick={() => fitView()}
            title="Fit the visible curves to the graph panel"
          >
            <Maximize2 className="h-3 w-3" /> Fit
          </button>
          <span className="ml-1 hidden font-mono text-[8px] text-[#3f4854] 2xl:inline">
            Shift+wheel widens time · Ctrl+wheel zooms both axes · wheel pans
          </span>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="flex w-[180px] flex-shrink-0 flex-col border-r border-[#232830] bg-[#0c0e11]">
          <div className="flex h-7 flex-shrink-0 items-center justify-between border-b border-[#1d222a] px-2">
            <span className="text-[8.5px] font-bold uppercase tracking-[0.1em] text-[#4b5563]">
              Curves
            </span>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                className="text-[#4b5563] hover:text-white"
                onClick={() => {
                  const map: Record<string, boolean> = {};
                  for (const track of objectTracks) map[track.id] = true;
                  setVisibleTracks(map);
                }}
                title="Show all curves"
              >
                <Eye className="h-3 w-3" />
              </button>
              <button
                type="button"
                className="text-[#4b5563] hover:text-white"
                onClick={() => setVisibleTracks({})}
                title="Hide all curves"
              >
                <EyeOff className="h-3 w-3" />
              </button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-1">
            {objectTracks.length === 0 && (
              <p className="p-2 text-[9.5px] leading-relaxed text-[#4b5563]">
                No numeric curves for this object. Key it in the timeline, or paste copied curves with
                Ctrl+V.
              </p>
            )}
            {objectTracks.map((track) => {
              const color = PROPERTY_COLORS[track.property] || '#38bdf8';
              const visible = visibleTracks[track.id] !== false;
              return (
                <button
                  key={track.id}
                  type="button"
                  onClick={() =>
                    setVisibleTracks((prev) => ({ ...prev, [track.id]: !(prev[track.id] !== false) }))
                  }
                  className={`mb-0.5 flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left transition-colors hover:bg-white/5 ${
                    visible ? 'opacity-100' : 'opacity-40'
                  }`}
                >
                  <span className="h-2 w-2 flex-shrink-0 rounded-sm" style={{ background: color }} />
                  <span className="min-w-0 flex-1 truncate text-[9.5px] text-[#9aa4b2]">
                    {PROPERTY_LABELS[track.property] || track.property}
                  </span>
                  <span className="font-mono text-[8px] text-[#4b5563]">{track.keys.length}</span>
                </button>
              );
            })}
          </div>
          <div className="flex flex-shrink-0 flex-wrap gap-1 border-t border-[#1d222a] p-1">
            {(['bezier', 'ease', 'linear', 'step'] as Interpolation[]).map((interp) => (
              <span
                key={interp}
                className="rounded border border-[#232830] bg-[#101217] px-1 py-0.5 font-mono text-[7.5px] uppercase text-[#4b5563]"
              >
                {interp}
              </span>
            ))}
          </div>
        </div>

        <div ref={containerRef} className="relative min-w-0 flex-1">
          <canvas
            ref={canvasRef}
            tabIndex={0}
            className={`block focus:outline-none ${pan ? 'cursor-grabbing' : 'cursor-crosshair'}`}
            onWheel={handleWheel}
            onPointerDown={handlePointerDown}
            onPointerEnter={() => {
              hoveringRef.current = true;
            }}
            onPointerMove={(event) => {
              const { x, y } = canvasPoint(event);
              setHover({ x, y });
            }}
            onPointerLeave={() => {
              hoveringRef.current = false;
              setHover(null);
            }}
            onContextMenu={(event) => event.preventDefault()}
          />
          {menu && (
            <div
              className="fixed z-[95] w-[212px] overflow-hidden rounded-lg border border-[#2a3038] bg-[#0f1217] py-1 text-[10px] text-[#cbd5e1] shadow-[0_18px_48px_rgba(0,0,0,0.6)]"
              style={{
                left: Math.max(8, Math.min(menu.x, window.innerWidth - 220)),
                top: Math.max(8, Math.min(menu.y, window.innerHeight - 272))
              }}
              onPointerDown={(event) => event.stopPropagation()}
              onContextMenu={(event) => event.preventDefault()}
            >
              <div className="px-2.5 pb-1 pt-0.5 font-mono text-[7.5px] uppercase tracking-[0.14em] text-[#4b5563]">
                {selectedKeys.length
                  ? `${selectedKeys.length} key${selectedKeys.length === 1 ? '' : 's'} selected`
                  : menu.trackId
                    ? 'Curve'
                    : 'Graph'}
              </div>
              {menu.trackId &&
                (() => {
                  const track = project.tracks.find((item) => item.id === menu.trackId);
                  if (!track) return null;
                  const label = PROPERTY_LABELS[track.property] || track.property;
                  return (
                    <button
                      type="button"
                      className={MENU_ITEM}
                      onClick={() => {
                        setMenu(null);
                        copyCurve(track.id);
                      }}
                    >
                      <Copy className="h-3 w-3 text-cyan-300" />
                      <span className="min-w-0 flex-1 truncate">Copy “{label}” curve</span>
                      <span className="font-mono text-[8px] text-[#4b5563]">
                        {track.keys.length}
                      </span>
                    </button>
                  );
                })()}
              <button type="button" className={MENU_ITEM} onClick={() => { setMenu(null); copyGraph(); }}>
                <Copy className="h-3 w-3 text-cyan-300" />
                Copy keys
                <span className="ml-auto font-mono text-[8px] text-[#4b5563]">Ctrl+C</span>
              </button>
              <button
                type="button"
                className={MENU_ITEM}
                onClick={() => { setMenu(null); void pasteGraph(); }}
              >
                <ClipboardPaste className="h-3 w-3 text-cyan-300" />
                Paste at playhead
                <span className="ml-auto font-mono text-[8px] text-[#4b5563]">Ctrl+V</span>
              </button>
              <button
                type="button"
                className={`${MENU_ITEM} hover:!text-red-300`}
                disabled={!selectedKeys.length}
                onClick={() => {
                  setMenu(null);
                  removeSelectedKeys();
                }}
              >
                <Trash2 className="h-3 w-3" />
                Delete keys
                <span className="ml-auto font-mono text-[8px] text-[#4b5563]">Del</span>
              </button>
              <div className="my-1 h-px bg-[#1d222a]" />
              <div className="px-2.5 pb-1 font-mono text-[7.5px] uppercase tracking-[0.14em] text-[#4b5563]">
                Interpolation
              </div>
              <div className="grid grid-cols-4 gap-1 px-2 pb-1">
                {(['bezier', 'ease', 'linear', 'step'] as Interpolation[]).map((interp) => (
                  <button
                    key={interp}
                    type="button"
                    disabled={!selectedKeys.length}
                    onClick={() => applyInterpolation(interp)}
                    className="rounded border border-[#2a3038] bg-[#15181d] px-1 py-1 font-mono text-[7.5px] uppercase text-[#9aa4b2] hover:border-cyan-600/50 hover:text-cyan-200 disabled:opacity-35"
                  >
                    {interp}
                  </button>
                ))}
              </div>
              <div className="my-1 h-px bg-[#1d222a]" />
              <button
                type="button"
                className={MENU_ITEM}
                disabled={!selectedKeys.length}
                onClick={() => { setMenu(null); applyTangentReset(); }}
              >
                <Check className="h-3 w-3 text-cyan-300" />
                Reset tangents
              </button>
              <button
                type="button"
                className={MENU_ITEM}
                onClick={() => {
                  setMenu(null);
                  fitView();
                }}
              >
                <Maximize2 className="h-3 w-3 text-cyan-300" />
                Fit visible curves
              </button>
            </div>
          )}
          {size.width > 680 && (
            <div className="pointer-events-none absolute bottom-1 right-2 rounded bg-black/55 px-1.5 py-0.5 font-mono text-[8px] text-[#4b5563]">
              {mode === 'value'
                ? 'drag diamonds · Shift+wheel widens time · Ctrl+wheel zoom · right-click menu'
                : 'drag key vertically for speed · Shift+wheel widens time · Ctrl+wheel zoom · right-click menu'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
