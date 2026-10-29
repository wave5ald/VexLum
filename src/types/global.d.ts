export {};

declare global {
  interface Window {
    desktop?: {
      isDesktop: boolean;
      info: () => Promise<{
        version: string;
        electron: string;
        chrome: string;
        platform: string;
        dev: boolean;
      }>;
      saveBinary: (
        data: ArrayBuffer,
        defaultName: string,
        filters?: Array<{ name: string; extensions: string[] }>
      ) => Promise<{ ok: boolean; canceled?: boolean; filePath?: string; size?: number; error?: string }>;
      saveText: (
        text: string,
        defaultName: string,
        filters?: Array<{ name: string; extensions: string[] }>
      ) => Promise<{ ok: boolean; canceled?: boolean; filePath?: string; error?: string }>;
      openText: (
        title?: string,
        filters?: Array<{ name: string; extensions: string[] }>
      ) => Promise<{ ok: boolean; canceled?: boolean; filePath?: string; name?: string; text?: string; error?: string }>;
      openBinary: (
        title?: string,
        filters?: Array<{ name: string; extensions: string[] }>
      ) => Promise<{
        ok: boolean;
        canceled?: boolean;
        filePath?: string;
        name?: string;
        ext?: string;
        data?: ArrayBuffer;
        error?: string;
      }>;
      toggleFullscreen: () => Promise<boolean>;
      isFullscreen: () => Promise<boolean>;
      showItem: (filePath: string) => Promise<{ ok: boolean; error?: string }>;
      pickFolder: (
        title?: string
      ) => Promise<{ ok: boolean; canceled?: boolean; folderPath?: string; error?: string }>;
      readTextAt: (
        filePath: string
      ) => Promise<{ ok: boolean; filePath?: string; name?: string; text?: string; error?: string }>;
      writeTextAt: (
        filePath: string,
        text: string
      ) => Promise<{ ok: boolean; filePath?: string; error?: string }>;
      setDirty: (dirty: boolean) => Promise<{ ok: boolean }>;
      aiRequest: (payload: {
        url: string;
        method?: string;
        headers?: Record<string, string>;
        body?: string;
        timeoutMs?: number;
        requestId?: string;
      }) => Promise<{
        ok: boolean;
        status: number;
        text: string;
        error?: string;
        canceled?: boolean;
        timedOut?: boolean;
      }>;
      aiCancel: (requestId: string) => Promise<boolean>;
      onMenuCommand: (callback: (payload: { command: string; payload?: unknown }) => void) => () => void;
    };
  }
}
