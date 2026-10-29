import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ClipboardCopy,
  Code2,
  Play,
  Sparkles,
  Terminal,
  Wand2,
  X
} from 'lucide-react';
import { useEditorStore } from '../editor/store';
import { SCRIPT_TEMPLATES, scriptHelpersDoc, SCRIPT_LANGUAGE, SCRIPT_RUNTIME } from '../editor/scripts';

const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.top = '0';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    document.body.removeChild(area);
    return ok;
  }
};

interface PromptObject {
  name: string;
  position: number[];
  rotation: number[];
  scale: number[];
}

/**
 * A self-contained brief for any external assistant (Gemini, ChatGPT, Claude…).
 * The language, runtime and coding style are fixed here so the pasted answer
 * drops straight into this editor.
 */
const buildScriptPrompt = (object: PromptObject, source: string, request: string): string => {
  const vec = (values: number[]) => `[${values.map((value) => Number(value.toFixed(3))).join(', ')}]`;
  const ask = request.trim() || 'Improve the current object while keeping the same idea.';
  return `You are a senior Three.js engineer writing ONE procedural object for Vexlum, a desktop 3D scene editor.

LANGUAGE AND RUNTIME (fixed — do not change it)
- Language: ${SCRIPT_LANGUAGE}. Plain JavaScript only: no TypeScript, no JSX, no imports or require().
- ${SCRIPT_RUNTIME}
- In scope: THREE (the three.js r186 namespace), material (this object's MeshStandardMaterial or undefined), helpers.mesh(geometry, options), helpers.group(), helpers.color('#rrggbb').
- Banned: imports, require, fetch/XHR, window/document/DOM, localStorage, eval, async/await, setTimeout, top-level await.
- The script must return exactly one THREE.Object3D (Group, Mesh, Points or Line). Never return an array, a Promise or a primitive.
- Deterministic output required: no Math.random() and no Date.now(). If you need variation, use a tiny seeded PRNG.

STYLE I EXPECT
- Modern, readable ES2020: const/let, arrow functions, 2-space indent, short focused helper functions.
- Build a single THREE.Group as the root and add meshes to it.
- Use MeshStandardMaterial (or clone the provided material) with believable roughness/metalness; set castShadow and receiveShadow on every mesh.
- Centre the model on the origin, Y up, roughly 2-3 units tall, resting on y = 0 so it sits on the floor.
- Prefer BufferGeometry / InstancedMesh for repeated parts. Stay under ~2,000 meshes and 200 KB of source.
- Use 1-3 short comments for the non-obvious steps. No console.log, no debug output.

TARGET OBJECT
- Name: ${object.name}
- Kind: script object
- Position: ${vec(object.position)}
- Rotation: ${vec(object.rotation)} (degrees)
- Scale: ${vec(object.scale)}

WHAT I WANT BUILT
${ask}

CURRENT SCRIPT (replace it)
\`\`\`js
${source.trim() || '// empty'}
\`\`\`

Return ONLY the complete replacement JavaScript for the script. No markdown fences, no explanation, no extra files.`;
};

export const ScriptEditor: React.FC = () => {
  const id = useEditorStore((state) => state.scriptEditorId);
  const object = useEditorStore((state) =>
    state.scriptEditorId
      ? state.project.objects.find((item) => item.id === state.scriptEditorId) || null
      : null
  );
  const errors = useEditorStore((state) => state.scriptErrors);
  const close = useEditorStore((state) => state.closeScriptEditor);
  const updateScript = useEditorStore((state) => state.updateScript);

  const [draft, setDraft] = useState('');
  const [template, setTemplate] = useState('');
  const [status, setStatus] = useState<'idle' | 'running' | 'ok'>('idle');
  const [promptOpen, setPromptOpen] = useState(false);
  const [promptRequest, setPromptRequest] = useState('');
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const error = id ? errors[id] : undefined;
  const aiPrompt = object
    ? buildScriptPrompt(
        {
          name: object.name,
          position: object.position,
          rotation: object.rotation,
          scale: object.scale
        },
        draft,
        promptRequest
      )
    : '';

  const copyPrompt = async () => {
    if (!aiPrompt) return;
    const ok = await copyToClipboard(aiPrompt);
    setCopied(ok);
    window.setTimeout(() => setCopied(false), 1800);
  };

  useEffect(() => {
    if (!object?.script) return;
    setDraft(object.script.source);
    setTemplate('');
    setStatus('idle');
  }, [object?.id]);

  const lineCount = useMemo(() => Math.max(1, draft.split('\n').length), [draft]);

  if (!id || !object) return null;

  const apply = () => {
    setStatus('running');
    updateScript(id, draft);
    window.setTimeout(() => setStatus('ok'), 260);
  };

  const chooseTemplate = (value: string) => {
    setTemplate(value);
    const found = SCRIPT_TEMPLATES.find((item) => item.id === value);
    if (found) {
      setDraft(found.source);
      textareaRef.current?.focus();
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <div
        className="modal flex flex-col overflow-hidden"
        style={{ width: 'min(880px, 92vw)', maxHeight: '88vh' }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#232830] px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-cyan-500/30 bg-cyan-500/10">
              <Code2 className="h-4 w-4 text-cyan-300" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-[13px] font-semibold text-white">
                Script · {object.name}
              </h2>
              <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#5f6a78]">
                {lineCount} lines · {SCRIPT_LANGUAGE} · returns a THREE.Object3D
              </p>
            </div>
          </div>
          <button type="button" className="icon-btn" onClick={close} title="Close (Esc)">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center gap-2 border-b border-[#1d222a] bg-[#0e1014] px-3 py-2">
            <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.1em] text-[#6b7280]">
              <Sparkles className="h-3 w-3 text-amber-400" /> Template
            </span>
            <select
              value={template}
              onChange={(event) => chooseTemplate(event.target.value)}
              className="h-6 rounded border border-[#2a3038] bg-[#11141a] px-1.5 text-[9.5px] text-[#cbd5e1] outline-none"
            >
              <option value="">Keep current code…</option>
              {SCRIPT_TEMPLATES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} — {item.hint}
                </option>
              ))}
            </select>

            <span className="chip" title="The language this script is written in">
              <Code2 className="h-2 w-2 text-cyan-300" /> {SCRIPT_LANGUAGE}
            </span>
            <span className="chip" title="How Vexlum evaluates the script">
              <Terminal className="h-2 w-2 text-emerald-300" /> THREE r186 · no imports
            </span>

            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                className="btn h-7 px-2 text-[10px]"
                onClick={() => setPromptOpen((value) => !value)}
                title="Copy a ready-made prompt for Gemini, ChatGPT or any other assistant"
              >
                <Wand2 className="h-3 w-3 text-fuchsia-300" /> AI prompt
              </button>
              {status === 'ok' && !error && (
                <span className="flex items-center gap-1 font-mono text-[9px] text-emerald-400">
                  <Check className="h-3 w-3" /> compiled
                </span>
              )}
              {error && (
                <span className="flex items-center gap-1 font-mono text-[9px] text-red-400">
                  <AlertTriangle className="h-3 w-3" /> error
                </span>
              )}
              <button type="button" className="btn h-7 px-3 text-[10px]" onClick={apply}>
                <Play className="h-3 w-3 text-emerald-400" /> Run (Ctrl+Enter)
              </button>
              <button type="button" className="btn btn-accent h-7 px-3 text-[10px]" onClick={close}>
                Done
              </button>
            </div>
          </div>

          {promptOpen && (
            <div className="border-b border-[#1d222a] bg-[#0b0e13] px-3 py-2">
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                <span className="flex items-center gap-1 text-[8.5px] font-bold uppercase tracking-[0.12em] text-[#6b7280]">
                  <Sparkles className="h-3 w-3 text-fuchsia-300" /> Prompt for an external AI
                </span>
                <span className="font-mono text-[8px] text-[#4b5563]">
                  language + style are fixed below — just add what to build
                </span>
                <button
                  type="button"
                  onClick={() => void copyPrompt()}
                  className="ml-auto flex h-[22px] items-center gap-1 rounded border border-fuchsia-500/35 bg-fuchsia-500/10 px-2 text-[9px] font-semibold text-fuchsia-200 hover:bg-fuchsia-500/20"
                >
                  {copied ? <Check className="h-2.5 w-2.5" /> : <ClipboardCopy className="h-2.5 w-2.5" />}
                  {copied ? 'Copied' : 'Copy prompt'}
                </button>
                <button
                  type="button"
                  onClick={() => setPromptOpen(false)}
                  className="flex h-[22px] w-[22px] items-center justify-center rounded text-[#6b7280] hover:bg-white/5 hover:text-white"
                  title="Hide prompt"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
              <input
                value={promptRequest}
                onChange={(event) => setPromptRequest(event.target.value)}
                placeholder="What should it build? e.g. a low-poly chrome ring with 3 floating shards"
                className="mb-1.5 h-[26px] w-full rounded border border-[#2a3038] bg-[#101217] px-2 text-[10px] text-[#d1d5db] outline-none placeholder:text-[#4b5563] focus:border-fuchsia-700/70"
                spellCheck={false}
              />
              <pre className="max-h-[168px] select-text overflow-auto whitespace-pre-wrap rounded border border-[#232830] bg-[#080a0d] p-2 font-mono text-[8.5px] leading-relaxed text-[#8b95a5]">
                {aiPrompt}
              </pre>
            </div>
          )}

          <div className="min-h-0 flex-1 bg-[#0a0c0f]">
            <textarea
              ref={textareaRef}
              value={draft}
              spellCheck={false}
              wrap="off"
              style={{ height: 'min(52vh, 520px)' }}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                  event.preventDefault();
                  apply();
                }
                if (event.key === 'Escape') {
                  event.stopPropagation();
                  close();
                }
                if (event.key === 'Tab') {
                  event.preventDefault();
                  const target = event.currentTarget;
                  const start = target.selectionStart;
                  const end = target.selectionEnd;
                  const next = `${draft.slice(0, start)}  ${draft.slice(end)}`;
                  setDraft(next);
                  window.requestAnimationFrame(() => {
                    target.selectionStart = target.selectionEnd = start + 2;
                  });
                }
              }}
              className="block w-full resize-none bg-transparent p-3 font-mono text-[11px] leading-[1.65] text-[#d5dbe3] outline-none"
            />
          </div>

          {error ? (
            <div className="border-t border-red-500/25 bg-red-950/25 px-3 py-2 font-mono text-[10px] leading-relaxed text-red-300">
              {error}
            </div>
          ) : (
            <div className="border-t border-[#1d222a] bg-[#0b0d10] px-3 py-2 font-mono text-[9px] leading-relaxed text-[#5f6a78]">
              {scriptHelpersDoc()} Press Ctrl+Enter to compile. A failed script shows a red
              wireframe placeholder instead of breaking the scene.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
