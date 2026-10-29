import { ProjectState } from './types';
import { ARCHITECTURE, projectSnapshot, sourceContext } from './aiContext';

export type AIProviderId =
  | 'pollinations'
  | 'openrouter'
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'groq'
  | 'mistral'
  | 'deepseek'
  | 'opencode'
  | 'ollama'
  | 'custom';

export type AIProviderKind = 'openai' | 'anthropic' | 'gemini' | 'ollama';

export interface AIModelOption {
  id: string;
  label: string;
  note?: string;
}

export interface AIProvider {
  id: AIProviderId;
  label: string;
  kind: AIProviderKind;
  baseUrl: string;
  defaultModel: string;
  requiresKey: boolean;
  hint: string;
  models: AIModelOption[];
}

export interface AIConfig {
  provider: AIProviderId;
  models: Partial<Record<AIProviderId, string>>;
  keys: Partial<Record<AIProviderId, string>>;
  baseUrls: Partial<Record<AIProviderId, string>>;
  /** Model IDs pulled from the provider's /models endpoint with the Sync button. */
  discovered?: Partial<Record<AIProviderId, string[]>>;
}

export interface AIChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export const AI_PROVIDERS: AIProvider[] = [
  {
    id: 'pollinations',
    label: 'Pollinations (free, no key)',
    kind: 'openai',
    baseUrl: 'https://text.pollinations.ai/openai',
    defaultModel: 'openai-fast',
    requiresKey: false,
    hint: 'Free anonymous GPT-OSS reasoning model. Works immediately with no account.',
    models: [
      { id: 'openai-fast', label: 'openai-fast', note: 'GPT-OSS 20B · free' },
      { id: 'openai', label: 'openai', note: 'alias · free' },
      { id: 'gpt-oss-20b', label: 'gpt-oss-20b', note: 'base model · free' }
    ]
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    kind: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-3.8-flash',
    requiresKey: true,
    hint: 'Free tier at aistudio.google.com. Press Sync models to list every model your key can use.',
    models: [
      { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash', note: 'recommended' },
      { id: 'gemini-4-argon', label: 'Gemini 4 Argon', note: 'flagship reasoning' },
      { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash' },
      { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite', note: 'cheap' },
      { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite' },
      { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro', note: 'preview' },
      { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash', note: 'preview' },
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', note: 'legacy' },
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', note: 'legacy' },
      { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite', note: 'legacy' }
    ]
  },
  {
    id: 'deepseek',
    label: 'DeepSeek API',
    kind: 'openai',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-flash',
    requiresKey: true,
    hint: 'Key from platform.deepseek.com. deepseek-chat / deepseek-reasoner are retired aliases — use the V4 IDs.',
    models: [
      { id: 'deepseek-flash', label: 'DeepSeek V4.1 Flash', note: '1M ctx · recommended' },
      { id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro', note: '1M ctx · deep reasoning' },
      { id: 'deepseek-chat', label: 'deepseek-chat', note: 'legacy alias (retired Jul 2026)' },
      { id: 'deepseek-reasoner', label: 'deepseek-reasoner', note: 'legacy alias (retired Jul 2026)' }
    ]
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    kind: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'deepseek/deepseek-r1:free',
    requiresKey: true,
    hint: 'One key for many providers. Free models end in :free. Press Sync models to list everything.',
    models: [
      { id: 'deepseek/deepseek-r1:free', label: 'DeepSeek R1', note: 'free' },
      { id: 'deepseek/deepseek-chat-v3-0324:free', label: 'DeepSeek V3', note: 'free' },
      { id: 'qwen/qwen3-coder:free', label: 'Qwen3 Coder', note: 'free' },
      { id: 'meta-llama/llama-3.3-70b-instruct:free', label: 'Llama 3.3 70B', note: 'free' },
      { id: 'google/gemma-3-27b-it:free', label: 'Gemma 3 27B', note: 'free' },
      { id: 'mistralai/mistral-small-3.2-24b-instruct:free', label: 'Mistral Small 3.2', note: 'free' },
      { id: 'z-ai/glm-4.5-air:free', label: 'GLM 4.5 Air', note: 'free' },
      { id: 'openai/gpt-4o-mini', label: 'GPT-4o mini', note: 'paid' },
      { id: 'anthropic/claude-sonnet-4', label: 'Claude Sonnet 4', note: 'paid' }
    ]
  },
  {
    id: 'openai',
    label: 'OpenAI',
    kind: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-5.4-mini',
    requiresKey: true,
    hint: 'Platform API key from platform.openai.com. Press Sync models to load the exact IDs enabled for your account.',
    models: [
      { id: 'gpt-6.1-sol', label: 'GPT-6.1 Sol', note: 'flagship' },
      { id: 'gpt-6-astra', label: 'GPT-6 Astra', note: 'most capable' },
      { id: 'gpt-6.1-terra', label: 'GPT-6.1 Terra' },
      { id: 'gpt-6-luna', label: 'GPT-6 Luna', note: 'efficient' },
      { id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol' },
      { id: 'gpt-5.5', label: 'GPT-5.5' },
      { id: 'gpt-5.4-mini', label: 'GPT-5.4 mini', note: 'cheap + strong' },
      { id: 'gpt-5.2', label: 'GPT-5.2' },
      { id: 'gpt-5.2-pro', label: 'GPT-5.2 Pro' },
      { id: 'gpt-oss-120b', label: 'gpt-oss-120b', note: 'open weight' },
      { id: 'gpt-oss-20b', label: 'gpt-oss-20b', note: 'open weight' }
    ]
  },
  {
    id: 'anthropic',
    label: 'Anthropic Claude',
    kind: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-sonnet-5-5',
    requiresKey: true,
    hint: 'API key from console.anthropic.com. Press Sync models to list the IDs your key can use.',
    models: [
      { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', note: 'balanced' },
      { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', note: 'agentic coding' },
      { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', note: 'fastest' },
      { id: 'claude-fable-5-1', label: 'Claude Fable 5.1', note: 'deep reasoning' },
      { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5', note: 'legacy' }
    ]
  },
  {
    id: 'groq',
    label: 'Groq',
    kind: 'openai',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    requiresKey: true,
    hint: 'Very fast inference, free tier at console.groq.com. Press Sync models for the live list.',
    models: [
      { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B' },
      { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B' },
      { id: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B' },
      { id: 'qwen/qwen3-32b', label: 'Qwen3 32B' },
      { id: 'moonshotai/kimi-k2-instruct', label: 'Kimi K2' }
    ]
  },
  {
    id: 'mistral',
    label: 'Mistral AI',
    kind: 'openai',
    baseUrl: 'https://api.mistral.ai/v1',
    defaultModel: 'mistral-large-latest',
    requiresKey: true,
    hint: 'API key from console.mistral.ai. Press Sync models for the live list.',
    models: [
      { id: 'mistral-large-latest', label: 'Mistral Large' },
      { id: 'mistral-small-latest', label: 'Mistral Small' },
      { id: 'codestral-latest', label: 'Codestral' }
    ]
  },
  {
    id: 'opencode',
    label: 'OpenCode Zen',
    kind: 'openai',
    baseUrl: 'https://opencode.ai/zen/v1',
    defaultModel: 'deepseek-v4-flash',
    requiresKey: true,
    hint: 'OpenCode Zen key. Free models change frequently; type any current model ID.',
    models: [
      { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash' },
      { id: 'deepseek-v4-flash-free', label: 'DeepSeek V4 Flash Free', note: 'may be retired' },
      { id: 'grok-code', label: 'Grok Code' },
      { id: 'kimi-k2.5', label: 'Kimi K2.5' },
      { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' }
    ]
  },
  {
    id: 'ollama',
    label: 'Ollama (local)',
    kind: 'ollama',
    baseUrl: 'http://127.0.0.1:11434',
    defaultModel: 'llama3.2',
    requiresKey: false,
    hint: 'Runs fully offline. Start Ollama and pull a model first.',
    models: [
      { id: 'llama3.2', label: 'Llama 3.2' },
      { id: 'qwen2.5-coder', label: 'Qwen 2.5 Coder' },
      { id: 'deepseek-r1', label: 'DeepSeek R1' },
      { id: 'mistral', label: 'Mistral' }
    ]
  },
  {
    id: 'custom',
    label: 'Custom OpenAI-compatible',
    kind: 'openai',
    baseUrl: '',
    defaultModel: '',
    requiresKey: false,
    hint: 'Any /chat/completions endpoint: LM Studio, vLLM, a proxy, etc.',
    models: []
  }
];

const STORAGE_KEY = 'monolith.ai.config.v1';

export function defaultAIConfig(): AIConfig {
  const provider = AI_PROVIDERS[0];
  return {
    provider: provider.id,
    models: { [provider.id]: provider.defaultModel },
    keys: {},
    baseUrls: {}
  };
}

export function loadAIConfig(): AIConfig {
  const defaults = defaultAIConfig();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return defaults;
    const provider = AI_PROVIDERS.some((item) => item.id === parsed.provider)
      ? (parsed.provider as AIProviderId)
      : defaults.provider;
    const cleanList = (record: any): Partial<Record<AIProviderId, string[]>> => {
      const out: Partial<Record<AIProviderId, string[]>> = {};
      if (!record || typeof record !== 'object') return out;
      for (const provider of AI_PROVIDERS) {
        const list = record[provider.id];
        if (Array.isArray(list)) {
          out[provider.id] = list.filter((item: unknown) => typeof item === 'string').slice(0, 300);
        }
      }
      return out;
    };
    return {
      provider,
      models: { ...defaults.models, ...(parsed.models || {}) },
      keys: { ...(parsed.keys || {}) },
      baseUrls: { ...(parsed.baseUrls || {}) },
      discovered: cleanList(parsed.discovered)
    };
  } catch {
    return defaults;
  }
}

export function saveAIConfig(config: AIConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // Storage may be disabled; the chat still works for this session.
  }
}

/**
 * One shared AI configuration for the whole app. The chat and the surroundings
 * generator both read and write this store, so a model or key picked in one
 * place is immediately used by the other.
 */
let sharedConfig: AIConfig | null = null;
const configListeners = new Set<(config: AIConfig) => void>();

export function getAIConfig(): AIConfig {
  if (!sharedConfig) sharedConfig = loadAIConfig();
  return sharedConfig;
}

export function setAIConfig(config: AIConfig): void {
  sharedConfig = config;
  saveAIConfig(config);
  for (const listener of [...configListeners]) {
    try {
      listener(config);
    } catch {
      // A broken listener must never block other panels from updating.
    }
  }
}

export function subscribeAIConfig(listener: (config: AIConfig) => void): () => void {
  configListeners.add(listener);
  return () => {
    configListeners.delete(listener);
  };
}

export function getAIProvider(id: AIProviderId): AIProvider {
  return AI_PROVIDERS.find((provider) => provider.id === id) || AI_PROVIDERS[0];
}

export function resolveAI(config: AIConfig): {
  provider: AIProvider;
  model: string;
  baseUrl: string;
  key: string;
} {
  const provider = getAIProvider(config.provider);
  return {
    provider,
    model: (config.models[provider.id] || provider.defaultModel || '').trim(),
    baseUrl: (config.baseUrls[provider.id] || provider.baseUrl || '').trim().replace(/\/+$/, ''),
    key: (config.keys[provider.id] || '').trim()
  };
}

/** Presets + anything the provider reported through Sync, de-duplicated. */
export function providerModels(config: AIConfig, providerId: AIProviderId): AIModelOption[] {
  const provider = getAIProvider(providerId);
  const options: AIModelOption[] = [...provider.models];
  const seen = new Set(options.map((option) => option.id));
  for (const id of config.discovered?.[providerId] || []) {
    if (seen.has(id)) continue;
    seen.add(id);
    options.push({ id, label: id });
  }
  const current = (config.models[providerId] || '').trim();
  if (current && !seen.has(current)) options.unshift({ id: current, label: current, note: 'custom' });
  return options;
}

/** Chat requests can legitimately take minutes on reasoning models. */
export const AI_TIMEOUT_MS = 300_000;

export type AIErrorCode = 'canceled' | 'timeout' | 'network' | 'http';

export class AIRequestError extends Error {
  code: AIErrorCode;
  status: number;

  constructor(message: string, code: AIErrorCode, status = 0) {
    super(message);
    this.name = 'AIRequestError';
    this.code = code;
    this.status = status;
  }
}

function chatEndpoint(baseUrl: string): string {
  if (!baseUrl) return '';
  return /\/chat\/completions$/i.test(baseUrl) ? baseUrl : `${baseUrl}/chat/completions`;
}

interface HttpRequest {
  url: string;
  method?: string;
  headers: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
}

let requestSeq = 0;

async function httpJson(
  request: HttpRequest,
  signal?: AbortSignal
): Promise<{ ok: boolean; status: number; text: string }> {
  const method = (request.method || 'POST').toUpperCase();
  const bodyText = request.body === undefined ? undefined : JSON.stringify(request.body);
  const timeoutMs = request.timeoutMs ?? AI_TIMEOUT_MS;

  if (window.desktop?.aiRequest) {
    const requestId = `ai-${Date.now().toString(36)}-${(requestSeq += 1)}`;
    const cancel = () => window.desktop?.aiCancel?.(requestId);
    if (signal?.aborted) throw new AIRequestError('Request stopped.', 'canceled');
    signal?.addEventListener('abort', cancel);
    try {
      const result = await window.desktop.aiRequest({
        url: request.url,
        method,
        headers: request.headers,
        body: bodyText,
        timeoutMs,
        requestId
      });
      if (result.error) {
        if (result.canceled || signal?.aborted) {
          throw new AIRequestError('Request stopped.', 'canceled');
        }
        if (result.timedOut) {
          throw new AIRequestError(
            `No answer after ${Math.round(timeoutMs / 1000)}s. The provider or network stalled — stop the request or try a faster model.`,
            'timeout'
          );
        }
        throw new AIRequestError(result.error, 'network');
      }
      return { ok: Boolean(result.ok), status: Number(result.status) || 0, text: result.text || '' };
    } finally {
      signal?.removeEventListener('abort', cancel);
    }
  }

  const controller = new AbortController();
  let timedOut = false;
  const timer = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort);
  try {
    const response = await fetch(request.url, {
      method,
      headers: request.headers,
      body: bodyText,
      signal: controller.signal
    });
    return { ok: response.ok, status: response.status, text: await response.text() };
  } catch (error: any) {
    if (timedOut) {
      throw new AIRequestError(
        `No answer after ${Math.round(timeoutMs / 1000)}s. The provider or network stalled — try a faster model.`,
        'timeout'
      );
    }
    if (signal?.aborted) throw new AIRequestError('Request stopped.', 'canceled');
    throw new AIRequestError(error?.message || 'Network request failed.', 'network');
  } finally {
    window.clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

/** Asks the provider which models the current key can actually use. */
export async function discoverModels(config: AIConfig): Promise<string[]> {
  const { provider, baseUrl, key } = resolveAI(config);
  if (!baseUrl) throw new Error('Set a base URL first.');
  if (provider.requiresKey && !key) throw new Error(`Add a ${provider.label} API key first.`);

  const headers: Record<string, string> = {};
  let url = '';
  if (provider.kind === 'gemini') {
    url = `${baseUrl}/models?pageSize=200&key=${encodeURIComponent(key)}`;
  } else if (provider.kind === 'anthropic') {
    url = `${baseUrl}/models?limit=200`;
    headers['x-api-key'] = key;
    headers['anthropic-version'] = '2023-06-01';
  } else if (provider.kind === 'ollama') {
    url = `${baseUrl}/api/tags`;
  } else {
    url = `${baseUrl}/models`;
    if (key) headers.Authorization = `Bearer ${key}`;
    if (provider.id === 'openrouter') {
      headers['HTTP-Referer'] = 'https://monolith.studio';
      headers['X-Title'] = 'Vexlum';
    }
  }

  const response = await httpJson({ url, method: 'GET', headers, timeoutMs: 30_000 });
  if (!response.ok) {
    const parsed = errorFrom(response.status, response.text);
    throw parsed;
  }
  let data: any;
  try {
    data = JSON.parse(response.text);
  } catch {
    throw new Error('The provider returned a non-JSON model list.');
  }

  let ids: string[] = [];
  if (provider.kind === 'gemini') {
    const list = Array.isArray(data?.models) ? data.models : [];
    ids = list
      .filter((model: any) => {
        const methods = model?.supportedGenerationMethods;
        return !Array.isArray(methods) || methods.includes('generateContent');
      })
      .map((model: any) => String(model?.name || '').replace(/^models\//, ''))
      .filter(Boolean);
  } else if (provider.kind === 'ollama') {
    ids = (Array.isArray(data?.models) ? data.models : []).map((model: any) => String(model?.name || '')).filter(Boolean);
  } else {
    ids = (Array.isArray(data?.data) ? data.data : []).map((model: any) => String(model?.id || '')).filter(Boolean);
  }

  const unique = [...new Set(ids)];
  if (!unique.length) throw new Error('The provider returned no models for this key.');
  return unique.sort((a, b) => a.localeCompare(b));
}

function extractText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value
      .map((part: any) => (typeof part === 'string' ? part : part?.text || part?.content || ''))
      .join('');
  }
  return '';
}

function errorFrom(status: number, text: string): Error {
  let message = text;
  try {
    const parsed = JSON.parse(text);
    message =
      parsed?.error?.message ||
      parsed?.error ||
      parsed?.message ||
      parsed?.detail ||
      text;
    if (typeof message !== 'string') message = JSON.stringify(message);
  } catch {
    // plain text or HTML error
  }
  const clean = String(message).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return new Error(`AI ${status || 'request'} failed: ${clean.slice(0, 400)}`);
}

export async function requestAI(
  config: AIConfig,
  messages: AIChatTurn[],
  system: string,
  signal?: AbortSignal
): Promise<string> {
  const { provider, model, baseUrl, key } = resolveAI(config);
  if (!model) throw new Error('Choose a model in AI settings.');
  if (!baseUrl) throw new Error('Set a base URL for the custom provider.');
  if (provider.requiresKey && !key) throw new Error(`Add an API key for ${provider.label}.`);

  let url = '';
  let headers: Record<string, string> = { 'Content-Type': 'application/json' };
  let body: unknown;

  if (provider.kind === 'anthropic') {
    url = `${baseUrl}/messages`;
    headers = {
      ...headers,
      'x-api-key': key,
      'anthropic-version': '2023-06-01'
    };
    body = {
      model,
      max_tokens: 3000,
      system,
      messages: messages.map((message) => ({ role: message.role, content: message.content }))
    };
  } else if (provider.kind === 'gemini') {
    url = `${baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
    body = {
      systemInstruction: { parts: [{ text: system }] },
      contents: messages.map((message) => ({
        role: message.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: message.content }]
      })),
      generationConfig: { temperature: 0.65, maxOutputTokens: 3000 }
    };
  } else if (provider.kind === 'ollama') {
    url = `${baseUrl}/api/chat`;
    body = {
      model,
      stream: false,
      messages: [{ role: 'system', content: system }, ...messages]
    };
  } else {
    url = chatEndpoint(baseUrl);
    if (key) headers.Authorization = `Bearer ${key}`;
    if (provider.id === 'openrouter') {
      headers['HTTP-Referer'] = 'https://monolith.studio';
      headers['X-Title'] = 'Vexlum';
    }
    body = {
      model,
      messages: [{ role: 'system', content: system }, ...messages],
      temperature: 0.65,
      max_tokens: 3000
    };
  }

  const response = await httpJson({ url, headers, body, timeoutMs: AI_TIMEOUT_MS }, signal);
  if (!response.ok) {
    const httpError = errorFrom(response.status, response.text);
    if (provider.id === 'pollinations' && response.status >= 400) {
      httpError.message += `
The anonymous Pollinations tier is rate-limited or blocked right now. Add a Google Gemini or DeepSeek API key in AI settings for a reliable model.`;
    }
    throw httpError;
  }

  let data: any;
  try {
    data = JSON.parse(response.text);
  } catch {
    // Some free endpoints answer with plain text.
    if (response.text.trim()) return response.text.trim();
    throw new Error('The AI returned an empty response.');
  }

  if (provider.kind === 'anthropic') {
    const text = extractText(data?.content);
    if (text) return text;
  } else if (provider.kind === 'gemini') {
    const text = extractText(data?.candidates?.[0]?.content?.parts);
    if (text) return text;
  } else if (provider.kind === 'ollama') {
    if (typeof data?.message?.content === 'string') return data.message.content;
  } else {
    const content = data?.choices?.[0]?.message?.content;
    const text = extractText(content);
    if (text) return text;
  }

  const message =
    data?.error?.message ||
    data?.error ||
    data?.message ||
    'The model returned no text.';
  throw new Error(String(message));
}

export function buildSystemPrompt(
  project: ProjectState,
  selectedId: string | null,
  time: number,
  userText: string
): string {
  const current = projectSnapshot(project, selectedId, time);
  const selected = project.objects.find((object) => object.id === selectedId);
  const selectedScript = selected?.kind === 'script' ? selected.script?.source?.slice(0, 1800) : null;
  const context = sourceContext(userText, 30000);
  return `${ARCHITECTURE}

CURRENT SCENE
${current}
${selectedScript ? `\nSELECTED SCRIPT SOURCE\n${selectedScript}\n` : ''}
ACTION PROTOCOL
You are the scene copilot. When the user asks you to change the scene, include a block at the very end:
<monolith-actions>
[ {"type":"add_primitive","primitive":"sphere","name":"Chrome Orb","position":[0,2,0],"color":"#cbd5e1"} ]
</monolith-actions>
Use exactly these action types. Refer to objects by exact name or id; "selected" means the current selection.
- add_null {name?,position?,parent?}
- add_primitive {primitive, name?, position?, scale?, color?}  // box,sphere,cylinder,cone,torus,torusKnot,plane,icosahedron,gear,suzanne,monolith
- add_script {name?, code, position?, scale?}  // code runs with (THREE, material, helpers), must return an Object3D
- add_light {kind, name?, position?, color?, intensity?} // ambient,hemisphere,directional,point,spot,rect
- add_effect {object, effect, material?, start?, amount?, speed?, axis?, color?}
- trigger_physics {object, material?, start?}
- set_transform {object, position?, rotation?, scale?}
- set_parent {object, parent?} // parent null name or null
- set_material {object, color?, roughness?, metalness?, emissive?, emissiveIntensity?, opacity?}
- set_camera {target?, fov?, aimMode?}
- add_key {object, property, time?, value?, interp?}
- key_transform {object}
- add_camera_move {kind} // dolly,orbit,crane,reveal,orbit180
- select {object}
- remove {object}
- rename {object, name}
- seek {time}
- set_timeline {duration?, fps?, loop?}
- set_settings {environment?, background?, exposure?, floorColor?, wallColor?, fogEnabled?, fogColor?, fogDensity?, gridVisible?, schematicsVisible?} // environment: studio, garden, street, void, sunset
- set_project_name {name}
- clear_effects {object}
- play {playing}
Rules:
1. Do not invent action types. Keep actions small and safe.
2. Use add_script when the user asks for custom/arbitrary 3D geometry or a Blender-like procedural model. Write complete, valid Three.js code. Do not use imports, fetch, or DOM. Return one Object3D. Use the provided \`material\` only as a fallback; create MeshStandardMaterial for multi-colour models and set castShadow/receiveShadow.
3. For effects, add physics when asked to drop/break/fall. Choose glass, paper, sponge or slime based on the described material. The effect starts at start (seconds); omit start to use the playhead.
4. Keep spoken explanations concise. The action block is executed automatically and should not be repeated inside prose.
5. If the user asks for a core app feature that cannot be achieved by scene actions, explain what can be done with script objects/effects and provide the closest action. You cannot rewrite or rebuild the installed EXE from chat.
6. Nulls are transform controls. To move several objects together, create a null and set_parent on the objects.
7. Never expose or repeat API keys.
8. Keep prose under about 120 words. Long answers time out on slow providers — put the work in the action block, not in paragraphs.
9. The block must be valid JSON and must close with </monolith-actions> in the same reply.

SOURCE CODE CONTEXT (real files from this build)
${context}`;
}
