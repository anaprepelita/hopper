export const targetRemote: string;
export const targetUrl: string;
export const quietPeriodMs: number;
export function assertPublishablePath(path: string): void;
export function assertSafeContent(path: string, buffer: Buffer): void;
export function fingerprint(records: { path: string; hash: string | null }[]): string;
export function debounce(
  previous: { fingerprint: string; changedAt: number } | null,
  nextFingerprint: string,
  now: number,
): { fingerprint: string; changedAt: number; ready: boolean };
