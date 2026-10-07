(() => {
  "use strict";
  const app = window.HopperApp;
  const config = window.HopperCloudConfig || {};
  const t = (key, values = []) => window.HopperI18n?.t(key, values) || key;
  // Display currency stays local: a remote preference must not relabel an unsaved amount.
  const snapshotFields = [
    "name",
    "university",
    "studyYear",
    "theme",
    "expenses",
    "incomes",
    "monthlyBudget",
    "monthlyBudgets",
    "savingsGoal",
    "savingsGoals",
    "savingsContributions",
    "savingsGoalIds",
    "completedSavingsGoals",
    "customCategories",
    "hiddenCategories",
    "achievementState",
  ];
  const recordFields = {
    expenses: ["id", "description", "amount", "date", "currency", "category"],
    incomes: ["id", "source", "amount", "date", "currency"],
    savingsContributions: ["id", "amount", "date", "currency"],
    completedSavingsGoals: ["id", "name", "target", "saved", "currency", "completedAt"],
    customCategories: ["id", "label"],
  };
  const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
  const ordered = (value) =>
    Array.isArray(value)
      ? value.map(ordered)
      : value && typeof value === "object"
        ? Object.fromEntries(
            Object.keys(value)
              .sort()
              .map((key) => [key, ordered(value[key])]),
          )
        : value;
  const same = (a, b) => JSON.stringify(ordered(a)) === JSON.stringify(ordered(b));
  const pick = (obj, fields) =>
    Object.fromEntries(
      fields.filter((key) => Object.hasOwn(obj, key)).map((key) => [key, clone(obj[key])]),
    );
  function snapshot(user) {
    const result = pick(user, snapshotFields);
    for (const [key, fields] of Object.entries(recordFields))
      if (Array.isArray(result[key])) result[key] = result[key].map((item) => pick(item, fields));
    if (result.savingsGoal)
      result.savingsGoal = pick(result.savingsGoal, ["name", "target", "saved"]);
    if (result.savingsGoals)
      result.savingsGoals = Object.fromEntries(
        Object.entries(result.savingsGoals).map(([currency, goal]) => [
          currency,
          pick(goal, ["name", "target", "saved"]),
        ]),
      );
    if (result.achievementState)
      result.achievementState = pick(result.achievementState, ["earned"]);
    return result;
  }
  // Legacy copies of the same records get the same IDs; newly entered records get UUIDs.
  function identifyRecords(user, legacy = false) {
    for (const field of Object.keys(recordFields)) {
      const seen = new Map();
      for (const item of user[field] || []) {
        if (item.id) {
          // Count legacy identities too, so a subsequent duplicate is not collapsed.
          const match = /^legacy-.+-([a-f0-9]+)-(\d+)$/.exec(item.id);
          if (match) seen.set(match[1], Math.max(seen.get(match[1]) || 0, Number(match[2]) + 1));
          continue;
        }
        if (!legacy) {
          item.id =
            crypto.randomUUID?.() ||
            `record-${[...crypto.getRandomValues(new Uint32Array(4))].map((value) => value.toString(16).padStart(8, "0")).join("")}`;
          continue;
        }
        const canonical = JSON.stringify(
          pick(
            item,
            recordFields[field].filter((key) => key !== "id"),
          ),
        );
        let a = 2166136261,
          b = 5381;
        for (const char of canonical) {
          a = Math.imul(a ^ char.charCodeAt(0), 16777619);
          b = Math.imul(b, 33) ^ char.charCodeAt(0);
        }
        const hash = `${(a >>> 0).toString(16)}${(b >>> 0).toString(16)}`;
        const count = seen.get(hash) || 0;
        seen.set(hash, count + 1);
        item.id = `legacy-${field}-${hash}-${count}`;
      }
    }
    return user;
  }
  function validateSnapshot(data) {
    if (
      !data ||
      typeof data !== "object" ||
      Array.isArray(data) ||
      Object.keys(data).some((key) => !snapshotFields.includes(key))
    )
      throw Error("invalid-data");
    for (const key of ["name", "university", "studyYear", "currency", "theme"])
      if (data[key] !== undefined && typeof data[key] !== "string") throw Error("invalid-data");
    for (const [key, fields] of Object.entries(recordFields)) {
      if (data[key] === undefined) continue;
      if (
        !Array.isArray(data[key]) ||
        data[key].some(
          (item) =>
            !item ||
            typeof item !== "object" ||
            !item.id ||
            typeof item.id !== "string" ||
            Object.keys(item).some((prop) => !fields.includes(prop)),
        )
      )
        throw Error("invalid-data");
      if (new Set(data[key].map((item) => item.id)).size !== data[key].length)
        throw Error("invalid-data");
      if (
        ["expenses", "incomes", "savingsContributions"].includes(key) &&
        data[key].some((item) => !Number.isFinite(Number(item.amount)) || Number(item.amount) <= 0)
      )
        throw Error("invalid-data");
      if (
        key === "expenses" &&
        data[key].some(
          (item) => typeof item.description !== "string" || typeof item.category !== "string",
        )
      )
        throw Error("invalid-data");
      if (key === "incomes" && data[key].some((item) => typeof item.source !== "string"))
        throw Error("invalid-data");
      if (key === "customCategories" && data[key].some((item) => typeof item.label !== "string"))
        throw Error("invalid-data");
    }
    for (const key of [
      "monthlyBudgets",
      "savingsGoals",
      "savingsGoalIds",
      "achievementState",
      "hiddenCategories",
    ])
      if (
        data[key] !== undefined &&
        (!data[key] || typeof data[key] !== "object" || Array.isArray(data[key]))
      )
        throw Error("invalid-data");
    if (
      data.hiddenCategories &&
      Object.entries(data.hiddenCategories).some(
        ([id, hidden]) =>
          !/^(Food|Housing|Transport|Education|Bills|Entertainment|Health|Other|custom-[a-z0-9-]+)$/.test(
            id,
          ) || typeof hidden !== "boolean",
      )
    )
      throw Error("invalid-data");
    const goals = [
      ...Object.values(data.savingsGoals || {}),
      ...(data.savingsGoal ? [data.savingsGoal] : []),
    ];
    if (
      goals.some(
        (goal) =>
          !goal ||
          typeof goal.name !== "string" ||
          !Number.isFinite(Number(goal.target)) ||
          Number(goal.target) <= 0 ||
          !Number.isFinite(Number(goal.saved)) ||
          Number(goal.saved) < 0,
      )
    )
      throw Error("invalid-data");
    return data;
  }
  // Three-way merge retains additions, respects deletions and stops on competing edits.
  function mergeSnapshots(base, local, remote, strategy) {
    const conflicts = [];
    function merge(b, l, r, path) {
      if (same(l, r) || same(r, b)) return clone(l);
      if (same(l, b)) return clone(r);
      if (Array.isArray(l) && Array.isArray(r)) {
        if (path === "achievementState.earned") return [...new Set([...l, ...r])];
        if (
          [...l, ...r, ...(Array.isArray(b) ? b : [])].every(
            (item) => item && typeof item.id === "string",
          )
        ) {
          const bm = new Map((b || []).map((item) => [item.id, item])),
            lm = new Map(l.map((item) => [item.id, item])),
            rm = new Map(r.map((item) => [item.id, item]));
          return [...new Set([...lm.keys(), ...rm.keys(), ...bm.keys()])]
            .map((id) => merge(bm.get(id), lm.get(id), rm.get(id), `${path}.${id}`))
            .filter((item) => item !== undefined);
        }
      }
      const object = (value) => value && typeof value === "object" && !Array.isArray(value);
      if (object(l) && object(r) && (b === undefined || object(b))) {
        const out = Object.create(null);
        for (const key of new Set([
          ...Object.keys(b || {}),
          ...Object.keys(l),
          ...Object.keys(r),
        ])) {
          const value = merge(b?.[key], l[key], r[key], path ? `${path}.${key}` : key);
          if (value !== undefined) out[key] = value;
        }
        return out;
      }
      // Contributions are append-only. Concurrent additions increase the same goal once each.
      if (
        /^(savingsGoal|savingsGoals\.[A-Z]+)\.saved$/.test(path) &&
        typeof b === "number" &&
        typeof l === "number" &&
        typeof r === "number" &&
        l >= b &&
        r >= b
      ) {
        const currency = path === "savingsGoal.saved" ? "RON" : path.split(".")[1];
        const goalId = (data) => data.savingsGoalIds?.[currency] || `legacy-${currency}`;
        const oldIds = new Set((base.savingsContributions || []).map((item) => item.id));
        const additions = (data) =>
          (data.savingsContributions || []).filter(
            (item) => !oldIds.has(item.id) && (item.currency || "RON") === currency,
          );
        const sum = (items) =>
          items.reduce((value, item) => value + Math.round(Number(item.amount) * 100), 0);
        const la = additions(local),
          ra = additions(remote);
        if (
          goalId(base) === goalId(local) &&
          goalId(base) === goalId(remote) &&
          Math.round((l - b) * 100) === sum(la) &&
          Math.round((r - b) * 100) === sum(ra)
        ) {
          const union = [...new Map([...la, ...ra].map((item) => [item.id, item])).values()];
          return (Math.round(b * 100) + sum(union)) / 100;
        }
      }
      conflicts.push(path);
      return clone(strategy === "remote" ? r : l);
    }
    return { data: merge(base, local, remote, ""), conflicts };
  }
  // Preserve local-only and legacy metadata while replacing the known shared fields.
  function applySnapshot(user, data) {
    const result = clone(user);
    for (const key of snapshotFields) {
      if (!(key in data)) {
        delete result[key];
        continue;
      }
      if (recordFields[key] && Array.isArray(data[key])) {
        const previous = new Map((user[key] || []).map((item) => [item.id, item]));
        result[key] = data[key].map((item) => ({ ...previous.get(item.id), ...clone(item) }));
      } else if (["savingsGoal", "achievementState"].includes(key))
        result[key] = { ...user[key], ...clone(data[key]) };
      else if (key === "savingsGoals")
        result[key] = Object.fromEntries(
          Object.entries(data[key]).map(([currency, goal]) => [
            currency,
            { ...user[key]?.[currency], ...clone(goal) },
          ]),
        );
      else result[key] = clone(data[key]);
    }
    return result;
  }
  const configured = Boolean(config.url && config.publishableKey && window.supabase?.createClient);
  let client = null,
    session = null,
    busy = false,
    connecting = false,
    generation = 0,
    timer = null,
    queued = false,
    pendingConflict = null;
  let statusKey = configured
    ? "Conectează un cont online pentru sincronizare."
    : "Sincronizarea va fi disponibilă după configurarea proiectului Supabase.";
  function status(key) {
    statusKey = key;
    for (const id of ["sync-status", "cloud-status"])
      document.getElementById(id).textContent = t(key);
    const linked = Boolean(session && matches(app.currentUser(), session));
    document.getElementById("sync-now").hidden = !linked;
    document.getElementById("sync-disconnect").hidden = !linked;
    document.getElementById("sync-conflict").hidden = !pendingConflict || !linked;
    document.querySelectorAll("#cloud-form button").forEach((button) => {
      button.disabled = !configured || connecting;
    });
  }
  const matches = (user, auth) =>
    user?.cloudAccountId === auth?.user.id &&
    user?.cloudProject === config.url &&
    user?.email.toLowerCase() === auth?.user.email?.toLowerCase();
  const stateKey = (auth) => `hopper_sync:${config.url}:${auth.user.id}`;
  function readState(auth) {
    const value = localStorage.getItem(stateKey(auth));
    return value ? JSON.parse(value) : { base: {}, revision: 0 };
  }
  function writeState(auth, state) {
    localStorage.setItem(stateKey(auth), JSON.stringify(state));
  }
  function ensureClient() {
    if (!configured) throw Error("not-configured");
    if (!client) {
      client = window.supabase.createClient(config.url, config.publishableKey, {
        auth: {
          storageKey: `hopper_cloud_session:${config.url}`,
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
        },
      });
      client.auth.onAuthStateChange((event, next) => {
        session = next;
        if (event === "SIGNED_OUT") {
          generation++;
          clearTimeout(timer);
        }
      });
    }
    return client;
  }
  async function remoteRow(auth) {
    const { data, error } = await client
      .from("hopper_accounts")
      .select("data,revision")
      .eq("user_id", auth.user.id)
      .maybeSingle();
    if (error) throw error;
    if (data) validateSnapshot(data.data);
    return data || { data: {}, revision: 0 };
  }
  function validRun(token, auth) {
    return (
      token === generation && matches(app.currentUser(), auth) && session?.user.id === auth.user.id
    );
  }
  function schedule(delay = 15000) {
    clearTimeout(timer);
    if (session && matches(app.currentUser(), session))
      timer = setTimeout(() => synchronize(), delay);
  }
  function errorStatus(error) {
    if (error?.message === "not-configured")
      return "Sincronizarea va fi disponibilă după configurarea proiectului Supabase.";
    if (error?.message === "invalid-data")
      return "Datele online nu au formatul așteptat. Datele locale sunt păstrate.";
    if (error?.code === "email_not_confirmed")
      return "Confirmă emailul, apoi conectează-te din nou.";
    if (error?.code === "invalid_credentials")
      return "Emailul sau parola contului online sunt incorecte.";
    if (error?.message === "import-required")
      return "Bifează adăugarea datelor locale pentru a păstra înregistrările existente.";
    if (error?.message === "different-account")
      return "Acest cont local este deja asociat cu un alt cont online.";
    if (error?.name === "QuotaExceededError")
      return "Nu este suficient spațiu în browser. Datele online și locale sunt păstrate.";
    return "Conectarea sau sincronizarea a eșuat. Datele locale sunt păstrate; încearcă din nou.";
  }
  async function synchronize(strategy) {
    if (busy || connecting) {
      queued = true;
      return;
    }
    if (!session || !matches(app.currentUser(), session)) return;
    if (!navigator.onLine) {
      status("Offline. Modificările locale se vor sincroniza când revine conexiunea.");
      schedule();
      return;
    }
    if (document.visibilityState === "hidden") {
      schedule();
      return;
    }
    busy = true;
    const auth = session,
      token = generation;
    try {
      status("Se sincronizează…");
      for (let attempt = 0; attempt < 3; attempt++) {
        const localUser = app.currentUser();
        const state = readState(auth);
        const local = snapshot(localUser);
        const remote = await remoteRow(auth);
        if (!validRun(token, auth)) return;
        const merged = mergeSnapshots(state.base, local, remote.data, strategy);
        if (merged.conflicts.length && !strategy) {
          pendingConflict = { local, remote: remote.data, conflicts: merged.conflicts };
          status(
            "Aceleași date au fost modificate diferit pe două dispozitive. Alege versiunea pentru câmpurile în conflict.",
          );
          return;
        }
        let saved = remote;
        if (!same(merged.data, remote.data) || remote.revision === 0) {
          validateSnapshot(merged.data);
          const { data, error } = await client.rpc("hopper_save_snapshot", {
            expected_revision: remote.revision,
            snapshot: merged.data,
          });
          if (error) throw error;
          if (!validRun(token, auth)) return;
          if (!data?.length) continue; // Another device won the race: fetch and merge again.
          saved = data[0];
        }
        // Edits made during the request stay pending for the next round.
        const latest = app.currentUser();
        const catchup = mergeSnapshots(local, snapshot(latest), saved.data);
        if (catchup.conflicts.length) {
          status(
            "Ai modificat date în timpul sincronizării. Încercăm din nou fără să pierdem modificările.",
          );
          queued = true;
          return;
        }
        if (!same(snapshot(latest), catchup.data))
          app.applyCloud(applySnapshot(latest, catchup.data));
        writeState(auth, { base: saved.data, revision: saved.revision });
        pendingConflict = null;
        status(
          same(catchup.data, saved.data)
            ? "Date sincronizate între dispozitive."
            : "Modificări locale în așteptarea sincronizării.",
        );
        if (!same(catchup.data, saved.data)) queued = true;
        return;
      }
      status("Alt dispozitiv actualizează datele. Sincronizarea va reîncerca.");
    } catch (error) {
      if (validRun(token, auth)) status(errorStatus(error));
    } finally {
      busy = false;
      schedule(queued ? 500 : 15000);
      queued = false;
    }
  }
  async function connect(register) {
    if (connecting || busy) return;
    connecting = true;
    generation++;
    const token = generation;
    const email = document.getElementById("cloud-email").value.trim().toLowerCase();
    const password = document.getElementById("cloud-password").value;
    const name = document.getElementById("cloud-name").value.trim();
    const importLocal = document.getElementById("cloud-import").checked;
    document.querySelectorAll("#cloud-form button").forEach((button) => {
      button.disabled = true;
    });
    try {
      ensureClient();
      status("Se conectează…");
      const response = register
        ? await client.auth.signUp({
            email,
            password,
            options: { data: { name: name || email.split("@")[0] } },
          })
        : await client.auth.signInWithPassword({ email, password });
      if (response.error) throw response.error;
      if (token !== generation) return;
      if (!response.data.session) {
        status("Confirmă emailul, apoi conectează-te din nou.");
        return;
      }
      session = response.data.session;
      const remote = await remoteRow(session);
      if (token !== generation) return;
      const existing = app.users().find((user) => user.email.toLowerCase() === email);
      if (existing?.cloudAccountId && !matches(existing, session)) throw Error("different-account");
      const linked = matches(existing, session);
      const hasLocal =
        (existing &&
          ["expenses", "incomes", "savingsContributions"].some((key) => existing[key]?.length)) ||
        existing?.monthlyBudget ||
        Object.keys(existing?.monthlyBudgets || {}).length ||
        existing?.savingsGoal ||
        Object.keys(existing?.savingsGoals || {}).length;
      if (hasLocal && !linked && !importLocal) throw Error("import-required");
      let user = existing
        ? clone(existing)
        : {
            name: name || session.user.user_metadata?.name || email.split("@")[0],
            email,
            expenses: [],
            incomes: [],
            currency: "RON",
          };
      identifyRecords(user, true);
      user.cloudAccountId = session.user.id;
      user.cloudProject = config.url;
      if (!linked && !importLocal && remote.revision) user = applySnapshot(user, remote.data);
      // A missing baseline means an explicit first import; conflicting goal/budget values are reviewed.
      if (!linked)
        writeState(session, { base: importLocal ? {} : remote.data, revision: remote.revision });
      app.applyCloud(user);
      app.openUser(user);
      document.getElementById("cloud-password").value = "";
      document.getElementById("cloud-dialog").close();
    } catch (error) {
      if (token === generation) status(errorStatus(error));
    } finally {
      connecting = false;
      document.querySelectorAll("#cloud-form button").forEach((button) => {
        button.disabled = !configured;
      });
    }
    if (session && matches(app.currentUser(), session)) await synchronize();
  }
  async function disconnect() {
    generation++;
    clearTimeout(timer);
    pendingConflict = null;
    const previous = session;
    session = null;
    status("Sincronizarea este oprită pe acest dispozitiv. Datele locale sunt păstrate.");
    if (previous && client) await client.auth.signOut({ scope: "local" });
  }
  document.querySelectorAll("[data-open-cloud]").forEach((button) =>
    button.addEventListener("click", () => {
      const user = app.currentUser();
      document.getElementById("cloud-name").value = user?.name || "";
      document.getElementById("cloud-email").value = user?.email || "";
      document.getElementById("cloud-password").value = "";
      document.getElementById("cloud-import").checked = false;
      status(statusKey);
      document.getElementById("cloud-dialog").showModal();
    }),
  );
  document
    .getElementById("cloud-close")
    .addEventListener("click", () => document.getElementById("cloud-dialog").close());
  document.getElementById("cloud-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const password = document.getElementById("cloud-password");
    if (password.value.length < 8) {
      status("Parola contului online trebuie să aibă cel puțin 8 caractere.");
      password.focus();
      return;
    }
    connect(event.submitter?.id === "cloud-register");
  });
  document.getElementById("sync-now").addEventListener("click", () => synchronize());
  document.getElementById("sync-disconnect").addEventListener("click", disconnect);
  document.getElementById("sync-use-local").addEventListener("click", () => synchronize("local"));
  document.getElementById("sync-use-remote").addEventListener("click", () => synchronize("remote"));
  document.getElementById("sync-export-conflict").addEventListener("click", () => {
    if (!pendingConflict) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(pendingConflict, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "hopper-conflict-backup.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  const onData = () => {
    if (!connecting) schedule(500);
  };
  const onOnline = () => synchronize();
  const onVisibility = () => {
    if (document.visibilityState === "visible") synchronize();
  };
  const onLanguage = () => status(statusKey);
  const onStorage = (event) => {
    if (event.key === "expenses_users" || event.key === "expenses_current_user") schedule(500);
  };
  document.addEventListener("hopper:data-changed", onData);
  document.addEventListener("hopper:logout", disconnect);
  document.addEventListener("hopper:language", onLanguage);
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("online", onOnline);
  window.addEventListener("storage", onStorage);
  window.HopperSync = {
    identifyRecords,
    snapshot,
    mergeSnapshots,
    validateSnapshot,
    applySnapshot,
    synchronize,
    connect,
    disconnect,
    dispose() {
      generation++;
      clearTimeout(timer);
      document.removeEventListener("hopper:data-changed", onData);
      document.removeEventListener("hopper:logout", disconnect);
      document.removeEventListener("hopper:language", onLanguage);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("storage", onStorage);
      client?.auth.stopAutoRefresh();
    },
  };
  status(statusKey);
  if (configured) {
    try {
      ensureClient()
        .auth.getSession()
        .then(({ data }) => {
          if (connecting) return;
          session = data.session;
          if (session && matches(app.currentUser(), session)) synchronize();
        })
        .catch(() => status("Sincronizarea nu este disponibilă. Datele locale sunt păstrate."));
    } catch {
      status("Sincronizarea nu este disponibilă. Datele locale sunt păstrate.");
    }
  }
})();
