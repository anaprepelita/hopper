export function assertPackagedBuild(root: string): Promise<void>;
export function beginLiveSession(
  root: string,
  platform: "android" | "ios",
  previewOnly?: boolean,
  control?: { host: string; port: number; token: string },
): Promise<void>;
export function restoreLiveSession(root: string, owner?: number): Promise<void>;
export function allowIOSLiveNetworking(root: string): Promise<void>;
export function requestLiveStop(root: string): Promise<void>;
