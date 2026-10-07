export const journalPath: string;
export type StagedChange = {
  path: string;
  status: "A" | "M" | "D";
  added: number | null;
  removed: number | null;
};
export type JournalMoment = { date: string; time: string };
export function bucharestMoment(now?: Date): JournalMoment;
export function parseStagedChanges(statusOutput: string, numstatOutput: string): StagedChange[];
export function appendDailyUpdate(
  document: string,
  changes: StagedChange[],
  moment: JournalMoment,
  id: string,
): string;
