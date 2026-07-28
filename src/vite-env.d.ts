/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GEMINI_API_KEY: string;
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '*.prst?raw' {
  const content: string;
  export default content;
}

interface MIDIOutput {
  id: string;
  name?: string;
  send(data: number[] | Uint8Array, timestamp?: number): void;
  open(): Promise<MIDIOutput>;
  close(): Promise<MIDIOutput>;
  onstatechange: ((this: MIDIOutput, ev: Event) => void) | null;
  connection: 'open' | 'closed' | 'pending';
  state: 'connected' | 'disconnected';
}

interface MIDIInputMap {
  forEach(callback: (value: unknown, key: string) => void): void;
  size: number;
}

interface MIDIOutputMap {
  forEach(callback: (value: MIDIOutput, key: string) => void): void;
  get(key: string): MIDIOutput | undefined;
  entries(): IterableIterator<[string, MIDIOutput]>;
  keys(): IterableIterator<string>;
  values(): IterableIterator<MIDIOutput>;
  size: number;
}

interface MIDIAccess {
  inputs: MIDIInputMap;
  outputs: MIDIOutputMap;
  onstatechange: ((this: MIDIAccess, ev: Event) => void) | null;
  sysexEnabled: boolean;
}

interface Navigator {
  requestMIDIAccess(options?: { sysex?: boolean }): Promise<MIDIAccess>;
}
