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
    // Whisper-medium fine-tuned for Bangla (Bengali.AI competition winner). Apache-2.0.
    id: 'kotha/tugstugi-medium-onnx',
    labelKey: 'model.accurate',
    descKey: 'model.accurateDesc',
    sizeMB: { webgpu: 1500, wasm: 900 },
    dtype: WHISPER_DTYPE,
    timestamps: false,
    bangla: true,
  },
  {
    // Whisper-small fine-tuned for Bangla (bangla-speech-processing/BanglaASR). MIT.
    id: 'kotha/banglaasr-small-onnx',
    labelKey: 'model.compact',
    descKey: 'model.compactDesc',
    sizeMB: { webgpu: 630, wasm: 410 },
    dtype: WHISPER_DTYPE,
    timestamps: false,
    bangla: true,
  },
];

/**
 * Where the converted model folders live: an http(s) URL ending in "/" (for example a static
 * file server or a bucket). Can be overridden per visit with ?localModels=<url>.
 */
export const MODEL_HOST = (import.meta.env?.VITE_MODEL_HOST as string | undefined)?.trim() || undefined;

export const MODELS: ModelOption[] = BUILTIN_MODELS;

export const DEFAULT_MODEL_ID = BUILTIN_MODELS[0].id;

/** Phones get the small model. */
export const PHONE_DEFAULT_MODEL_ID = BUILTIN_MODELS[1].id;

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
