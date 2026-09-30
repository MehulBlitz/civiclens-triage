/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the live CivicLens ML model service (no trailing slash). */
  readonly VITE_ML_SERVICE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
