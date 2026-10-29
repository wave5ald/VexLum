import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Download,
  Film,
  FolderOpen,
  Gauge,
  Image,
  Loader2,
  MonitorPlay,
  Play,
  RotateCcw,
  Save,
  Settings2,
  Sparkles,
  Square,
  XCircle,
  Zap
} from 'lucide-react';
import { SceneEngine } from '../editor/SceneEngine';
import { useEditorStore } from '../editor/store';
import {
  RenderProgress,
  RenderResult,
  RenderCancelledError,
  detectVideoCapabilities,
  formatBytes,
  formatDuration,
  renderTimelineToVideo,
  suggestedBitrateMbps,
  VideoCapabilities
} from '../editor/video/renderVideo';
import { saveBlob } from '../editor/fileIO';
import { NumberField, Section, SliderField, Toggle } from './ui';

interface RenderPanelProps {
  engineRef: React.MutableRefObject<SceneEngine | null>;
}

const RESOLUTIONS = [
  { label: 'HD 720p', width: 1280, height: 720, tag: '16:9' },
  { label: 'Full HD', width: 1920, height: 1080, tag: '16:9' },
  { label: 'QHD', width: 2560, height: 1440, tag: '16:9' },
  { label: '4K UHD', width: 3840, height: 2160, tag: '16:9' },
  { label: 'Portrait', width: 1080, height: 1920, tag: '9:16' },
  { label: 'Square', width: 1080, height: 1080, tag: '1:1' }
];

export const RenderPanel: React.FC<RenderPanelProps> = ({ engineRef }) => {
  const project = useEditorStore((state) => state.project);
  const video = project.video;
  const setVideo = useEditorStore((state) => state.setVideo);
  const setTime = useEditorStore((state) => state.seek);
  const setPlaying = useEditorStore((state) => state.setPlaying);
  const setToast = useEditorStore((state) => state.setToast);
  const setMode = useEditorStore((state) => state.setMode);

  const [caps, setCaps] = useState<VideoCapabilities | null>(null);
  const [rendering, setRendering] = useState(false);
  const [progress, setProgress] = useState<RenderProgress | null>(null);
  const [result, setResult] = useState<(RenderResult & { url: string; savedPath?: string }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef(false);
  const resultRef = useRef<RenderResult | null>(null);

  useEffect(() => {
    let mounted = true;
    detectVideoCapabilities().then((value) => {
      if (mounted) setCaps(value);
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!caps) return;
    if (video.format === 'mp4' && !caps.mp4 && caps.webm) {
      setVideo({ format: 'webm' });
    }
  }, [caps, video.format, setVideo]);

  const start = Math.max(0, Math.min(video.start, project.timeline.duration - 0.05));
  const end = Math.max(start + 0.05, Math.min(video.end, project.timeline.duration));
  const clipDuration = end - start;
  const frames = Math.max(1, Math.round(clipDuration * video.fps));
  const evenWidth = Math.round(video.width / 2) * 2;
  const evenHeight = Math.round(video.height / 2) * 2;
  const estimatedBytes = (video.bitrateMbps * 1_000_000 * clipDuration) / 8;
  const mp4Supported = caps?.mp4 ?? true;
  const webmSupported = caps?.webm ?? true;

  const setResolution = (width: number, height: number) => {
    const suggested = suggestedBitrateMbps(width, height, video.fps);
    setVideo({ width, height, bitrateMbps: suggested });
  };

  const handleRender = async () => {
    if (!engineRef.current || rendering) return;
    if (video.format === 'mp4' && !mp4Supported) {
      setError('MP4 encoding is not supported on this system. Choose WebM (VP9) instead.');
      return;
    }
    setRendering(true);
    setError(null);
    setResult(null);
    setProgress(null);
    cancelRef.current = false;
    setPlaying(false);
    engineRef.current.setPlaying(false);
    setTime(start);
    engineRef.current.setTime(start);

    try {
      const output = await renderTimelineToVideo({
        engine: engineRef.current,
        settings: video,
        start,
        end,
        fps: video.fps,
        onProgress: setProgress,
        shouldCancel: () => cancelRef.current
      });
      const url = URL.createObjectURL(output.blob);
      resultRef.current = output;
      setResult({ ...output, url });
      setToast(`Render complete — ${formatBytes(output.blob.size)}`, 'success');
    } catch (err: any) {
      if (err instanceof RenderCancelledError) {
        setToast('Render cancelled', 'info');
      } else {
        console.error(err);
        setError(err?.message || String(err));
        setToast('Render failed', 'error');
      }
    } finally {
      setRendering(false);
      setProgress(null);
    }
  };

  const handleSave = async () => {
    if (!result) return;
    const safeName = project.name.replace(/[^a-z0-9-_]+/gi, '-').toLowerCase();
    const name = `${safeName}-${result.width}x${result.height}-${result.fps}fps.${result.format}`;
    const saved = await saveBlob(result.blob, name, [
      { name: result.format === 'mp4' ? 'MP4 Video' : 'WebM Video', extensions: [result.format] }
    ]);
    if (saved.saved) {
      setResult({ ...result, savedPath: saved.path });
      setToast('Video saved', 'success');
    }
  };

  const handleStill = async () => {
    if (!engineRef.current) return;
    try {
      const blob = await engineRef.current.captureSnapshot(evenWidth, evenHeight);
      const safeName = project.name.replace(/[^a-z0-9-_]+/gi, '-').toLowerCase();
      const saved = await saveBlob(blob, `${safeName}-${evenWidth}x${evenHeight}.png`, [
        { name: 'PNG Image', extensions: ['png'] }
      ]);
      if (saved.saved) setToast('Still image saved', 'success');
    } catch (err: any) {
      setToast(`Still export failed: ${err?.message || err}`, 'error');
    }
  };

  return (
    <aside className="flex w-[404px] flex-shrink-0 flex-col border-l border-[#232830] bg-[#0c0e11]">
      <div className="flex h-[38px] flex-shrink-0 items-center justify-between border-b border-[#232830] bg-gradient-to-b from-[#12151a] to-[#0e1014] px-3">
        <div className="flex items-center gap-2">
          <Film className="h-3.5 w-3.5 text-red-400" />
          <span className="text-[10px] font-bold uppercase tracking-[0.13em] text-[#8b95a5]">
            Render Studio
          </span>
        </div>
        <button
          type="button"
          className="text-[9px] text-[#6b7280] hover:text-white"
          onClick={() => setMode('animation')}
        >
          Back to animation
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* Preview card */}
        <div className="border-b border-[#232830] p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-[#6b7280]">
              Output preview
            </span>
            {caps && (
              <div className="flex items-center gap-1">
                <span
                  className={`chip ${
                    mp4Supported ? '!border-emerald-500/30 !text-emerald-300' : '!border-red-500/30 !text-red-300'
                  }`}
                >
                  {mp4Supported ? <CheckCircle2 className="h-2.5 w-2.5" /> : <XCircle className="h-2.5 w-2.5" />}
                  MP4 {mp4Supported ? 'READY' : 'N/A'}
                </span>
                <span
                  className={`chip ${
                    webmSupported ? '!border-emerald-500/30 !text-emerald-300' : '!border-red-500/30 !text-red-300'
                  }`}
                >
                  <CheckCircle2 className="h-2.5 w-2.5" />
                  WEBM READY
                </span>
              </div>
            )}
          </div>

          <div
            className="relative mx-auto w-full overflow-hidden rounded-lg border border-[#2a3038] bg-black"
            style={{ aspectRatio: `${evenWidth} / ${evenHeight}`, maxHeight: 260 }}
          >
            {result ? (
              <video src={result.url} controls loop playsInline className="h-full w-full object-contain" />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[#2a3038] bg-[#11141a]">
                  <MonitorPlay className="h-5 w-5 text-[#4b5563]" />
                </div>
                <p className="text-[10.5px] font-medium text-[#7b8595]">No render yet</p>
                <p className="max-w-[240px] text-[9px] leading-relaxed text-[#4b5563]">
                  The animation timeline is rendered frame-by-frame at {video.fps} fps using the scene camera.
                </p>
              </div>
            )}
            {rendering && progress && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/85 backdrop-blur-sm">
                <Loader2 className="mb-2 h-5 w-5 animate-spin text-red-400" />
                <span className="font-mono text-[11px] text-white">
                  {Math.round(progress.ratio * 100)}% · {progress.frame}/{progress.totalFrames} frames
                </span>
                <div className="mt-2 h-1.5 w-48 overflow-hidden rounded-full bg-[#2a3038]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-red-500 to-amber-400 transition-all"
                    style={{ width: `${Math.round(progress.ratio * 100)}%` }}
                  />
                </div>
                <span className="mt-1.5 font-mono text-[8.5px] text-[#6b7280]">
                  {progress.phase === 'finalizing'
                    ? 'Finalizing container…'
                    : `ETA ${formatDuration(progress.estimatedRemainingMs / 1000)}`}
                </span>
              </div>
            )}
          </div>

          {result && (
            <div className="mt-2 space-y-1.5">
              <div className="grid grid-cols-2 gap-1">
                <button type="button" className="btn btn-primary h-7 text-[10px]" onClick={handleSave}>
                  <Download className="h-3 w-3" /> Save video
                </button>
                <button type="button" className="btn h-7 text-[10px]" onClick={handleStill}>
                  <Image className="h-3 w-3" /> Save still
                </button>
              </div>
              {result.savedPath && (
                <button
                  type="button"
                  className="flex w-full items-start gap-1.5 rounded border border-emerald-500/20 bg-emerald-500/5 px-2 py-1 text-left text-[9px] text-emerald-300"
                  onClick={() => window.desktop?.showItem(result.savedPath!)}
                >
                  <FolderOpen className="mt-0.5 h-3 w-3 flex-shrink-0" />
                  <span className="break-all">Saved: {result.savedPath}</span>
                </button>
              )}
              <div className="rounded border border-[#232830] bg-[#101217] px-2 py-1 font-mono text-[8.5px] text-[#6b7280]">
                {result.codec} · {result.width}×{result.height} · {result.fps} fps ·{' '}
                {(result.bitrate / 1_000_000).toFixed(0)} Mbps · {formatBytes(result.blob.size)}
              </div>
            </div>
          )}

          {rendering ? (
            <button
              type="button"
              className="mt-2 flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 text-[11px] font-semibold text-red-300 hover:bg-red-500/20"
              onClick={() => {
                cancelRef.current = true;
              }}
            >
              <Square className="h-3 w-3 fill-current" /> Cancel render
            </button>
          ) : (
            <button
              type="button"
              className="mt-2 flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-red-600 text-[11px] font-semibold text-white shadow-lg shadow-red-600/20 transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
              onClick={handleRender}
              disabled={mp4Supported === false && video.format === 'mp4'}
            >
              <Play className="h-3.5 w-3.5 fill-current" />
              Render {formatDuration(clipDuration)} at {video.width}×{video.height}
            </button>
          )}

          {error && (
            <div className="mt-2 flex items-start gap-1.5 rounded border border-red-500/30 bg-red-500/5 px-2 py-1.5 text-[9px] leading-relaxed text-red-300">
              <AlertTriangle className="mt-0.5 h-3 w-3 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {caps && !caps.mp4 && (
            <div className="mt-2 flex items-start gap-1.5 rounded border border-amber-500/25 bg-amber-500/5 px-2 py-1.5 text-[9px] leading-relaxed text-amber-300/90">
              <AlertTriangle className="mt-0.5 h-3 w-3 flex-shrink-0" />
              <span>
                This Chromium build cannot encode H.264. WebM (VP9) is selected automatically — it is lossless to
                rewrap later.
              </span>
            </div>
          )}
        </div>

        <Section title="Format & Codec" icon={<Settings2 className="h-3 w-3" />}>
          <div className="mb-2 grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => setVideo({ format: 'mp4' })}
              disabled={!mp4Supported}
              className={`rounded-lg border px-2 py-2 text-left transition-colors disabled:opacity-40 ${
                video.format === 'mp4'
                  ? 'border-cyan-500/50 bg-cyan-500/10'
                  : 'border-[#2a3038] bg-[#101217] hover:border-[#39414c]'
              }`}
            >
              <div className="text-[10.5px] font-semibold text-white">MP4 · H.264</div>
              <div className="font-mono text-[8px] text-[#6b7280]">universal · web ready</div>
            </button>
            <button
              type="button"
              onClick={() => setVideo({ format: 'webm' })}
              disabled={!webmSupported}
              className={`rounded-lg border px-2 py-2 text-left transition-colors disabled:opacity-40 ${
                video.format === 'webm'
                  ? 'border-cyan-500/50 bg-cyan-500/10'
                  : 'border-[#2a3038] bg-[#101217] hover:border-[#39414c]'
              }`}
            >
              <div className="text-[10.5px] font-semibold text-white">WebM · VP9</div>
              <div className="font-mono text-[8px] text-[#6b7280]">lossless rewrap · smaller</div>
            </button>
          </div>
          <div className="mb-2 flex items-center justify-between rounded border border-[#232830] bg-[#101217] px-2 py-1.5">
            <div>
              <div className="text-[9.5px] text-[#cbd5e1]">Keyframe interval</div>
              <div className="text-[8px] text-[#5f6a78]">GOP length in frames</div>
            </div>
            <div className="w-16">
              <NumberField
                value={video.keyframeInterval}
                min={1}
                max={600}
                step={1}
                precision={0}
                onChange={(value) => setVideo({ keyframeInterval: Math.round(value) })}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between rounded bg-[#101217] px-2 py-1">
              <span className="text-[9px] text-[#6b7280]">Anti-aliasing</span>
              <Toggle checked={video.antialias} onChange={(value) => setVideo({ antialias: value })} />
            </div>
            <div className="flex items-center justify-between rounded bg-[#101217] px-2 py-1">
              <span className="text-[9px] text-[#6b7280]">Ray-traced shadows</span>
              <Toggle checked={video.shadows} onChange={(value) => setVideo({ shadows: value })} />
            </div>
            <div className="flex items-center justify-between rounded bg-[#101217] px-2 py-1">
              <div>
                <div className="text-[9px] text-[#9aa4b2]">Motion blur</div>
                <div className="text-[7.5px] text-[#5f6a78]">3× render cost</div>
              </div>
              <Toggle checked={video.motionBlur} onChange={(value) => setVideo({ motionBlur: value })} />
            </div>
          </div>
        </Section>

        <Section title="Resolution & Framerate" icon={<Gauge className="h-3 w-3" />}>
          <div className="mb-2 grid grid-cols-3 gap-1">
            {RESOLUTIONS.map((resolution) => {
              const active = video.width === resolution.width && video.height === resolution.height;
              return (
                <button
                  key={resolution.label}
                  type="button"
                  onClick={() => setResolution(resolution.width, resolution.height)}
                  className={`rounded border px-1 py-1.5 text-left transition-colors ${
                    active
                      ? 'border-cyan-500/50 bg-cyan-500/10'
                      : 'border-[#2a3038] bg-[#101217] hover:border-[#39414c]'
                  }`}
                >
                  <div className="text-[9.5px] font-medium text-white">{resolution.label}</div>
                  <div className="font-mono text-[7.5px] text-[#6b7280]">
                    {resolution.width}×{resolution.height}
                  </div>
                </button>
              );
            })}
          </div>
          <div className="mb-2 grid grid-cols-2 gap-1.5">
            <div>
              <span className="field-label mb-1 block">Width</span>
              <NumberField
                value={video.width}
                min={64}
                max={7680}
                step={2}
                precision={0}
                onChange={(value) => setVideo({ width: Math.round(value / 2) * 2 })}
              />
            </div>
            <div>
              <span className="field-label mb-1 block">Height</span>
              <NumberField
                value={video.height}
                min={64}
                max={4320}
                step={2}
                precision={0}
                onChange={(value) => setVideo({ height: Math.round(value / 2) * 2 })}
              />
            </div>
          </div>
          <div className="mb-2">
            <span className="field-label mb-1 block">Frame rate</span>
            <div className="grid grid-cols-5 gap-1">
              {[24, 25, 30, 50, 60].map((fps) => (
                <button
                  key={fps}
                  type="button"
                  onClick={() => setVideo({ fps, bitrateMbps: suggestedBitrateMbps(video.width, video.height, fps) })}
                  className={`rounded border py-1 font-mono text-[9.5px] transition-colors ${
                    video.fps === fps
                      ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-300'
                      : 'border-[#2a3038] bg-[#101217] text-[#7b8595] hover:text-white'
                  }`}
                >
                  {fps}
                </button>
              ))}
            </div>
          </div>
          <div className="mb-2">
            <span className="field-label mb-1 block">Bitrate · {video.bitrateMbps} Mbps</span>
            <SliderField
              value={video.bitrateMbps}
              min={2}
              max={120}
              step={1}
              onChange={(value) => setVideo({ bitrateMbps: value })}
              format={(value) => `${value}`}
            />
            <button
              type="button"
              className="mt-1 text-[8.5px] text-cyan-400/80 hover:text-cyan-300"
              onClick={() =>
                setVideo({
                  bitrateMbps: suggestedBitrateMbps(video.width, video.height, video.fps)
                })
              }
            >
              Use recommended for {video.width}×{video.height} @ {video.fps}
            </button>
          </div>
          <div className="rounded border border-[#232830] bg-[#101217] p-2 font-mono text-[8.5px] leading-relaxed text-[#6b7280]">
            <div className="flex justify-between">
              <span>Frames</span>
              <span className="text-[#cbd5e1]">{frames}</span>
            </div>
            <div className="flex justify-between">
              <span>Clip length</span>
              <span className="text-[#cbd5e1]">{clipDuration.toFixed(2)}s</span>
            </div>
            <div className="flex justify-between">
              <span>Est. file size</span>
              <span className="text-[#cbd5e1]">{formatBytes(estimatedBytes)}</span>
            </div>
            <div className="flex justify-between">
              <span>Container</span>
              <span className="text-[#cbd5e1]">{video.format.toUpperCase()}</span>
            </div>
          </div>
        </Section>

        <Section title="Timeline Range" icon={<Film className="h-3 w-3" />}>
          <div className="mb-2 grid grid-cols-2 gap-1.5">
            <div>
              <span className="field-label mb-1 block">Start (s)</span>
              <NumberField
                value={start}
                min={0}
                max={Math.max(0, end - 0.05)}
                step={0.1}
                precision={2}
                onChange={(value) => setVideo({ start: value })}
              />
            </div>
            <div>
              <span className="field-label mb-1 block">End (s)</span>
              <NumberField
                value={end}
                min={start + 0.05}
                max={project.timeline.duration}
                step={0.1}
                precision={2}
                onChange={(value) => setVideo({ end: value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1">
            <button
              type="button"
              className="btn h-6 text-[9px]"
              onClick={() => setVideo({ start: 0, end: project.timeline.duration })}
            >
              Full timeline
            </button>
            <button
              type="button"
              className="btn h-6 text-[9px]"
              onClick={() => setVideo({ start: project.timeline.duration * 0.25, end: project.timeline.duration * 0.75 })}
            >
              Center 50%
            </button>
          </div>
          <div className="mt-2 flex items-start gap-1.5 rounded border border-[#232830] bg-[#101217] px-2 py-1.5 text-[8.5px] leading-relaxed text-[#6b7280]">
            <Zap className="mt-0.5 h-3 w-3 flex-shrink-0 text-amber-400" />
            <span>
              Rendering is frame-exact: every frame is sampled at 1/{video.fps}s and encoded with precise
              timestamps — no dropped frames, no screen-recording drift.
            </span>
          </div>
        </Section>

        <Section title="Camera & Scene" icon={<Camera className="h-3 w-3" />}>
          <div className="space-y-1 text-[9px] text-[#7b8595]">
            <div className="flex items-center justify-between rounded bg-[#101217] px-2 py-1">
              <span>Render camera</span>
              <span className="font-mono text-cyan-300">
                {project.objects.find((object) => object.kind === 'camera')?.name || 'None'}
              </span>
            </div>
            <div className="flex items-center justify-between rounded bg-[#101217] px-2 py-1">
              <span>Camera animation</span>
              <span className="font-mono text-amber-300">
                {
                  project.tracks.filter((track) => track.objectId === project.objects.find((o) => o.kind === 'camera')?.id)
                    .length
                }{' '}
                curves
              </span>
            </div>
            <div className="flex items-center justify-between rounded bg-[#101217] px-2 py-1">
              <span>Scene lights</span>
              <span className="font-mono text-[#cbd5e1]">
                {project.objects.filter((object) => object.kind === 'light').length}
              </span>
            </div>
            <div className="flex items-center justify-between rounded bg-[#101217] px-2 py-1">
              <span>Animated objects</span>
              <span className="font-mono text-[#cbd5e1]">
                {new Set(project.tracks.map((track) => track.objectId)).size}
              </span>
            </div>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-1">
            <button type="button" className="btn h-6 text-[9px]" onClick={() => setMode('animation')}>
              <Sparkles className="h-3 w-3 text-amber-400" /> Edit animation
            </button>
            <button type="button" className="btn h-6 text-[9px]" onClick={handleStill}>
              <Image className="h-3 w-3" /> Export still
            </button>
          </div>
        </Section>

        <div className="p-3 text-[8.5px] leading-relaxed text-[#4b5563]">
          Vexlum uses WebCodecs for hardware-accelerated, frame-accurate encoding. MP4/H.264 is ideal
          for sharing and editing; WebM/VP9 is a reliable fallback for systems without an H.264 encoder.
        </div>
      </div>
    </aside>
  );
};
