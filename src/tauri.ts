// Thin wrapper — uses real Tauri APIs in the desktop app, mocks in browser/preview
import { mockInvoke, mockListen } from "./tauriMock";

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (isTauri) {
    const { invoke: tauriInvoke } = await import("@tauri-apps/api/core");
    return tauriInvoke<T>(cmd, args);
  }
  return mockInvoke(cmd, args) as Promise<T>;
}

export async function openFileDialog(
  filters: { name: string; extensions: string[] }[],
  multiple = false
): Promise<string | string[] | null> {
  if (isTauri) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const result = await open({ multiple, filters });
    if (typeof result === "string" || Array.isArray(result)) return result;
    return null;
  }
  return null;
}

export async function saveFileDialog(opts: {
  defaultPath?: string;
  filters?: { name: string; extensions: string[] }[];
}): Promise<string | null> {
  if (isTauri) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const result = await save(opts);
    return typeof result === "string" ? result : null;
  }
  return null;
}

export async function listen<T>(
  event: string,
  cb: (e: { payload: T }) => void
): Promise<() => void> {
  if (isTauri) {
    const { listen: tauriListen } = await import("@tauri-apps/api/event");
    return tauriListen<T>(event, cb);
  }
  return mockListen(event, cb as (e: { payload: unknown }) => void);
}
