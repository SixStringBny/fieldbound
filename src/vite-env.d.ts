/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Deployment subpath, for example `/` or `/Card-Game-Project/`. */
  readonly VITE_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
