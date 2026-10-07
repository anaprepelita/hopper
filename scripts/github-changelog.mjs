export const journalPath = "CHANGELOG.md";

export function bucharestMoment(now = new Date()) {
  return {
    date: new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Europe/Bucharest",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now),
    time: new Intl.DateTimeFormat("ro-RO", {
      timeZone: "Europe/Bucharest",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(now),
  };
}

// --no-renames makes both Git -z formats unambiguous, including unusual file names.
export function parseStagedChanges(statusOutput, numstatOutput) {
  const statistics = new Map();
  for (const record of numstatOutput.split("\0").filter(Boolean)) {
    const first = record.indexOf("\t");
    const second = record.indexOf("\t", first + 1);
    if (first < 0 || second < 0) throw new Error("Invalid staged change statistics.");
    const added = record.slice(0, first);
    const removed = record.slice(first + 1, second);
    statistics.set(record.slice(second + 1), {
      added: added === "-" ? null : Number(added),
      removed: removed === "-" ? null : Number(removed),
    });
  }
  const fields = statusOutput.split("\0").filter(Boolean);
  if (fields.length % 2 !== 0) throw new Error("Invalid staged change list.");
  const changes = [];
  for (let index = 0; index < fields.length; index += 2) {
    const status = fields[index];
    const path = fields[index + 1];
    if (path === journalPath) continue;
    if (!["A", "M", "D", "T"].includes(status)) throw new Error("Unsupported staged status.");
    const counts = statistics.get(path);
    if (!counts) throw new Error("Missing staged change statistics.");
    changes.push({ path, status: status === "T" ? "M" : status, ...counts });
  }
  return changes;
}

function area(path) {
  if (path === "mobile/app/index.html") return "Ecranele și formularele aplicației";
  if (/\.css$/.test(path)) return "Design și stiluri";
  if (path === "mobile/app/script.js") return "Comportamentul interfeței și logica bugetului";
  if (/^mobile\/app\/(?:translations|i18n)\.js$/.test(path)) return "Texte și limbi";
  if (/^mobile\/app\/(?:motion|sound)\.js$/.test(path)) return "Animații sau sunete";
  if (/^mobile\/app\/animals\//.test(path)) return "Ilustrații";
  if (/^tests\//.test(path)) return "Teste";
  if (/^scripts\/github-/.test(path)) return "Automatizarea GitHub și jurnalul zilnic";
  if (/^(?:README|AGENTS|roadmap)\.md$/.test(path)) return "Documentație";
  if (/^(?:package(?:-lock)?\.json|bun\.lock)$/.test(path))
    return "Configurarea proiectului și dependențe";
  if (/^android\//.test(path)) return "Proiect Android";
  if (/^ios\//.test(path)) return "Proiect iOS";
  if (/^supabase\//.test(path)) return "Backend și rapoarte";
  if (/^mobile\//.test(path)) return "Aplicația mobilă";
  return "Configurarea proiectului";
}

function displayPath(path) {
  // Escape filenames without copying code, user records or file contents into the journal.
  const escaped = path
    .replace(/[\r\n\t]/g, " ")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("`", "&#96;");
  return "`" + escaped + "`";
}

export function appendDailyUpdate(document, changes, moment, id) {
  if (!changes.length) return document;
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(moment.date) ||
    !/^\d{2}:\d{2}$/.test(moment.time) ||
    !/^[a-f0-9]{64}$/.test(id)
  ) {
    throw new Error("Invalid journal update metadata.");
  }
  const marker = "<!-- hopper-update:" + id + " -->";
  if (document.includes(marker)) return document;
  const sections = [];
  for (const [status, title] of [
    ["A", "Adăugate"],
    ["M", "Modificate"],
    ["D", "Șterse"],
  ]) {
    const rows = changes
      .filter((change) => change.status === status)
      .sort((a, b) => a.path.localeCompare(b.path));
    if (!rows.length) continue;
    sections.push(
      "**" +
        title +
        "**\n\n" +
        rows
          .map((change) => {
            const counts =
              change.added === null || change.removed === null
                ? "resursă binară"
                : "+" + change.added + " / −" + change.removed + " linii";
            return (
              "- " + area(change.path) + ": " + displayPath(change.path) + " (" + counts + ")."
            );
          })
          .join("\n"),
    );
  }
  if (!sections.length) return document;
  const entry =
    "### " + moment.time + " — Modificări trimise\n\n" + marker + "\n\n" + sections.join("\n\n");
  const source = document.replaceAll("\r\n", "\n");
  const headings = [...source.matchAll(/^## (\d{4}-\d{2}-\d{2})\s*$/gm)];
  const currentIndex = headings.findIndex((match) => match[1] === moment.date);
  if (currentIndex >= 0) {
    const next = headings[currentIndex + 1]?.index ?? source.length;
    return source.slice(0, next).trimEnd() + "\n\n" + entry + "\n\n" + source.slice(next);
  }
  const insertion = headings[0]?.index ?? source.length;
  const intro = source || "# Jurnalul Hopper\n\nSchimbări zilnice ale proiectului.\n";
  if (!source) return intro.trimEnd() + "\n\n## " + moment.date + "\n\n" + entry + "\n";
  return (
    source.slice(0, insertion).trimEnd() +
    "\n\n## " +
    moment.date +
    "\n\n" +
    entry +
    "\n\n" +
    source.slice(insertion)
  );
}
