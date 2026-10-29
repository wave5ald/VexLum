import type { ProjectState, SceneObject } from './types';

/**
 * Vite inlines these source files as strings. The chat assembles a compact
 * retrieval bundle so even small free models can reason about the real app.
 */
const SOURCE_FILES = import.meta.glob('/src/**/*.{ts,tsx,css}', {
  query: '?raw',
  import: 'default',
  eager: true
}) as Record<string, string>;

const ELECTRON_MAIN = import.meta.glob('/electron/*.cjs', {
  query: '?raw',
  import: 'default',
  eager: true
}) as Record<string, string>;

const ALL_FILES: Record<string, string> = { ...SOURCE_FILES, ...ELECTRON_MAIN };

const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'that',
  'this',
  'from',
  'into',
  'your',
  'you',
  'can',
  'please',
  'add',
  'make',
  'want',
  'need',
  'how',
  'what',
  'why',
  'does',
  'the',
  'app',
  'code',
  'source',
  'file',
  'files',
  'monolith',
  'studio'
]);

function tokensOf(text: string): string[] {
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .split(/[^a-z0-9_]+/)
        .filter((token) => token.length > 2 && !STOP_WORDS.has(token))
    )
  ).slice(0, 40);
}

function exportsOf(source: string): string {
  const names = new Set<string>();
  const patterns = [
    /export\s+(?:async\s+)?(?:function|const|class|interface|type)\s+([A-Za-z0-9_]+)/g,
    /export\s+default\s+([A-Za-z0-9_]+)/g
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(source))) names.add(match[1]);
  }
  return [...names].slice(0, 18).join(', ');
}

export function sourceManifest(): string {
  return Object.keys(ALL_FILES)
    .sort()
    .map((path) => {
      const source = ALL_FILES[path];
      const lines = source.split('\n').length;
      const exports = exportsOf(source);
      return `${path} · ${lines} lines${exports ? ` · exports: ${exports}` : ''}`;
    })
    .join('\n');
}

const CORE_FILES = [
  '/src/editor/types.ts',
  '/src/editor/store.ts',
  '/src/editor/SceneEngine.ts',
  '/src/editor/animation.ts',
  '/src/editor/effects.ts',
  '/src/editor/scripts.ts',
  '/src/editor/aiActions.ts',
  '/src/editor/ai.ts',
  '/src/App.tsx',
  '/src/components/Timeline.tsx',
  '/src/components/Inspector.tsx',
  '/src/components/EffectsPanel.tsx',
  '/src/components/AIChat.tsx',
  '/src/components/Viewport.tsx',
  '/electron/main.cjs',
  '/electron/preload.cjs'
];

export function sourceContext(prompt: string, maxChars = 30000): string {
  const terms = tokensOf(prompt);
  const scored = Object.entries(ALL_FILES).map(([path, content]) => {
    const lowerPath = path.toLowerCase();
    const lowerContent = content.toLowerCase();
    let score = 0;
    for (const term of terms) {
      if (lowerPath.includes(term)) score += 28;
      let count = 0;
      let from = 0;
      while (count < 12) {
        const at = lowerContent.indexOf(term, from);
        if (at < 0) break;
        count++;
        from = at + term.length;
      }
      score += count;
    }
    if (CORE_FILES.includes(path)) score += 6;
    if (/source|entire|whole|architecture|how.*work|codebase/i.test(prompt)) score += 4;
    return { path, content, score };
  });
  scored.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));

  const manifest = sourceManifest();
  let bundle = `SOURCE MANIFEST\n${manifest}\n\n`;
  let remaining = Math.max(4000, maxChars - bundle.length);
  const seen = new Set<string>();
  for (const entry of scored) {
    if (entry.score <= 0 && seen.size >= 6) continue;
    if (seen.size >= 16) break;
    if (bundle.length > maxChars) break;
    const available = Math.min(remaining, maxChars - bundle.length);
    if (available < 1200) break;
    seen.add(entry.path);
    const source =
      entry.content.length > available
        ? `${entry.content.slice(0, available)}\n/* …truncated for context; ${entry.content.length} chars total… */`
        : entry.content;
    bundle += `\n===== FILE ${entry.path} =====\n${source}\n`;
  }
  return bundle;
}

export const ARCHITECTURE = `VEXLUM — ARCHITECTURE
- Electron + React + Three.js desktop 3D editor. Renderer: src/editor/store.ts (Zustand project state, undo, selection, effects, keys), src/editor/SceneEngine.ts (Three scene, hierarchy, cameras, gizmos, effects, capture), src/editor/animation.ts (Hermite/keyframe evaluation), src/editor/types.ts (serializable model), src/components/* (UI), electron/main.cjs + preload.cjs (file dialogs + AI HTTP bridge).
- Data: ProjectState { objects: SceneObject[], tracks: Track[], settings, timeline, video }. SceneObject kinds: mannequin, primitive, model, light, camera, script, null. Local TRS under optional parentId (Null only). Effects array on objects runs after keyframes.
- Timeline tracks are per object+property. Property paths like position.x, rotation.y, scale.z, material.color, light.intensity, camera.fov, camera.target.x.
- Camera modes: 'target' (look-at target) and 'free' (keyable Euler YXZ).
- Script objects run source with (THREE, material, helpers). The source must return a THREE.Object3D. This is the main way to add arbitrary geometry at runtime.
- Effects kinds: physics (glass/paper/sponge/slime deterministic drop), spin, float, orbit, shake, glow, fade, pulse, lookAt, colorCycle. Physics start is in seconds and is export-safe.
- The assistant can drive the scene with JSON actions. It cannot rebuild the installed Electron binary, but it can create arbitrary Three.js scene objects via add_script and control every editor feature below.
- AI requests are sent through Electron main (window.desktop.aiRequest) to avoid CORS. API keys live in localStorage on this machine only.`;

export function projectSnapshot(project: ProjectState, selectedId: string | null, time: number): string {
  const lines: string[] = [];
  lines.push(`Scene "${project.name}" · ${project.objects.length} objects · time ${time.toFixed(2)}s / ${project.timeline.duration}s · ${project.timeline.fps} fps`);
  lines.push(`Selected: ${selectedId || 'none'}`);
  lines.push(`Background ${project.settings.background} · exposure ${project.settings.exposure} · floor ${project.settings.floorColor}`);
  for (const object of project.objects) {
    const bits: string[] = [
      `id=${object.id}`,
      object.name,
      object.kind,
      `pos=[${object.position.map((value) => value.toFixed(2)).join(',')}]`,
      `rot=[${object.rotation.map((value) => value.toFixed(0)).join(',')}]`,
      `scale=[${object.scale.map((value) => value.toFixed(2)).join(',')}]`
    ];
    if (object.parentId) bits.push(`parent=${object.parentId}`);
    if (!object.visible) bits.push('hidden');
    if (object.locked) bits.push('locked');
    if (object.material) bits.push(`color=${object.material.color}`);
    if (object.camera) bits.push(`camera=${object.camera.aimMode},fov=${object.camera.fov},target=[${object.camera.target.join(',')}]`);
    if (object.primitive) bits.push(`primitive=${object.primitive.type},size=${object.primitive.size}`);
    if (object.effects?.length) {
      bits.push(
        `effects=${object.effects
          .map((effect) => `${effect.kind}@${effect.start.toFixed(2)}s${effect.material ? `/${effect.material}` : ''}`)
          .join('+')}`
      );
    }
    lines.push(`- ${bits.join(' · ')}`);
  }
  const trackSummary = project.tracks
    .map((track) => `${project.objects.find((object) => object.id === track.objectId)?.name || track.objectId}:${track.property}(${track.keys.length})`)
    .join(', ');
  lines.push(`Tracks: ${trackSummary || 'none'}`);
  return lines.join('\n');
}

export function scriptSnippet(object: SceneObject): string | null {
  if (object.kind !== 'script' || !object.script?.source) return null;
  return object.script.source.slice(0, 2500);
}
