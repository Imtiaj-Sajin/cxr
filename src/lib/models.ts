/** Speech models the app can run in the browser. */

export type DtypeSpec = string | Record<string, string>;

export interface ModelOption {
  /** Hugging Face model id (must contain ONNX weights in an `onnx/` folder). */
  id: string;
  /** i18n key for the display name. */
  labelKey: string;
  /** i18n key for the short description. */
  descKey: string;
  /** Approximate one-time download size in MB, per backend. */
  sizeMB: { webgpu: number; wasm: number };
  dtype: { webgpu: DtypeSpec; wasm: DtypeSpec };
  /** Whether the model reliably predicts timestamps. Fine-tuned models often lose this. */
  timestamps: boolean;
  /** Fine-tuned specifically for Bangla. */
  bangla: boolean;
}

const WHISPER_DTYPE = {
  webgpu: { encoder_model: 'fp32', decoder_model_merged: 'q4' },
  wasm: { encoder_model: 'q8', decoder_model_merged: 'q8' },
};

export const BUILTIN_MODELS: ModelOption[] = [
  {
    id: 'onnx-community/whisper-base',
    labelKey: 'model.fast',
    descKey: 'model.fastDesc',
    sizeMB: { webgpu: 130, wasm: 80 },
    dtype: WHISPER_DTYPE,
    timestamps: true,
    bangla: false,
  },
  {
    id: 'onnx-community/whisper-small',
    labelKey: 'model.balanced',
    descKey: 'model.balancedDesc',
    sizeMB: { webgpu: 420, wasm: 250 },
    dtype: WHISPER_DTYPE,
    timestamps: true,
    bangla: false,
  },
];

/**
 * A Bangla fine-tuned model converted with `tools/convert_model.py`. Set
 * `VITE_BANGLA_MODEL_ID` at build time (for example `your-name/whisper-small-bn-onnx`)
 * and it becomes the default choice.
 */
const banglaId = (import.meta.env?.VITE_BANGLA_MODEL_ID as string | undefined)?.trim();

export const BANGLA_MODEL: ModelOption | null = banglaId
  ? {
      id: banglaId,
      labelKey: 'model.bangla',
      descKey: 'model.banglaDesc',
      sizeMB: { webgpu: 420, wasm: 250 },
      dtype: WHISPER_DTYPE,
      timestamps: false,
      bangla: true,
    }
  : null;

export const MODELS: ModelOption[] = BANGLA_MODEL ? [BANGLA_MODEL, ...BUILTIN_MODELS] : BUILTIN_MODELS;

export const DEFAULT_MODEL_ID = BANGLA_MODEL?.id ?? 'onnx-community/whisper-small';

/** Build an option for a model id typed in by the user. */
export function customModel(id: string, timestamps = false): ModelOption {
  return {
    id,
    labelKey: 'model.custom',
    descKey: 'model.customDesc',
    sizeMB: { webgpu: 0, wasm: 0 },
    dtype: WHISPER_DTYPE,
    timestamps,
    bangla: false,
  };
}

export function findModel(id: string): ModelOption {
  return MODELS.find((m) => m.id === id) ?? customModel(id);
}
