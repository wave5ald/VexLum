import { EnvironmentPreset, SceneSettings } from './types';

export interface EnvironmentPresetDefinition {
  id: EnvironmentPreset;
  label: string;
  description: string;
  /** Partial scene settings applied when the preset is chosen. */
  settings: Partial<SceneSettings>;
}

export const ENVIRONMENT_PRESETS: EnvironmentPresetDefinition[] = [
  {
    id: 'studio',
    label: 'Concrete Studio',
    description: 'The original architectural set: concrete floor, side fins and soft fog.',
    settings: {
      background: '#111216',
      fogEnabled: true,
      fogColor: '#141519',
      fogDensity: 0.028,
      floorColor: '#2b2d31',
      wallColor: '#33363b',
      exposure: 1.05,
      environmentIntensity: 0.55,
      schematicsVisible: true,
      contactShadows: true
    }
  },
  {
    id: 'garden',
    label: 'Garden',
    description: 'Open lawn, hedges, trees and a stone path under a bright sky.',
    settings: {
      background: '#8fc7e8',
      fogEnabled: true,
      fogColor: '#cfe8f5',
      fogDensity: 0.009,
      floorColor: '#4b7f3a',
      wallColor: '#6b8f5a',
      exposure: 1.02,
      environmentIntensity: 1.05,
      schematicsVisible: false,
      contactShadows: true
    }
  },
  {
    id: 'street',
    label: 'City Street',
    description: 'Asphalt road, sidewalks, buildings and warm street lamps.',
    settings: {
      background: '#849aad',
      fogEnabled: true,
      fogColor: '#a9bccb',
      fogDensity: 0.018,
      floorColor: '#2b2f34',
      wallColor: '#4a4f57',
      exposure: 0.98,
      environmentIntensity: 0.85,
      schematicsVisible: false,
      contactShadows: true
    }
  },
  {
    id: 'void',
    label: 'Void',
    description: 'A minimal dark stage with a faint horizon and no walls.',
    settings: {
      background: '#05060a',
      fogEnabled: true,
      fogColor: '#05060a',
      fogDensity: 0.045,
      floorColor: '#0d0f14',
      wallColor: '#111318',
      exposure: 0.92,
      environmentIntensity: 0.35,
      schematicsVisible: false,
      contactShadows: true
    }
  },
  {
    id: 'sunset',
    label: 'Sunset Desert',
    description: 'Warm dunes, a low orange sun and long cinematic shadows.',
    settings: {
      background: '#3a2438',
      fogEnabled: true,
      fogColor: '#d99a6c',
      fogDensity: 0.014,
      floorColor: '#8a6644',
      wallColor: '#7a5744',
      exposure: 1.12,
      environmentIntensity: 0.95,
      schematicsVisible: false,
      contactShadows: true
    }
  }
];

export function environmentPreset(id: EnvironmentPreset | string): EnvironmentPresetDefinition {
  return ENVIRONMENT_PRESETS.find((preset) => preset.id === id) || ENVIRONMENT_PRESETS[0];
}

export function environmentSettings(id: EnvironmentPreset | string): Partial<SceneSettings> {
  return { environment: environmentPreset(id).id, ...environmentPreset(id).settings };
}
