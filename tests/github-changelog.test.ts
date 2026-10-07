import { describe, expect, it } from "vitest";
import {
  appendDailyUpdate,
  bucharestMoment,
  parseStagedChanges,
} from "../scripts/github-changelog.mjs";

const moment = { date: "2026-10-07", time: "20:00" };
const id = "a".repeat(64);

describe("daily GitHub change journal", () => {
  it("uses the Romanian calendar day when UTC is still on the previous day", () => {
    expect(bucharestMoment(new Date("2026-10-06T22:30:00Z"))).toEqual({
      date: "2026-10-07",
      time: "01:30",
    });
    expect(bucharestMoment(new Date("2026-12-06T22:30:00Z"))).toEqual({
      date: "2026-12-07",
      time: "00:30",
    });
  });

  it("records additions, modifications and deletions with exact staged line counts", () => {
    const changes = parseStagedChanges(
      "A\0scripts/new.js\0M\0mobile/app/styles.css\0D\0mobile/old.ts\0M\0CHANGELOG.md\0A\0mobile/app/animals/bunny.png\0",
      "5\t0\tscripts/new.js\0" +
        "3\t2\tmobile/app/styles.css\0" +
        "0\t7\tmobile/old.ts\0" +
        "4\t0\tCHANGELOG.md\0" +
        "-\t-\tmobile/app/animals/bunny.png\0",
    );
    expect(changes).toHaveLength(4);
    const journal = appendDailyUpdate("", changes, moment, id);
    expect(journal).toContain("**Adăugate**");
    expect(journal).toContain("**Modificate**");
    expect(journal).toContain("**Șterse**");
    expect(journal).toContain("styles.css` (+3 / −2 linii)");
    expect(journal).toContain("old.ts` (+0 / −7 linii)");
    expect(journal).toContain("resursă binară");
    expect(journal).not.toContain("`CHANGELOG.md`");
  });

  it("keeps human descriptions and older dates, merges today's pushes and avoids duplicate retries", () => {
    const document =
      "# Jurnal\n\n## 2026-10-07\n\nAm adăugat un selector de limbi.\n\n## 2026-10-06\n\nText vechi.\n";
    const changes = [{ path: "mobile/app/index.html", status: "M" as const, added: 2, removed: 1 }];
    const first = appendDailyUpdate(document, changes, moment, id);
    const second = appendDailyUpdate(first, changes, { ...moment, time: "21:00" }, "b".repeat(64));
    expect(second.match(/^## 2026-10-07$/gm)).toHaveLength(1);
    expect(second).toContain("Am adăugat un selector de limbi.");
    expect(second.indexOf("21:00")).toBeLessThan(second.indexOf("## 2026-10-06"));
    expect(second).toContain("Text vechi.");
    expect(appendDailyUpdate(first, changes, moment, id)).toBe(first);
    const nextDay = appendDailyUpdate(
      second,
      changes,
      { date: "2026-10-08", time: "10:00" },
      "c".repeat(64),
    );
    expect(nextDay.indexOf("## 2026-10-08")).toBeLessThan(nextDay.indexOf("## 2026-10-07"));
  });

  it("does not invent an entry on an unchanged day or copy file contents into descriptions", () => {
    const document = "# Jurnal\n";
    expect(appendDailyUpdate(document, [], moment, id)).toBe(document);
    expect(parseStagedChanges("M\0CHANGELOG.md\0", "1\t0\tCHANGELOG.md\0")).toEqual([]);
    const path = "scripts/<img onerror=alert(1)>.js";
    const journal = appendDailyUpdate(
      "",
      [{ path, status: "A", added: 1, removed: 0 }],
      moment,
      id,
    );
    expect(journal).toContain("&lt;img");
    expect(journal).not.toContain("<img");
    expect(() => parseStagedChanges("A\0missing.js\0", "")).toThrow();
  });
});
