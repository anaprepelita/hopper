export function parseProperties(text: string): Record<string, string>;
export function androidVersion(text: string): { code: number; name: string };
export function androidTargets(mode: string): Array<{
  task: string;
  distribution: string;
  source: string;
  extension: string;
  suffix: string;
}>;
