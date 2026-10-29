import React, { useEffect, useState } from 'react';
import { Bot, Check, Globe2, Loader2, Sparkles, Wand2 } from 'lucide-react';
import { useEditorStore } from '../editor/store';
import { ENVIRONMENT_PRESETS, environmentPreset } from '../editor/environments';
import { applyAIActions, parseAIResponse } from '../editor/aiActions';
import {
  AIConfig,
  getAIConfig,
  requestAI,
  resolveAI,
  setAIConfig,
  subscribeAIConfig
} from '../editor/ai';
import { ColorField, NumberField, Section, SliderField, Toggle } from './ui';

const PRESET_ACCENTS: Record<string, string> = {
  studio: 'from-[#3a3f47] to-[#1b1e24]',
  garden: 'from-[#4f9448] to-[#20402a]',
  street: 'from-[#6d7c8c] to-[#242b33]',
  void: 'from-[#1a1f2b] to-[#06070a]',
  sunset: 'from-[#e09a5e] to-[#4a2a3c]'
};

export const WorldPanel: React.FC = () => {
  const settings = useEditorStore((state) => state.project.settings);
  const setSettings = useEditorStore((state) => state.setSettings);
  const setEnvironment = useEditorStore((state) => state.setEnvironment);
  const setToast = useEditorStore((state) => state.setToast);

  const [prompt, setPrompt] = useState(
    'A misty forest clearing at dawn with tall pines, ferns and soft golden light'
  );
  const [generating, setGenerating] = useState(false);
  const [aiNote, setAiNote] = useState('');
  const [aiConfig, setAiConfigState] = useState<AIConfig>(() => getAIConfig());
  const ai = resolveAI(aiConfig);

  // Mirror the AI panel: picking a model or pasting a key there updates this
  // card immediately, and editing the key here updates the panel.
  useEffect(() => subscribeAIConfig(setAiConfigState), []);

  const saveKey = (value: string) => {
    setAIConfig({ ...aiConfig, keys: { ...aiConfig.keys, [ai.provider.id]: value } });
  };

  const generate = async () => {
    const text = prompt.trim();
    if (!text || generating) return;
    setGenerating(true);
    setAiNote('');
    try {
      const config = getAIConfig();
      const response = await requestAI(
        config,
        [
          {
            role: 'user',
            content: `Build this surroundings / environment: ${text}`
          }
        ],
        `You are Vexlum's environment designer. Design procedural surroundings for a 3D scene.
Reply with one short sentence, then a final <monolith-actions> JSON array.
Use set_settings with environment (studio, garden, street, void or sunset), background, fogColor,
fogDensity, floorColor, wallColor, exposure and environmentIntensity.
Then add 4-12 add_primitive / add_light actions to build the distinctive props around the origin
(for example trees, buildings, rocks, lamps, hedges). Keep the central area near the origin clear
for the animated subject. Use add_script only when primitive shapes cannot express the idea.
Action format example:
<monolith-actions>
[{"type":"set_settings","environment":"garden","background":"#9ccbe8","floorColor":"#4b7f3a","fogEnabled":true},
 {"type":"add_primitive","primitive":"cylinder","name":"Tree Trunk","position":[6,1,4],"scale":[0.3,2.4,0.3],"color":"#6b4a30"},
 {"type":"add_light","kind":"directional","name":"Dawn Sun","position":[-6,7,-4],"color":"#ffd7a1","intensity":2.2}]
</monolith-actions>`
      );
      const parsed = parseAIResponse(response);
      const logs = applyAIActions(parsed.actions);
      setAiNote(logs.length ? logs.join(' · ') : 'The AI replied but did not include scene actions.');
      if (logs.length) setToast('AI surroundings applied', 'success');
    } catch (error: any) {
      setAiNote(`AI surroundings failed: ${error?.message || error}`);
      setToast('Could not generate surroundings', 'error');
    } finally {
      setGenerating(false);
    }
  };

  const active = environmentPreset(settings.environment);

  return (
    <div className="flex h-full min-h-0">
      <div className="w-[300px] flex-shrink-0 overflow-y-auto border-r border-[#232830]">
        <div className="border-b border-[#1d222a] px-3 py-2.5">
          <div className="flex items-center gap-2">
            <Globe2 className="h-3.5 w-3.5 text-cyan-400" />
            <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#6b7280]">
              Surroundings
            </span>
          </div>
          <p className="mt-1 text-[9.5px] leading-relaxed text-[#5f6a78]">
            {active.description}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 p-3">
          {ENVIRONMENT_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => setEnvironment(preset.id)}
              className={`group relative overflow-hidden rounded-lg border text-left transition-colors ${
                settings.environment === preset.id
                  ? 'border-cyan-400/60 bg-cyan-500/[0.06]'
                  : 'border-[#252b33] bg-[#0f1217] hover:border-[#3a424d]'
              }`}
            >
              <div
                className={`h-14 w-full bg-gradient-to-br ${PRESET_ACCENTS[preset.id] || PRESET_ACCENTS.studio}`}
              >
                <div className="flex h-full w-full items-end justify-between bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.22),transparent_60%)] p-1.5">
                  {settings.environment === preset.id && (
                    <span className="rounded bg-black/45 p-0.5 text-cyan-200">
                      <Check className="h-3 w-3" />
                    </span>
                  )}
                </div>
              </div>
              <div className="px-2 py-1.5">
                <div className="text-[10px] font-semibold text-[#dbe2ea]">{preset.label}</div>
              </div>
            </button>
          ))}
        </div>

        <Section title="Look" icon={<Wand2 className="h-3 w-3" />}>
          <div className="space-y-2">
            <div className="grid grid-cols-[86px_1fr] items-center gap-2">
              <span className="field-label">Sky</span>
              <ColorField value={settings.background} onChange={(background) => setSettings({ background })} />
              <span className="field-label">Ground</span>
              <ColorField value={settings.floorColor} onChange={(floorColor) => setSettings({ floorColor })} />
              <span className="field-label">Accent</span>
              <ColorField value={settings.wallColor} onChange={(wallColor) => setSettings({ wallColor })} />
            </div>
            <div className="grid grid-cols-[86px_1fr] items-center gap-2">
              <span className="field-label">Exposure</span>
              <NumberField
                value={settings.exposure}
                onChange={(exposure) => setSettings({ exposure })}
                min={0.2}
                max={3}
                step={0.05}
              />
            </div>
            <div className="grid grid-cols-[86px_1fr] items-center gap-2">
              <span className="field-label">Env light</span>
              <SliderField
                value={settings.environmentIntensity}
                min={0}
                max={2.5}
                step={0.01}
                onChange={(environmentIntensity) => setSettings({ environmentIntensity })}
                format={(value) => value.toFixed(2)}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="field-label">Fog</span>
              <Toggle checked={settings.fogEnabled} onChange={(fogEnabled) => setSettings({ fogEnabled })} />
            </div>
            {settings.fogEnabled && (
              <div className="grid grid-cols-[86px_1fr] items-center gap-2">
                <span className="field-label">Fog color</span>
                <ColorField value={settings.fogColor} onChange={(fogColor) => setSettings({ fogColor })} />
                <span className="field-label">Density</span>
                <SliderField
                  value={settings.fogDensity}
                  min={0}
                  max={0.12}
                  step={0.001}
                  onChange={(fogDensity) => setSettings({ fogDensity })}
                  format={(value) => value.toFixed(3)}
                />
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="field-label">Grid</span>
              <Toggle
                checked={settings.gridVisible}
                onChange={(gridVisible) => setSettings({ gridVisible })}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="field-label">Schematics</span>
              <Toggle
                checked={settings.schematicsVisible}
                onChange={(schematicsVisible) => setSettings({ schematicsVisible })}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="field-label">Contact shadows</span>
              <Toggle
                checked={settings.contactShadows}
                onChange={(contactShadows) => setSettings({ contactShadows })}
              />
            </div>
          </div>
        </Section>
      </div>

      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto p-4">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md border border-violet-500/30 bg-violet-500/10 text-violet-300">
            <Bot className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-[11.5px] font-semibold text-white">Generate surroundings with AI</h3>
            <p className="text-[9px] text-[#5f6a78]">
              Uses the same model and key as the AI panel.
            </p>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="max-w-full truncate rounded border border-violet-500/25 bg-violet-500/10 px-1.5 py-0.5 font-mono text-[8px] text-violet-200">
            {ai.provider.label} · {ai.model || 'no model'}
          </span>
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              !ai.provider.requiresKey || ai.key ? 'bg-emerald-400' : 'bg-amber-400'
            }`}
            title={!ai.provider.requiresKey || ai.key ? 'Ready to generate' : 'API key missing'}
          />
          <span className="font-mono text-[8px] text-[#4b5563]">shared with the AI panel</span>
        </div>

        {ai.provider.requiresKey && !ai.key && (
          <div className="mt-2 flex gap-1">
            <input
              type="password"
              value={aiConfig.keys[ai.provider.id] ?? ''}
              onChange={(event) => saveKey(event.target.value)}
              placeholder={`Paste your ${ai.provider.label} API key`}
              className="h-[26px] w-full rounded border border-amber-500/30 bg-[#101217] px-2 text-[9.5px] text-[#d1d5db] outline-none placeholder:text-[#4b5563] focus:border-amber-600/70"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        )}

        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          rows={5}
          spellCheck={false}
          className="mt-3 w-full resize-none rounded-lg border border-[#2a3038] bg-[#080a0e] p-3 text-[11px] leading-relaxed text-[#dbe2ea] outline-none focus:border-violet-500/60"
          placeholder="Describe the world: a snowy pine forest, a neon alley, a rooftop at sunset…"
        />

        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => void generate()}
            disabled={generating || !prompt.trim()}
            className="flex h-8 items-center gap-2 rounded-md border border-violet-500/40 bg-violet-500/15 px-3 text-[10.5px] font-semibold text-violet-200 transition-colors hover:bg-violet-500/25 disabled:opacity-50"
          >
            {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {generating ? 'Designing surroundings…' : 'Generate surroundings'}
          </button>
          <span className="font-mono text-[8.5px] text-[#4b5563]">
            adds props + updates sky, ground and fog
          </span>
        </div>

        {aiNote && (
          <div className="mt-3 rounded-lg border border-[#2a3038] bg-[#0d1015] px-3 py-2 text-[10px] leading-relaxed text-[#9aa4b2]">
            {aiNote}
          </div>
        )}

        <div className="mt-5 grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-[#20252d] bg-[#0b0e12] p-3">
            <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#5f6a78]">
              Current preset
            </div>
            <div className="mt-1 text-[12px] font-semibold text-[#dbe2ea]">{active.label}</div>
            <p className="mt-1 text-[9.5px] leading-relaxed text-[#6b7280]">{active.description}</p>
          </div>
          <div className="rounded-lg border border-[#20252d] bg-[#0b0e12] p-3">
            <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#5f6a78]">
              Tips
            </div>
            <ul className="mt-1 space-y-1 text-[9.5px] leading-relaxed text-[#6b7280]">
              <li>· Props are real scene objects you can animate.</li>
              <li>· Keep the subject near the origin clear.</li>
              <li>· AI props can be deleted from the Outliner.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
