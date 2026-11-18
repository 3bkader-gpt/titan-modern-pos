/// <reference types="vite/client" />
import type { electronAPI } from '../../preload/index';

declare global {
  interface Window {
    electronAPI: typeof electronAPI;
  }
}
