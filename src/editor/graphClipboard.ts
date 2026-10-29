import { Interpolation, KeyframeValue, Track } from './types';

/**
 * A portable snapshot of copied animation curves. Times are stored relative to
 * the earliest copied key so the set can be pasted at the playhead, exactly
 * like After Effects.
 */
export interface GraphClipboardKey {
  property: string;
  offset: number;
  value: KeyframeValue;
  interp: Interpolation;
  tangentIn?: number;
  tangentOut?: number;
  influenceIn?: number;
  influenceOut?: number;
}

export interface GraphClipboard {
  version: 1;
  label: string;
  duration: number;
  keys: GraphClipboardKey[];
}

export const GRAPH_CLIPBOARD_STORAGE_KEY = 'monolith.graph.clipboard.v1';

const INTERPOLATIONS: Interpolation[] = ['linear', 'step', 'ease', 'bezier'];

const asInterp = (value: unknown): Interpolation =>
  INTERPOLATIONS.includes(value as Interpolation) ? (value as Interpolation) : 'bezier';

const signature = (trackId: string, keyId: string) => `${trackId}:${keyId}`;

/**
 * Builds a clipboard payload from the selected keys. When nothing is selected
 * every key on the supplied fallback tracks is copied, so Ctrl+C on an
 * untouched graph copies the whole curve set.
 */
export function createGraphClipboard(
  tracks: Track[],
  selection: Array<{ trackId: string; keyId: string }>,
  fallbackTrackIds: string[]
): GraphClipboard | null {
  const wanted = new Set(selection.map((item) => signature(item.trackId, item.keyId)));
  const fallback = new Set(fallbackTrackIds);
  const extracted: Array<{ property: string; time: number; key: GraphClipboardKey }> = [];

  for (const track of tracks) {
    for (const key of track.keys) {
      const picked = wanted.size
        ? wanted.has(signature(track.id, key.id))
        : fallback.has(track.id);
      if (!picked) continue;
      const value = Number(key.value);
      if (!Number.isFinite(value) && typeof key.value !== 'string' && typeof key.value !== 'boolean') {
        continue;
      }
      extracted.push({
        property: track.property,
        time: key.time,
        key: {
          property: track.property,
          offset: 0,
          value: key.value,
          interp: key.interp,
          ...(Number.isFinite(key.tangentIn) ? { tangentIn: key.tangentIn } : {}),
          ...(Number.isFinite(key.tangentOut) ? { tangentOut: key.tangentOut } : {}),
          ...(Number.isFinite(key.influenceIn) ? { influenceIn: key.influenceIn } : {}),
          ...(Number.isFinite(key.influenceOut) ? { influenceOut: key.influenceOut } : {})
        }
      });
    }
  }

  if (!extracted.length) return null;
  const anchor = Math.min(...extracted.map((item) => item.time));
  const end = Math.max(...extracted.map((item) => item.time));
  const keys = extracted
    .map((item) => ({ ...item.key, offset: Number((item.time - anchor).toFixed(4)) }))
    .sort((a, b) => a.offset - b.offset || a.property.localeCompare(b.property));

  return {
    version: 1,
    label: keys.length === 1 ? keys[0].property : `${keys.length} keys`,
    duration: Number((end - anchor).toFixed(4)),
    keys
  };
}

export function serializeGraphClipboard(clipboard: GraphClipboard): string {
  return JSON.stringify(clipboard, null, 2);
}

/** Persists the payload locally and mirrors it to the OS clipboard when allowed. */
export function writeGraphClipboard(clipboard: GraphClipboard): string {
  const text = serializeGraphClipboard(clipboard);
  try {
    localStorage.setItem(GRAPH_CLIPBOARD_STORAGE_KEY, text);
  } catch {
    // Storage can be unavailable in hardened profiles; the in-memory paste
    // path still works because callers keep the returned text.
  }
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    void navigator.clipboard.writeText(text).catch(() => undefined);
  }
  return text;
}

export function readStoredGraphClipboard(): GraphClipboard | null {
  try {
    const text = localStorage.getItem(GRAPH_CLIPBOARD_STORAGE_KEY);
    return text ? parseGraphClipboardText(text, {}) : null;
  } catch {
    return null;
  }
}

interface ParseOptions {
  fps?: number;
  /** Property to use when a pasted table does not name one (usually the selected curve). */
  targetProperty?: string;
}

const AE_PROPERTY_NAMES: Array<[RegExp, string]> = [
  [/anchor\s*point/i, ''],
  [/\bposition\b/i, 'position'],
  [/\bscale\b/i, 'scale'],
  [/z\s*rotation/i, 'rotation.z'],
  [/\brotation\b/i, 'rotation'],
  [/\borientation\b/i, 'rotation'],
  [/\bopacity\b/i, 'material.opacity']
];

function aePropertyBase(label: string, targetProperty?: string): string {
  for (const [pattern, property] of AE_PROPERTY_NAMES) {
    if (pattern.test(label)) return property;
  }
  if (targetProperty) {
    return targetProperty.replace(/\.(x|y|z)$/i, '');
  }
  return 'position';
}

function axisFromLabel(label: string): 'x' | 'y' | 'z' | null {
  const clean = label.toLowerCase();
  if (/\bx\b/.test(clean)) return 'x';
  if (/\by\b/.test(clean)) return 'y';
  if (/\bz\b/.test(clean)) return 'z';
  return null;
}

function splitTableLine(line: string): string[] {
  const source = line.includes('\t') ? line.split('\t') : line.split(/\s{2,}|,|;/);
  return source.map((token) => token.trim()).filter(Boolean);
}

function parseNumberToken(token: string): number | null {
  const cleaned = token.replace(/[,\s]/g, '').replace(/(px|pixels?|%|°|deg|s)$/i, '');
  if (!cleaned || !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

function finalProperty(base: string, axis: 'x' | 'y' | 'z' | null, targetProperty?: string): string {
  if (!base) return targetProperty || 'position.x';
  if (axis) return `${base}.${axis}`;
  if (base === 'rotation') return 'rotation.z';
  if (base === 'position') return targetProperty && /\.(x|y|z)$/.test(targetProperty) ? targetProperty : 'position.y';
  if (base === 'scale') return targetProperty && /\.(x|y|z)$/.test(targetProperty) ? targetProperty : 'scale.x';
  return base;
}

function normalizeValue(property: string, value: number): number {
  if (property === 'material.opacity') return Math.max(0, Math.min(1, value / 100));
  if (/^scale\./.test(property)) return value / 100;
  return value;
}

interface TableRow {
  time: number;
  values: number[];
}

function rowsToClipboard(
  rows: TableRow[],
  axes: Array<'x' | 'y' | 'z' | null>,
  base: string,
  targetProperty: string | undefined,
  label: string
): GraphClipboard | null {
  if (!rows.length) return null;
  const anchor = Math.min(...rows.map((row) => row.time));
  const keys: GraphClipboardKey[] = [];
  for (const row of rows) {
    row.values.forEach((raw, index) => {
      const property = finalProperty(base, axes[index] || null, targetProperty);
      keys.push({
        property,
        offset: Number((row.time - anchor).toFixed(4)),
        value: normalizeValue(property, raw),
        interp: 'bezier'
      });
    });
  }
  if (!keys.length) return null;
  const end = Math.max(...rows.map((row) => row.time));
  return {
    version: 1,
    label,
    duration: Number((end - anchor).toFixed(4)),
    keys: keys.sort((a, b) => a.offset - b.offset || a.property.localeCompare(b.property))
  };
}

/** Parses After Effects' "Keyframe Data" clipboard text. */
function parseAfterEffectsClipboard(text: string, options: ParseOptions): GraphClipboard | null {
  const lines = text.split(/\r?\n/);
  const fpsMatch = text.match(/Units Per Second[\s,;\t]+([\d.]+)/i);
  const fps = Number(fpsMatch?.[1]) || options.fps || 30;
  const headerIndex = lines.findIndex((line) => {
    const tokens = splitTableLine(line);
    return tokens.length >= 2 && /^frame$/i.test(tokens[0]);
  });
  if (headerIndex < 0) return null;

  const headerTokens = splitTableLine(lines[headerIndex]);
  const axisLabels = headerTokens.slice(1);
  const axes = axisLabels.map(axisFromLabel);
  const singleColumn = axisLabels.length <= 1;

  // The line above the header names the property, e.g. "Transform\tPosition".
  let propertyLabel = '';
  for (let index = headerIndex - 1; index >= 0; index -= 1) {
    const candidate = lines[index].trim();
    if (!candidate) continue;
    const tokens = splitTableLine(candidate);
    propertyLabel = tokens[tokens.length - 1] || candidate;
    break;
  }
  const base = aePropertyBase(propertyLabel, options.targetProperty);
  const label = propertyLabel || options.targetProperty || 'After Effects keys';

  const rows: TableRow[] = [];
  for (let index = headerIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) continue;
    const tokens = splitTableLine(line);
    const frame = parseNumberToken(tokens[0] ?? '');
    if (frame === null) {
      // Stop at the next section header but keep scanning blank/trailing rows.
      if (rows.length) break;
      continue;
    }
    const values = tokens
      .slice(1)
      .map(parseNumberToken)
      .filter((value): value is number => value !== null);
    if (!values.length) continue;
    rows.push({ time: frame / fps, values });
  }

  // When AE gives one column for a transform property, pick the most likely
  // axis. Multi-column data maps each column to x/y/z.
  const fallbackAxis: 'x' | 'y' | 'z' | null =
    base === 'rotation' ? 'z' : base === 'position' || base === 'scale' ? 'y' : null;
  const resolvedAxes: Array<'x' | 'y' | 'z' | null> = singleColumn
    ? [fallbackAxis]
    : axes.map(
        (axis, index) =>
          axis || (base === 'rotation' ? (['x', 'y', 'z'][index] as 'x' | 'y' | 'z') : null)
      );

  return rowsToClipboard(rows, resolvedAxes, base, options.targetProperty, label);
}

/** Accepts simple "time,value" tables so curves can be pasted from notes or spreadsheets. */
function parsePlainTable(text: string, options: ParseOptions): GraphClipboard | null {
  const rows: TableRow[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || /^(#|\/\/|time\b|frame\b)/i.test(trimmed)) continue;
    const tokens = trimmed.split(/\t|,|;|\s+/).filter(Boolean);
    if (tokens.length < 2) continue;
    const time = parseNumberToken(tokens[0]);
    if (time === null) continue;
    const values = tokens
      .slice(1)
      .map(parseNumberToken)
      .filter((value): value is number => value !== null);
    if (!values.length) continue;
    rows.push({ time, values });
  }
  const base = options.targetProperty?.replace(/\.(x|y|z)$/i, '') || 'position';
  const axes = options.targetProperty ? [null] : [null];
  return rowsToClipboard(rows, axes, base, options.targetProperty, options.targetProperty || 'Pasted keys');
}

export function parseGraphClipboardText(text: string, options: ParseOptions = {}): GraphClipboard | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      const list = Array.isArray(parsed) ? parsed : parsed?.keys;
      if (!Array.isArray(list) || !list.length) return null;
      const keys: GraphClipboardKey[] = [];
      for (const item of list) {
        if (!item || typeof item !== 'object') continue;
        const property = typeof item.property === 'string' ? item.property : '';
        if (!property) continue;
        const rawTime = Number(item.offset ?? item.time ?? 0);
        if (!Number.isFinite(rawTime)) continue;
        const value =
          typeof item.value === 'number' || typeof item.value === 'string' || typeof item.value === 'boolean'
            ? item.value
            : 0;
        keys.push({
          property,
          offset: rawTime,
          value,
          interp: asInterp(item.interp),
          ...(Number.isFinite(item.tangentIn) ? { tangentIn: Number(item.tangentIn) } : {}),
          ...(Number.isFinite(item.tangentOut) ? { tangentOut: Number(item.tangentOut) } : {}),
          ...(Number.isFinite(item.influenceIn) ? { influenceIn: Number(item.influenceIn) } : {}),
          ...(Number.isFinite(item.influenceOut) ? { influenceOut: Number(item.influenceOut) } : {})
        });
      }
      if (!keys.length) return null;
      keys.sort((a, b) => a.offset - b.offset);
      const first = Math.min(...keys.map((key) => key.offset));
      for (const key of keys) key.offset = Number((key.offset - first).toFixed(4));
      return {
        version: 1,
        label: typeof parsed?.label === 'string' ? parsed.label : `${keys.length} keys`,
        duration: Number((Math.max(...keys.map((key) => key.offset)) - Math.min(...keys.map((key) => key.offset))).toFixed(4)),
        keys
      };
    } catch {
      return null;
    }
  }

  if (/Adobe After Effects|Keyframe Data/i.test(trimmed)) {
    return parseAfterEffectsClipboard(trimmed, options);
  }
  return parsePlainTable(trimmed, options);
}

/** Reads the OS clipboard, falling back to the locally stored curve clipboard. */
export async function readGraphClipboard(options: ParseOptions = {}): Promise<GraphClipboard | null> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.readText) {
    try {
      const text = await navigator.clipboard.readText();
      const parsed = text ? parseGraphClipboardText(text, options) : null;
      if (parsed) return parsed;
    } catch {
      // Permission denied / non-secure context: use the local copy below.
    }
  }
  try {
    const stored = localStorage.getItem(GRAPH_CLIPBOARD_STORAGE_KEY);
    return stored ? parseGraphClipboardText(stored, options) : null;
  } catch {
    return null;
  }
}
