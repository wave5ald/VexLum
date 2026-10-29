import { Muxer as Mp4Muxer, ArrayBufferTarget as Mp4ArrayBufferTarget } from 'mp4-muxer';
import { Muxer as WebmMuxer, ArrayBufferTarget as WebmArrayBufferTarget } from 'webm-muxer';
import { SceneEngine } from '../SceneEngine';
import { VideoFormat, VideoSettings } from '../types';

export interface VideoCapabilities {
  webCodecs: boolean;
  mp4: boolean;
  webm: boolean;
  mp4Codec?: string;
  webmCodec?: string;
  reason?: string;
}

export interface RenderProgress {
  phase: 'preparing' | 'rendering' | 'finalizing';
  frame: number;
  totalFrames: number;
  ratio: number;
  elapsedMs: number;
  estimatedRemainingMs: number;
}

export interface RenderResult {
  blob: Blob;
  format: VideoFormat;
  width: number;
  height: number;
  fps: number;
  frames: number;
  duration: number;
  codec: string;
  bitrate: number;
}

export class RenderCancelledError extends Error {
  constructor() {
    super('Render cancelled');
    this.name = 'RenderCancelledError';
  }
}

function levelHex(width: number, height: number, fps: number): string {
  const pixels = width * height;
  const rate = pixels * fps;
  if (rate > 3840 * 2160 * 55) return '34'; // 5.2
  if (rate > 2560 * 1440 * 55) return '33'; // 5.1
  if (rate > 1920 * 1080 * 55) return '32'; // 5.0
  if (rate > 1920 * 1080 * 33) return '2a'; // 4.2
  return '28'; // 4.0
}

function avcCandidates(width: number, height: number, fps: number): string[] {
  const level = levelHex(width, height, fps);
  return [
    `avc1.6400${level}`,
    `avc1.4d40${level}`,
    `avc1.42e0${level}`,
    'avc1.640033',
    'avc1.640032',
    'avc1.640028',
    'avc1.4d4028',
    'avc1.42e01e'
  ];
}

const VP9_CANDIDATES = [
  'vp09.00.10.08',
  'vp09.00.20.08',
  'vp09.00.31.08',
  'vp09.00.41.08',
  'vp09.00.51.08',
  'vp8'
];

async function findSupported(
  candidates: string[],
  format: VideoFormat,
  width: number,
  height: number,
  fps: number,
  bitrate: number
): Promise<string | undefined> {
  if (typeof VideoEncoder === 'undefined') return undefined;
  for (const codec of candidates) {
    try {
      const config: VideoEncoderConfig = {
        codec,
        width,
        height,
        bitrate,
        framerate: fps,
        latencyMode: 'quality'
      };
      if (codec.startsWith('avc1')) {
        (config as any).avc = { format: 'avc' };
      }
      const support = await VideoEncoder.isConfigSupported(config);
      if (support.supported) return codec;
    } catch {
      // Try next candidate.
    }
  }
  return undefined;
}

let capabilityPromise: Promise<VideoCapabilities> | null = null;

export function detectVideoCapabilities(): Promise<VideoCapabilities> {
  if (capabilityPromise) return capabilityPromise;
  capabilityPromise = (async () => {
    if (typeof VideoEncoder === 'undefined') {
      return {
        webCodecs: false,
        mp4: false,
        webm: false,
        reason: 'WebCodecs is not available in this environment.'
      };
    }
    const [mp4Codec, webmCodec] = await Promise.all([
      findSupported(avcCandidates(1920, 1080, 30), 'mp4', 1920, 1080, 30, 24_000_000),
      findSupported(VP9_CANDIDATES, 'webm', 1920, 1080, 30, 24_000_000)
    ]);
    return {
      webCodecs: true,
      mp4: Boolean(mp4Codec),
      webm: Boolean(webmCodec),
      mp4Codec,
      webmCodec,
      reason:
        mp4Codec || webmCodec
          ? undefined
          : 'No supported hardware or software encoder was found for this resolution.'
    };
  })();
  return capabilityPromise;
}

function even(value: number): number {
  return Math.max(2, Math.round(value / 2) * 2);
}

export interface RenderTimelineOptions {
  engine: SceneEngine;
  settings: VideoSettings;
  start: number;
  end: number;
  fps: number;
  onProgress?: (progress: RenderProgress) => void;
  shouldCancel?: () => boolean;
}

export async function renderTimelineToVideo(options: RenderTimelineOptions): Promise<RenderResult> {
  const { engine, onProgress, shouldCancel } = options;
  const width = even(options.settings.width);
  const height = even(options.settings.height);
  const fps = Math.max(1, Math.round(options.fps));
  const start = Math.max(0, options.start);
  const end = Math.max(start + 0.05, options.end);
  const duration = end - start;
  const totalFrames = Math.max(1, Math.round(duration * fps));
  const bitrate = Math.max(1_000_000, Math.round(options.settings.bitrateMbps * 1_000_000));
  const format = options.settings.format;
  const startedAt = performance.now();

  const report = (phase: RenderProgress['phase'], frame: number) => {
    const elapsedMs = performance.now() - startedAt;
    const ratio = phase === 'rendering' ? frame / totalFrames : phase === 'finalizing' ? 1 : 0;
    const estimatedRemainingMs =
      phase === 'rendering' && frame > 2 ? (elapsedMs / frame) * (totalFrames - frame) : 0;
    onProgress?.({
      phase,
      frame,
      totalFrames,
      ratio,
      elapsedMs,
      estimatedRemainingMs
    });
  };

  report('preparing', 0);

  const codec =
    format === 'mp4'
      ? await findSupported(avcCandidates(width, height, fps), 'mp4', width, height, fps, bitrate)
      : await findSupported(VP9_CANDIDATES, 'webm', width, height, fps, bitrate);

  if (!codec) {
    throw new Error(
      format === 'mp4'
        ? 'H.264 MP4 encoding is not supported by this system. Switch the format to WebM (VP9), which uses a guaranteed software encoder.'
        : 'No WebM VP9/VP8 encoder is available on this system.'
    );
  }

  const mp4Target = format === 'mp4' ? new Mp4ArrayBufferTarget() : null;
  const webmTarget = format === 'webm' ? new WebmArrayBufferTarget() : null;

  const muxer =
    format === 'mp4'
      ? new Mp4Muxer({
          target: mp4Target!,
          video: { codec: 'avc', width, height, frameRate: fps },
          fastStart: 'in-memory'
        })
      : new WebmMuxer({
          target: webmTarget!,
          video: {
            codec: codec.startsWith('vp09') ? 'V_VP9' : 'V_VP8',
            width,
            height,
            frameRate: fps
          }
        });

  let encoderError: Error | null = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      try {
        (muxer as any).addVideoChunk(chunk, meta);
      } catch (error: any) {
        encoderError = error instanceof Error ? error : new Error(String(error));
      }
    },
    error: (error) => {
      encoderError = error instanceof Error ? error : new Error(String(error));
    }
  });

  const encoderConfig: VideoEncoderConfig = {
    codec,
    width,
    height,
    bitrate,
    framerate: fps,
    latencyMode: 'quality',
    bitrateMode: 'variable'
  };
  if (codec.startsWith('avc1')) (encoderConfig as any).avc = { format: 'avc' };
  encoder.configure(encoderConfig);

  const context = engine.createCaptureContext(width, height, {
    antialias: options.settings.antialias,
    shadows: options.settings.shadows
  });

  const keyInterval = Math.max(1, Math.round(options.settings.keyframeInterval || fps * 2));
  const blur = options.settings.motionBlur;
  let blendCanvas: HTMLCanvasElement | null = null;
  let blendContext: CanvasRenderingContext2D | null = null;
  if (blur) {
    blendCanvas = document.createElement('canvas');
    blendCanvas.width = width;
    blendCanvas.height = height;
    blendContext = blendCanvas.getContext('2d', { alpha: false });
  }

  engine.beginCapture();
  try {
    for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
      if (shouldCancel?.()) throw new RenderCancelledError();
      if (encoderError) throw encoderError;
      const time = start + frameIndex / fps;

      let frameSource: HTMLCanvasElement = context.renderer.domElement;
      if (blur && blendCanvas && blendContext) {
        blendContext.globalCompositeOperation = 'source-over';
        blendContext.globalAlpha = 1;
        blendContext.fillStyle = '#000000';
        blendContext.fillRect(0, 0, width, height);
        blendContext.globalCompositeOperation = 'lighter';
        const samples = 3;
        for (let sample = 0; sample < samples; sample++) {
          const offset = ((sample - (samples - 1) / 2) * 0.5) / fps;
          const sampleTime = Math.max(start, Math.min(end, time + offset));
          engine.renderCapture(context, sampleTime, false);
          blendContext.globalAlpha = 1 / samples;
          blendContext.drawImage(context.renderer.domElement, 0, 0, width, height);
        }
        blendContext.globalAlpha = 1;
        blendContext.globalCompositeOperation = 'source-over';
        frameSource = blendCanvas;
      } else {
        engine.renderCapture(context, time, false);
      }

      if (encoderError) throw encoderError;

      const timestamp = Math.round((frameIndex * 1_000_000) / fps);
      const frame = new VideoFrame(frameSource, {
        timestamp,
        duration: Math.round(1_000_000 / fps)
      });
      encoder.encode(frame, { keyFrame: frameIndex % keyInterval === 0 });
      frame.close();

      if (frameIndex % 2 === 0 || frameIndex === totalFrames - 1) {
        report('rendering', frameIndex + 1);
      }

      while (encoder.encodeQueueSize > 6) {
        if (shouldCancel?.()) throw new RenderCancelledError();
        await new Promise((resolve) => setTimeout(resolve, 4));
        if (encoderError) throw encoderError;
      }
      if (frameIndex % 4 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
    }

    report('finalizing', totalFrames);
    await encoder.flush();
    if (encoderError) throw encoderError;
    encoder.close();
    (muxer as any).finalize();

    const buffer =
      format === 'mp4' ? mp4Target!.buffer : webmTarget!.buffer;
    const blob = new Blob([buffer], {
      type: format === 'mp4' ? 'video/mp4' : 'video/webm'
    });

    return {
      blob,
      format,
      width,
      height,
      fps,
      frames: totalFrames,
      duration: totalFrames / fps,
      codec,
      bitrate
    };
  } finally {
    engine.endCapture();
    engine.disposeCaptureContext(context);
    try {
      if (encoder.state !== 'closed') encoder.close();
    } catch {
      // Ignore close races.
    }
  }
}

export function suggestedBitrateMbps(width: number, height: number, fps: number): number {
  const pixels = width * height;
  const base = (pixels / (1920 * 1080)) * (fps / 30);
  return Math.round(Math.max(4, Math.min(120, 12 * base + 4)));
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
