import type { Server } from "node:http";
export function liveOptions(args: string[]): {
  platform: string;
  host: string;
  port: number;
  target: string | undefined;
  serverOnly: boolean;
};
export function createLiveServer(
  initialBundle: string,
  control?: { stopToken?: string; onStop?: () => void },
): {
  server: Server;
  publish(nextBundle: string): void;
  close(): Promise<void>;
};
export function createRebuilder(
  build: () => Promise<string>,
  publish: (bundle: string) => void,
  onError: (error: unknown) => void,
  delay?: number,
): { schedule(): void; stop(): Promise<void> };
export function createAlternatingBuilder(
  build: (mode: "live-a" | "live-b") => Promise<string>,
): () => Promise<string>;
