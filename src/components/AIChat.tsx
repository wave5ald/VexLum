import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronDown,
  Cpu,
  Eye,
  EyeOff,
  KeyRound,
  Check,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Settings2,
  Sparkles,
  Square,
  Trash2,
  Wand2,
  X,
  Zap
} from 'lucide-react';
import { useEditorStore } from '../editor/store';
import {
  AI_PROVIDERS,
  AIChatTurn,
  AIConfig,
  buildSystemPrompt,
  discoverModels,
  getAIConfig,
  getAIProvider,
  providerModels,
  requestAI,
  resolveAI,
  setAIConfig,
  subscribeAIConfig
} from '../editor/ai';
import { applyAIActions, parseAIResponse } from '../editor/aiActions';
import { sourceManifest } from '../editor/aiContext';

interface AIChatProps {
  open: boolean;
  onClose: () => void;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  logs?: string[];
  error?: boolean;
}

interface ChatError {
  message: string;
  kind: 'error' | 'timeout';
}

const messageId = () => `msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

const QUICK_PROMPTS = [
  'Build a glass product shot',
  'Drop the selected object like slime at the playhead',
  'Add a procedural Möbius ribbon',
  'Explain how camera aim modes work',
  'Create a null and parent the selected object to it'
];

const fieldClass =
  'h-[26px] w-full rounded border border-[#2a3038] bg-[#101217] px-2 text-[10px] text-[#d1d5db] outline-none placeholder:text-[#4b5563] focus:border-cyan-700';

const MarkdownText: React.FC<{ text: string }> = ({ text }) => {
  const parts = text.split(/```/);
  return (
    <div className="space-y-1.5">
      {parts.map((part, index) => {
        if (!part.trim()) return null;
        if (index % 2 === 1) {
          const code = part.replace(/^[a-zA-Z0-9_-]+\n/, '');
          return (
            <pre
              key={index}
              className="overflow-x-auto rounded-md border border-[#232830] bg-[#070a0e] p-2 font-mono text-[9px] leading-relaxed text-[#a5b4c4]"
            >
              {code.trim()}
            </pre>
          );
        }
        return (
          <div key={index} className="whitespace-pre-wrap text-[11px] leading-relaxed text-[#cbd5e1]">
            {part}
          </div>
        );
      })}
    </div>
  );
};

export const AIChat: React.FC<AIChatProps> = ({ open, onClose }) => {
  const project = useEditorStore((state) => state.project);
  const [config, setConfig] = useState<AIConfig>(() => getAIConfig());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [browserOpen, setBrowserOpen] = useState(false);
  const [modelQuery, setModelQuery] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<ChatError | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const stopRequested = useRef(false);
  const lastRequest = useRef('');
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const provider = getAIProvider(config.provider);
  const resolved = resolveAI(config);
  const currentModel = resolved.model;
  const modelOptions = useMemo(
    () => providerModels(config, provider.id),
    [config, provider.id]
  );
  const discoveredCount = config.discovered?.[provider.id]?.length || 0;
  const manifest = useMemo(() => sourceManifest(), []);
  const sourceFileCount = useMemo(() => manifest.split('\n').filter(Boolean).length, [manifest]);

  useEffect(() => subscribeAIConfig(setConfig), []);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 100);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending, error]);

  useEffect(() => {
    if (!sending) {
      setElapsed(0);
      return;
    }
    const started = Date.now();
    setElapsed(0);
    const timer = window.setInterval(() => setElapsed((Date.now() - started) / 1000), 250);
    return () => window.clearInterval(timer);
  }, [sending]);

  useEffect(() => {
    if (!messages.length && open) {
      setMessages([
        {
          id: messageId(),
          role: 'assistant',
          text:
            "I am Vexlum Copilot. I can read this build's source, manipulate the scene, animate, add effects, and write procedural Three.js objects.\n\nPick any model from the dropdown in the header — Pollinations is free with no key, and Gemini, DeepSeek, OpenAI, Anthropic, Groq, Mistral, OpenRouter, OpenCode Zen, Ollama and custom endpoints work once you paste a key in Settings.\n\nWhat should we build?"
        }
      ]);
    }
  }, [open, messages.length]);

  if (!open) return null;

  const updateConfig = (patch: Partial<AIConfig>) => {
    // One shared store: the surroundings generator picks this up immediately.
    setAIConfig({ ...config, ...patch });
  };

  const setProvider = (providerId: AIConfig['provider']) => {
    const nextProvider = getAIProvider(providerId);
    setSyncStatus(null);
    updateConfig({
      provider: providerId,
      models: {
        ...config.models,
        [providerId]: config.models[providerId] || nextProvider.defaultModel
      }
    });
  };

  const chooseModel = (providerId: AIConfig['provider'], model: string) => {
    if (!model) return;
    updateConfig({
      provider: providerId,
      models: { ...config.models, [providerId]: model }
    });
    setSyncStatus(null);
    setBrowserOpen(false);
  };

  const browserGroups = AI_PROVIDERS.map((item) => {
    const query = modelQuery.trim().toLowerCase();
    const models = providerModels(config, item.id).filter(
      (model) =>
        !query ||
        `${model.id} ${model.label} ${model.note || ''}`.toLowerCase().includes(query)
    );
    return { provider: item, models };
  }).filter((group) => group.models.length > 0);

  const syncModels = async () => {
    if (syncing) return;
    setSyncing(true);
    setSyncStatus(null);
    try {
      const ids = await discoverModels(config);
      updateConfig({
        discovered: { ...(config.discovered || {}), [provider.id]: ids }
      });
      setSyncStatus(`Loaded ${ids.length} models from ${provider.label}.`);
    } catch (syncError: any) {
      setSyncStatus(syncError?.message ? String(syncError.message) : 'Could not load models.');
    } finally {
      setSyncing(false);
    }
  };

  const send = async (textOverride?: string, appendUser = true) => {
    const text = (textOverride ?? input).trim();
    if (!text || sending) return;
    if (textOverride === undefined) setInput('');
    setError(null);
    setSyncStatus(null);
    const userMessage: ChatMessage = { id: messageId(), role: 'user', text };
    const prior = messages.filter((message) => !message.error);
    if (appendUser) setMessages((current) => [...current, userMessage]);
    lastRequest.current = text;
    setSending(true);
    stopRequested.current = false;
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const state = useEditorStore.getState();
      const system = buildSystemPrompt(state.project, state.selectedId, state.time, text);
      const history = appendUser ? [...prior, userMessage] : prior;
      const turns: AIChatTurn[] = history
        .slice(-12)
        .map((message) => ({ role: message.role, content: message.text.slice(0, 16000) }));
      const raw = await requestAI(config, turns, system, controller.signal);
      // A stop that landed while the provider was finishing must not touch the scene.
      if (controller.signal.aborted || stopRequested.current) return;
      const parsed = parseAIResponse(raw);
      const logs = parsed.actions.length ? applyAIActions(parsed.actions) : [];
      const body = parsed.text.trim();
      setMessages((current) => [
        ...current,
        {
          id: messageId(),
          role: 'assistant',
          text:
            body ||
            (logs.length
              ? 'Done — the scene has been updated.'
              : parsed.actions.length
                ? 'The action block could not be executed.'
                : 'The model returned an empty reply.'),
          logs
        }
      ]);
    } catch (requestError: any) {
      const canceled =
        requestError?.code === 'canceled' ||
        stopRequested.current ||
        requestError?.name === 'AbortError' ||
        /aborted/i.test(String(requestError?.message));
      if (canceled) {
        setMessages((current) => [
          ...current,
          { id: messageId(), role: 'assistant', text: 'Stopped.', error: true }
        ]);
      } else {
        setError({
          message: requestError?.message ? String(requestError.message) : String(requestError),
          kind: requestError?.code === 'timeout' ? 'timeout' : 'error'
        });
      }
    } finally {
      setSending(false);
      abortRef.current = null;
    }
  };

  const stop = () => {
    stopRequested.current = true;
    abortRef.current?.abort();
    setSending(false);
  };

  const clearChat = () => {
    stopRequested.current = true;
    abortRef.current?.abort();
    setMessages([]);
    setError(null);
  };

  const saveAndCloseSettings = () => {
    setAIConfig(config);
    setSettingsOpen(false);
    if (provider.requiresKey && !resolved.key) {
      setError({ message: `Add an API key for ${provider.label}.`, kind: 'error' });
    } else {
      setError(null);
    }
  };

  const retry = () => {
    if (!lastRequest.current) return;
    setError(null);
    void send(lastRequest.current, false);
  };

  return (
    <div
      className="fixed inset-0 z-[85] flex items-center justify-center bg-[#04060a]/75 p-4 backdrop-blur-md"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {/* Ambient backdrop: soft studio glows + a faint grid behind the panel. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(1100px 560px at 50% -8%, rgba(34, 211, 238, 0.16), transparent 62%), radial-gradient(820px 520px at 88% 108%, rgba(217, 70, 239, 0.13), transparent 60%), radial-gradient(700px 460px at 6% 96%, rgba(59, 130, 246, 0.1), transparent 60%)'
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.16]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(148, 163, 184, 0.35) 1px, transparent 1px), linear-gradient(90deg, rgba(148, 163, 184, 0.35) 1px, transparent 1px)',
          backgroundSize: '52px 52px',
          maskImage: 'radial-gradient(ellipse at 50% 45%, black 20%, transparent 78%)',
          WebkitMaskImage: 'radial-gradient(ellipse at 50% 45%, black 20%, transparent 78%)'
        }}
      />

      <div className="relative flex h-[min(88vh,880px)] w-[min(1160px,96vw)] flex-col overflow-hidden rounded-2xl border border-cyan-500/15 bg-[#090b10]/97 shadow-[0_40px_140px_rgba(0,0,0,0.75),0_0_0_1px_rgba(34,211,238,0.05)]">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-400/50 to-transparent" />

        <div className="flex h-[56px] flex-shrink-0 items-center gap-3 border-b border-[#1d222a] bg-gradient-to-b from-[#12171f]/90 to-[#0b0e13]/90 px-4">
          <div className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-400/25 bg-gradient-to-br from-cyan-500/20 to-fuchsia-500/10 shadow-[0_0_20px_rgba(34,211,238,0.18)]">
            <Bot className="h-4 w-4 text-cyan-200" />
            <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-emerald-400 ring-2 ring-[#0d1117]" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[12px] font-semibold text-white">
              Vexlum Copilot
              <span className="rounded border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[7.5px] uppercase tracking-wider text-emerald-300">
                {provider.requiresKey ? 'BYOK' : 'FREE'}
              </span>
            </div>
            <div className="truncate font-mono text-[8.5px] text-[#5f6a78]">
              {sourceFileCount} source files indexed · keys stay on this device
            </div>
          </div>

          <div className="ml-auto flex min-w-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setBrowserOpen((value) => !value);
                setSettingsOpen(false);
              }}
              className={`flex h-7 max-w-[270px] min-w-0 items-center gap-1.5 rounded-md border px-2 text-[9.5px] font-medium transition-colors ${
                browserOpen
                  ? 'border-cyan-500/40 bg-cyan-500/15 text-cyan-100'
                  : 'border-[#2a3038] bg-[#101217] text-[#cbd5e1] hover:border-cyan-700/70'
              }`}
              title="Choose a model — every provider plus the API key live here"
            >
              <Cpu className="h-3 w-3 flex-shrink-0 text-cyan-400/80" />
              <span className="truncate">{currentModel || 'Choose a model'}</span>
              {provider.requiresKey && (
                <span
                  className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${
                    resolved.key ? 'bg-emerald-400' : 'bg-amber-400'
                  }`}
                  title={resolved.key ? 'API key saved' : 'API key missing'}
                />
              )}
              <ChevronDown
                className={`h-2.5 w-2.5 flex-shrink-0 transition-transform ${browserOpen ? 'rotate-180' : ''}`}
              />
            </button>
            <button
              type="button"
              onClick={() => {
                setSettingsOpen((value) => !value);
                setBrowserOpen(false);
              }}
              className={`flex h-7 items-center gap-1.5 rounded-md border px-2 text-[9.5px] font-medium transition-colors ${
                settingsOpen
                  ? 'border-cyan-500/40 bg-cyan-500/15 text-cyan-200'
                  : 'border-[#2a3038] bg-[#15181d] text-[#9aa4b2] hover:text-white'
              }`}
            >
              <Settings2 className="h-3 w-3" />
              Settings
              <ChevronDown className={`h-2.5 w-2.5 transition-transform ${settingsOpen ? 'rotate-180' : ''}`} />
            </button>
            <button
              type="button"
              onClick={clearChat}
              className="flex h-7 w-7 items-center justify-center rounded-md border border-[#2a3038] bg-[#15181d] text-[#8b95a5] hover:text-red-300"
              title="Clear chat"
            >
              <Trash2 className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-md border border-[#2a3038] bg-[#15181d] text-[#8b95a5] hover:text-white"
              title="Close"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {browserOpen && (
          <div className="flex-shrink-0 border-b border-[#1d222a] bg-[#090c11]">
            <div className="flex items-center gap-2 px-3 pt-2.5">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-[#4b5563]" />
                <input
                  value={modelQuery}
                  onChange={(event) => setModelQuery(event.target.value)}
                  placeholder="Search every model — Gemini, DeepSeek, GPT, Claude…"
                  className="h-[28px] w-full rounded-md border border-[#2a3038] bg-[#0d1015] pl-7 pr-2 text-[10px] text-[#d1d5db] outline-none placeholder:text-[#4b5563] focus:border-cyan-700"
                  spellCheck={false}
                  autoFocus
                />
              </div>
              <button
                type="button"
                onClick={() => void syncModels()}
                disabled={syncing}
                className="flex h-[28px] items-center gap-1.5 rounded-md border border-[#2a3038] bg-[#15181d] px-2 text-[9px] text-[#9aa4b2] hover:border-cyan-700 hover:text-cyan-200 disabled:opacity-40"
                title={`Load the live model list from ${provider.label}`}
              >
                {syncing ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="h-3 w-3" />
                )}
                Sync
              </button>
              <button
                type="button"
                onClick={() => setBrowserOpen(false)}
                className="flex h-[28px] w-[28px] items-center justify-center rounded-md border border-[#2a3038] bg-[#15181d] text-[#7b8595] hover:text-white"
                title="Close model list"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
            {syncStatus && (
              <div className="px-3 pt-1.5 font-mono text-[8px] text-[#8b95a5]">{syncStatus}</div>
            )}
            <div className="mt-2 max-h-[250px] overflow-y-auto px-2 pb-2">
              {browserGroups.map((group) => {
                const groupKey = config.keys[group.provider.id]?.trim();
                return (
                  <div key={group.provider.id} className="mb-1.5">
                    <div className="sticky top-0 z-10 flex items-center gap-2 bg-[#090c11]/95 px-1.5 py-1 backdrop-blur">
                      <span className="text-[8px] font-bold uppercase tracking-[0.12em] text-[#6b7280]">
                        {group.provider.label}
                      </span>
                      {group.provider.requiresKey && (
                        <span
                          className={`font-mono text-[7.5px] ${
                            groupKey ? 'text-emerald-400/80' : 'text-amber-400/80'
                          }`}
                        >
                          {groupKey ? 'key saved' : 'needs key'}
                        </span>
                      )}
                      <span className="ml-auto font-mono text-[7.5px] text-[#3f4854]">
                        {group.models.length}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-1 xl:grid-cols-3">
                      {group.models.map((model) => {
                        const active =
                          config.provider === group.provider.id && currentModel === model.id;
                        return (
                          <button
                            key={`${group.provider.id}:${model.id}`}
                            type="button"
                            onClick={() => chooseModel(group.provider.id, model.id)}
                            className={`flex min-w-0 items-center gap-1.5 rounded border px-1.5 py-1 text-left transition-colors ${
                              active
                                ? 'border-cyan-500/45 bg-cyan-500/10'
                                : 'border-[#232830] bg-[#0d1015] hover:border-[#39414c] hover:bg-[#12161c]'
                            }`}
                            title={`${model.label}${model.note ? ` · ${model.note}` : ''}\n${model.id}`}
                          >
                            <span
                              className={`min-w-0 flex-1 truncate text-[9.5px] ${
                                active ? 'text-cyan-100' : 'text-[#c3ccd8]'
                              }`}
                            >
                              {model.label}
                            </span>
                            {model.note && (
                              <span className="hidden truncate font-mono text-[7.5px] text-[#4b5563] 2xl:inline">
                                {model.note}
                              </span>
                            )}
                            {active && <Check className="h-2.5 w-2.5 flex-shrink-0 text-cyan-300" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {!browserGroups.length && (
                <div className="px-2 py-5 text-center text-[9.5px] text-[#4b5563]">
                  No models match “{modelQuery}”. Clear the search or press Sync.
                </div>
              )}
            </div>
            <div className="flex items-end gap-2 border-t border-[#161b22] px-3 py-2">
              <label className="block min-w-0 flex-1">
                <span className="mb-1 block text-[8px] font-bold uppercase tracking-[0.12em] text-[#6b7280]">
                  API key · {provider.label}
                  {provider.requiresKey ? (resolved.key ? ' · saved' : ' · required') : ' · optional'}
                </span>
                <div className="flex gap-1">
                  <input
                    className={fieldClass}
                    type={showKey ? 'text' : 'password'}
                    value={config.keys[provider.id] ?? ''}
                    onChange={(event) =>
                      updateConfig({ keys: { ...config.keys, [provider.id]: event.target.value } })
                    }
                    placeholder={provider.requiresKey ? 'sk-… paste the key here' : 'optional'}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey((value) => !value)}
                    className="flex h-[26px] w-8 flex-shrink-0 items-center justify-center rounded border border-[#2a3038] bg-[#15181d] text-[#7b8595] hover:text-white"
                    title={showKey ? 'Hide key' : 'Show key'}
                  >
                    {showKey ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  </button>
                </div>
              </label>
              <span className="mb-1 hidden max-w-[220px] font-mono text-[7.5px] leading-snug text-[#4b5563] sm:block">
                Saved on this device and shared with the surroundings AI.
              </span>
            </div>
          </div>
        )}

        {settingsOpen && (
          <div className="flex-shrink-0 border-b border-[#1d222a] bg-[#0b0e13]/95 p-3">
            <div className="grid gap-2 md:grid-cols-[1.15fr_1fr_1fr]">
              <div className="block min-w-0">
                <span className="mb-1 block text-[8.5px] font-bold uppercase tracking-[0.12em] text-[#6b7280]">Provider</span>
                <div className="grid max-h-[86px] grid-cols-3 gap-1 overflow-y-auto pr-0.5">
                  {AI_PROVIDERS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setProvider(item.id)}
                      title={item.label}
                      className={`h-[24px] truncate rounded border px-1 text-[8px] font-medium transition-colors ${
                        config.provider === item.id
                          ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200'
                          : 'border-[#2a3038] bg-[#101217] text-[#8b95a5] hover:border-[#39414c] hover:text-white'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
              <label className="block">
                <span className="mb-1 flex items-center gap-1.5 text-[8.5px] font-bold uppercase tracking-[0.12em] text-[#6b7280]">
                  Model
                  <button
                    type="button"
                    onClick={() => {
                      setBrowserOpen(true);
                      setSettingsOpen(false);
                    }}
                    className="font-mono text-[7.5px] normal-case tracking-normal text-cyan-300/80 hover:text-cyan-200"
                  >
                    {modelOptions.length} known · browse
                  </button>
                  <button
                    type="button"
                    onClick={() => void syncModels()}
                    disabled={syncing}
                    className="ml-auto flex h-[16px] items-center gap-1 rounded border border-[#2a3038] bg-[#15181d] px-1.5 font-mono text-[7.5px] normal-case tracking-normal text-[#9aa4b2] hover:border-cyan-700 hover:text-cyan-200 disabled:opacity-40"
                    title="Fetch the model list from the provider"
                  >
                    {syncing ? <Loader2 className="h-2 w-2 animate-spin" /> : <RefreshCw className="h-2 w-2" />}
                    Sync
                  </button>
                </span>
                <input
                  className={fieldClass}
                  value={currentModel}
                  onChange={(event) =>
                    updateConfig({ models: { ...config.models, [provider.id]: event.target.value } })
                  }
                  placeholder="Type any model ID"
                  spellCheck={false}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[8.5px] font-bold uppercase tracking-[0.12em] text-[#6b7280]">
                  {provider.requiresKey ? 'API key' : 'API key (not required)'}
                </span>
                <div className="relative flex gap-1">
                  <input
                    className={fieldClass}
                    type={showKey ? 'text' : 'password'}
                    value={config.keys[provider.id] ?? ''}
                    onChange={(event) =>
                      updateConfig({ keys: { ...config.keys, [provider.id]: event.target.value } })
                    }
                    placeholder={provider.requiresKey ? 'sk-…' : 'optional'}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey((value) => !value)}
                    className="flex h-[26px] w-8 flex-shrink-0 items-center justify-center rounded border border-[#2a3038] bg-[#15181d] text-[#7b8595] hover:text-white"
                    title={showKey ? 'Hide key' : 'Show key'}
                  >
                    {showKey ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  </button>
                </div>
              </label>
            </div>
            <div className="mt-2 grid gap-2 md:grid-cols-[1.6fr_1fr_auto]">
              <label className="block">
                <span className="mb-1 block text-[8.5px] font-bold uppercase tracking-[0.12em] text-[#6b7280]">
                  Base URL (advanced)
                </span>
                <input
                  className={fieldClass}
                  value={config.baseUrls[provider.id] ?? ''}
                  onChange={(event) =>
                    updateConfig({ baseUrls: { ...config.baseUrls, [provider.id]: event.target.value } })
                  }
                  placeholder={provider.baseUrl || 'https://your-endpoint/v1'}
                  spellCheck={false}
                />
              </label>
              <div className="flex items-end">
                <div className="flex w-full items-start gap-1.5 rounded-md border border-[#232830] bg-[#101217] px-2 py-1.5 text-[8.5px] leading-snug text-[#5f6a78]">
                  <KeyRound className="mt-0.5 h-3 w-3 flex-shrink-0 text-amber-400/70" />
                  Keys stay on this device in localStorage and are sent only to the selected provider.
                </div>
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={saveAndCloseSettings}
                  className="flex h-[26px] items-center gap-1.5 rounded border border-cyan-500/35 bg-cyan-500/15 px-3 text-[9.5px] font-semibold text-cyan-200 hover:bg-cyan-500/25"
                >
                  <CheckCircle2 className="h-3 w-3" />
                  Apply
                </button>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[8.5px] text-[#5f6a78]">
              <Sparkles className="h-3 w-3 text-fuchsia-400" />
              {provider.hint}
              <span className="rounded bg-[#15181d] px-1.5 py-0.5 font-mono text-[8px] text-[#7b8595]">
                {discoveredCount ? `${discoveredCount} synced` : 'presets · custom IDs allowed'}
              </span>
              {syncStatus && (
                <span
                  className={`flex items-center gap-1 font-mono text-[8px] ${
                    syncStatus.startsWith('Loaded') ? 'text-emerald-400/90' : 'text-amber-300/90'
                  }`}
                >
                  {syncStatus.startsWith('Loaded') ? (
                    <CheckCircle2 className="h-2.5 w-2.5" />
                  ) : (
                    <AlertTriangle className="h-2.5 w-2.5" />
                  )}
                  {syncStatus}
                </span>
              )}
            </div>
          </div>
        )}

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <div className="mx-auto flex max-w-[840px] flex-col gap-3">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-2.5 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}
              >
                <div
                  className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md border ${
                    message.role === 'user'
                      ? 'border-[#39414c] bg-[#1a1f26] text-[#cbd5e1]'
                      : message.error
                        ? 'border-red-500/25 bg-red-500/10 text-red-300'
                        : 'border-cyan-500/25 bg-cyan-500/10 text-cyan-300'
                  }`}
                >
                  {message.role === 'user' ? (
                    <span className="text-[9px] font-bold">YOU</span>
                  ) : (
                    <Bot className="h-3.5 w-3.5" />
                  )}
                </div>
                <div
                  className={`min-w-0 max-w-[calc(100%-40px)] rounded-xl border px-3 py-2 ${
                    message.role === 'user'
                      ? 'border-cyan-500/15 bg-[#101820]'
                      : message.error
                        ? 'border-red-500/25 bg-red-950/20'
                        : 'border-[#232830] bg-gradient-to-b from-[#0f1319] to-[#0c1015]'
                  }`}
                >
                  {message.role === 'assistant' ? (
                    <MarkdownText text={message.text} />
                  ) : (
                    <div className="whitespace-pre-wrap text-[11px] leading-relaxed text-[#dbe2ea]">
                      {message.text}
                    </div>
                  )}
                  {message.logs && message.logs.length > 0 && (
                    <div className="mt-2 space-y-0.5 rounded-md border border-emerald-500/15 bg-emerald-500/5 px-2 py-1.5">
                      {message.logs.map((log, index) => (
                        <div
                          key={index}
                          className="flex items-start gap-1.5 font-mono text-[8.5px] text-emerald-300/90"
                        >
                          <CheckCircle2 className="mt-0.5 h-2.5 w-2.5 flex-shrink-0" />
                          <span>{log}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {sending && (
              <div className="flex items-center gap-2.5">
                <div className="flex h-6 w-6 items-center justify-center rounded-md border border-cyan-500/25 bg-cyan-500/10">
                  <Bot className="h-3.5 w-3.5 text-cyan-300" />
                </div>
                <div className="flex items-center gap-2 rounded-xl border border-[#232830] bg-[#0f1217] px-3 py-2 text-[10px] text-[#7b8595]">
                  <Loader2 className="h-3 w-3 animate-spin text-cyan-400" />
                  {provider.label} · {currentModel || 'no model'}
                  <span className="font-mono text-[9px] text-[#4b5563]">
                    {elapsed.toFixed(0)}s
                  </span>
                  <span className="text-[#4b5563]">· reading the source and building actions</span>
                </div>
              </div>
            )}

            {error && (
              <div className="ml-9 rounded-lg border border-red-500/30 bg-red-950/25 px-3 py-2">
                <div className="flex items-start gap-2 text-[10px] leading-relaxed text-red-200">
                  <Zap className="mt-0.5 h-3 w-3 flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="font-semibold">
                      {error.kind === 'timeout' ? 'Request timed out' : 'Request failed'}
                    </div>
                    <div className="mt-0.5 select-text break-words font-mono text-[9px] text-red-200/80">
                      {error.message}
                    </div>
                    <div className="mt-1 flex items-center gap-3">
                      {lastRequest.current && (
                        <button
                          type="button"
                          onClick={retry}
                          className="flex items-center gap-1 text-[9px] font-semibold text-amber-300 hover:text-amber-200"
                        >
                          <RotateCcw className="h-2.5 w-2.5" /> Try again
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setSettingsOpen(true)}
                        className="text-[9px] font-semibold text-cyan-300 hover:text-cyan-200"
                      >
                        Open AI settings
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex-shrink-0 border-t border-[#1d222a] bg-gradient-to-b from-[#0b0e13] to-[#090b10] px-4 py-3">
          <div className="mx-auto max-w-[840px]">
            <div className="mb-2 flex flex-wrap gap-1">
              {QUICK_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  disabled={sending}
                  onClick={() => void send(prompt)}
                  className="rounded-full border border-[#2a3038] bg-[#15181d] px-2.5 py-1 text-[9px] text-[#8b95a5] transition-colors hover:border-fuchsia-500/35 hover:text-fuchsia-200 disabled:opacity-40"
                >
                  {prompt}
                </button>
              ))}
            </div>
            <div className="flex items-end gap-2 rounded-xl border border-[#2a3038] bg-[#101217] p-1.5 focus-within:border-cyan-700/70">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void send();
                  }
                }}
                rows={2}
                placeholder="Ask anything, or describe the scene, effect or script object you want…"
                className="min-h-[42px] flex-1 resize-none bg-transparent px-2 py-1 text-[11px] leading-relaxed text-[#e2e8f0] outline-none placeholder:text-[#4b5563]"
              />
              {sending ? (
                <button
                  type="button"
                  onClick={stop}
                  className="flex h-8 items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 text-[10px] font-semibold text-red-200 hover:bg-red-500/20"
                >
                  <Square className="h-3 w-3 fill-current" />
                  Stop
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void send()}
                  disabled={!input.trim()}
                  className="flex h-8 items-center gap-1.5 rounded-lg border border-cyan-500/35 bg-cyan-500/15 px-3 text-[10px] font-semibold text-cyan-200 hover:bg-cyan-500/25 disabled:cursor-not-allowed disabled:opacity-35"
                >
                  <Send className="h-3 w-3" />
                  Send
                </button>
              )}
            </div>
            <div className="mt-1.5 flex items-center gap-2 font-mono text-[8px] text-[#4b5563]">
              <Wand2 className="h-2.5 w-2.5 text-fuchsia-400/70" />
              <span>Enter to send · Shift+Enter newline</span>
              <span className="ml-auto truncate">
                {resolved.baseUrl || 'custom endpoint'} · {resolved.model || '—'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
