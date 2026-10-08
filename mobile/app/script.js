function hopperText(key, values = []) {
  if (!key) return "";
  return window.HopperI18n?.t(key, values) ?? key.replace(/\{(\d+)\}/g, (_, index) => String(values[index] ?? ""));
}
function hopperLocale() { return window.HopperI18n?.locale() || "ro-RO"; }

const authScreen = document.getElementById("auth-screen");
const appScreen = document.getElementById("app-screen");
const loginForm = document.getElementById("login-form");
const loginStatus = document.getElementById("login-status");
const registerForm = document.getElementById("register-form");
const expenseForm = document.getElementById("expense-form");
const expenseNotification = document.getElementById("expense-notification");
const achievementNotification = document.getElementById("achievement-notification");
const achievementNotificationMessage = document.getElementById("achievement-notification-message");
const achievementNotificationIcon = document.getElementById("achievement-notification-icon");
const userNameElement = document.getElementById("user-name");
const logoutButton = document.getElementById("logout-button");

const authSwitches = document.querySelectorAll(".auth-form-switch");
const viewTabs = document.querySelectorAll(".view-tab");
const pageViews = document.querySelectorAll(".page-view");

const USERS_KEY = "expenses_users";
const CURRENT_USER_KEY = "expenses_current_user";
const supportedCurrencies = ["RON", "EUR", "USD", "GBP", "CHF"];
let activeCurrency = "RON";
let profilePhotoRequest = 0;
let expenseNotificationTimer = null;
let achievementNotificationTimer = null;

const requiredMessages = {
  "register-name": "Completează numele.",
  "register-email": "Completează emailul.",
  "register-password": "Completează parola.",
  description: "Completează ce ai cumpărat.",
  amount: "Completează suma.",
  category: "Alege o categorie.",
  "income-amount": "Completează suma.",
  "monthly-budget": "Completează limita lunară.",
  "savings-name": "Completează numele obiectivului.",
  "savings-target": "Completează ținta obiectivului.",
  "savings-saved": "Completează suma de adăugat.",
  "profile-name": "Completează numele.",
  "problem-summary": "Scrie pe scurt problema.",
  "problem-description": "Descrie problema înainte de trimitere.",
  "edit-description": "Completează descrierea sau sursa venitului.",
  "edit-amount": "Completează suma.",
  "edit-date": "Alege data.",
  "custom-category-name": "Completează numele categoriei.",
};

function fieldValidationMessage(field) {
  if (field.id === "edit-date" && editContext?.kind === "expenses") {
    field.max = dateInputValue(new Date());
    return expenseDateValidationMessage(field.value);
  }
  if (!field.willValidate) return "";
  if (field.validity.badInput) return hopperText("Introdu o sumă validă.");
  if (!field.value.trim()) return hopperText(requiredMessages[field.id]) || hopperText("Completează acest câmp.");
  if (field.validity.typeMismatch && field.type === "email") return hopperText("Introdu o adresă de email validă.");
  if (field.validity.rangeUnderflow) return hopperText("Introdu o sumă de cel puțin 0,01.");
  if (field.validity.stepMismatch) return hopperText("Introdu o sumă cu maximum două zecimale.");
  return field.validity.valid ? "" : hopperText("Verifică valoarea introdusă în acest câmp.");
}

function showFieldValidation(field, message = "") {
  const control = field.id === "category" && field.hidden ? document.getElementById("expense-category-button") : field;
  const id = `${field.id}-error`;
  let error = document.getElementById(id);
  if (message && !error) {
    error = document.createElement("p");
    error.id = id;
    error.className = "field-error";
    error.setAttribute("role", "alert");
    error.setAttribute("aria-atomic", "true");
    control.insertAdjacentElement("afterend", error);
  }
  if (error) {
    error.textContent = message;
    error.hidden = !message;
  }
  const descriptions = new Set((field.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean));
  if (message) {
    field.setAttribute("aria-invalid", "true");
    descriptions.add(id);
  } else {
    field.removeAttribute("aria-invalid");
    descriptions.delete(id);
  }
  if (descriptions.size) field.setAttribute("aria-describedby", [...descriptions].join(" "));
  else field.removeAttribute("aria-describedby");
  if (control !== field) {
    for (const attribute of ["aria-invalid", "aria-describedby"]) {
      if (field.hasAttribute(attribute)) control.setAttribute(attribute, field.getAttribute(attribute));
      else control.removeAttribute(attribute);
    }
  }
}

function clearFormValidation(form) {
  form.querySelectorAll("[required]").forEach((field) => showFieldValidation(field));
}

document.querySelectorAll("form:not(#login-form)").forEach((form) => {
  const fields = Array.from(form.querySelectorAll("input[required], select[required], textarea[required]"));
  if (!fields.length) return;
  // Keep native validation as a fallback until JavaScript has installed inline feedback.
  form.noValidate = true;
  form.addEventListener("submit", (event) => {
    let firstInvalid = null;
    fields.forEach((field) => {
      const message = fieldValidationMessage(field);
      showFieldValidation(field, message);
      if (message && !firstInvalid) firstInvalid = field;
    });
    if (!firstInvalid) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    (firstInvalid.id === "category" && firstInvalid.hidden ? document.getElementById("expense-category-button") : firstInvalid).focus();
  }, true);
  const updateField = (event) => {
    if (fields.includes(event.target) && event.target.hasAttribute("aria-invalid")) {
      showFieldValidation(event.target, fieldValidationMessage(event.target));
    }
  };
  form.addEventListener("input", updateField);
  form.addEventListener("change", updateField);
  form.addEventListener("reset", () => clearFormValidation(form));
});

// Presentation listeners receive only the action and DOM target, never account data.
function emitUI(kind, target = null) {
  document.dispatchEvent(new CustomEvent("hopper:ui", { detail: { kind, target } }));
}

function clearExpenseNotification() {
  clearTimeout(expenseNotificationTimer);
  expenseNotificationTimer = null;
  expenseNotification.classList.remove("visible", "error");
  expenseNotification.textContent = "";
}

function showExpenseNotification(message = hopperText("Cheltuială adăugată"), isError = false) {
  clearExpenseNotification();
  expenseNotification.textContent = message;
  expenseNotification.classList.toggle("error", isError);
  expenseNotification.classList.add("visible");
  expenseNotificationTimer = setTimeout(clearExpenseNotification, 3500);
}

function clearAchievementNotification() {
  clearTimeout(achievementNotificationTimer);
  achievementNotificationTimer = null;
  if (achievementNotification.classList.contains("visible") && achievementNotification.isConnected) emitUI("achievement-dismissed", "achievement-notification");
  achievementNotification.classList.remove("visible");
  achievementNotificationMessage.textContent = "";
  achievementNotificationIcon.replaceChildren();
}

function showAchievementNotification(badges) {
  clearAchievementNotification();
  const first = badges[0];
  const extra = badges.length - 1;
  achievementNotificationMessage.textContent = extra > 0
    ? hopperText("{0} · și încă {1} {2}", [first.title, extra, extra === 1 ? hopperText("reușită") : hopperText("reușite")]) : first.title;
  const symbol = document.getElementById(`achievement-${first.id}`)?.querySelector(".achievement-icon svg");
  if (symbol) achievementNotificationIcon.appendChild(symbol.cloneNode(true));
  achievementNotification.classList.add("visible");
  emitUI("achievement-celebration", "achievement-notification");
  achievementNotificationTimer = setTimeout(clearAchievementNotification, 4500);
}

function renderProfilePhoto(user) {
  const initial = Array.from(user.name.trim())[0]?.toLocaleUpperCase("ro-RO") || "H";
  const photo = typeof user.profilePhoto === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(user.profilePhoto) ? user.profilePhoto : "";
  for (const prefix of ["header-profile", "profile"]) {
    const image = document.getElementById(`${prefix}-photo`);
    const fallback = document.getElementById(`${prefix}-initial`);
    fallback.textContent = initial;
    fallback.classList.toggle("hidden", Boolean(photo));
    image.classList.toggle("hidden", !photo);
    if (photo) image.src = photo;
    else image.removeAttribute("src");
  }
  document.getElementById("remove-profile-photo").classList.toggle("hidden", !photo);
}

function prepareProfilePhoto(file) {
  if (window.HopperProfileCrop) return window.HopperProfileCrop(file);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read"));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("decode"));
      image.onload = () => {
        try {
          const width = image.naturalWidth;
          const height = image.naturalHeight;
          if (!width || !height) throw new Error("dimensions");
          const canvas = document.createElement("canvas");
          canvas.width = canvas.height = 256;
          const context = canvas.getContext("2d");
          if (!context) throw new Error("canvas");
          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, 256, 256);
          const side = Math.min(width, height);
          context.drawImage(image, (width - side) / 2, (height - side) / 2, side, side, 0, 0, 256, 256);
          const photo = canvas.toDataURL("image/jpeg", 0.85);
          if (!photo.startsWith("data:image/jpeg;base64,")) throw new Error("encode");
          resolve(photo);
        } catch (error) { reject(error); }
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

function currencyCode(currency) {
  return supportedCurrencies.includes(currency) ? currency : "RON";
}

function monthlyBudgetFor(user, currency = activeCurrency) {
  return user?.monthlyBudgets?.[currency] ?? (currency === "RON" ? user?.monthlyBudget : undefined);
}

function savingsGoalFor(user, currency = activeCurrency) {
  return user?.savingsGoals?.[currency] ?? (currency === "RON" ? user?.savingsGoal : undefined);
}

const studentCategories = [
  { id: "Food", label: "Mâncare", color: "var(--category-food)" },
  { id: "Housing", label: "Cămin / chirie", color: "var(--category-housing)" },
  { id: "Transport", label: "Transport", color: "var(--category-transport)" },
  { id: "Education", label: "Facultate", color: "var(--category-education)" },
  { id: "Bills", label: "Facturi", color: "var(--category-bills)" },
  { id: "Entertainment", label: "Timp liber", color: "var(--category-entertainment)" },
  { id: "Health", label: "Sănătate", color: "var(--category-health)" },
  { id: "Other", label: "Altele", color: "var(--category-other)" },
];

function categoriesFor(user = getCurrentUser(), includeHidden = false) {
  const ids = new Set(studentCategories.map((item) => item.id));
  const custom = (Array.isArray(user?.customCategories) ? user.customCategories : []).filter((item) => {
    if (!item || !/^custom-[a-z0-9-]+$/.test(item.id) || typeof item.label !== "string" || !item.label.trim() || ids.has(item.id)) return false;
    ids.add(item.id);
    return true;
  }).map((item) => ({ id: item.id, label: item.label, color: "var(--category-custom)" }));
  const categories = [...studentCategories.map((category) => ({ ...category, label: hopperText(category.label) })), ...custom];
  return includeHidden ? categories : categories.filter((category) => user?.hiddenCategories?.[category.id] !== true);
}

function reportCategoriesFor(expenses, user = getCurrentUser()) {
  const categories = categoriesFor(user, true);
  const knownIds = new Set(categories.map((category) => category.id));
  const used = new Set(expenses.map((expense) => {
    const id = normalizeCategory(expense.category);
    return knownIds.has(id) ? id : "Other";
  }));
  return categories.filter((category) => user?.hiddenCategories?.[category.id] !== true || used.has(category.id));
}

const categoryOptionLabels = new Map([...document.querySelectorAll("#category option")].map((option) => [option.value, option.dataset.i18n || option.textContent]));
function fillCategorySelect(select, categories, selected) {
  select.replaceChildren();
  if (select.id === "category") select.appendChild(new Option(hopperText("Detectează automat"), "auto"));
  categories.forEach((category) => {
    const option = new Option(hopperText(categoryOptionLabels.get(category.id)) || category.label, category.id);
    if (category.id.startsWith("custom-")) option.dataset.customCategory = "true";
    select.appendChild(option);
  });
  select.value = selected;
  if (!select.value) select.value = select.id === "category" ? "auto" : select.options[0]?.value || "";
}

function syncCategoryOptions(user) {
  for (const id of ["category", "edit-category"]) {
    const select = document.getElementById(id);
    const selected = select.value;
    const categories = categoriesFor(user);
    if (id === "edit-category" && editor.open && editContext?.email === user.email) {
      const existing = categoriesFor(user, true).find((category) => category.id === documentCategory(editContext.original));
      if (existing && !categories.some((category) => category.id === existing.id)) categories.push(existing);
    }
    fillCategorySelect(select, categories, selected);
  }
  syncExpenseCategoryField();
  const legend = document.getElementById("expense-legend");
  legend.replaceChildren();
  reportCategoriesFor(monthTransactions(user.expenses), user).forEach((category) => {
    const row = document.createElement("li");
    row.dataset.category = category.id;
    row.dataset.customCategory = "true";
    const dot = document.createElement("span");
    dot.className = "dot";
    dot.style.backgroundColor = category.color;
    dot.setAttribute("aria-hidden", "true");
    const label = document.createElement("span");
    label.className = "legend-category";
    label.textContent = category.label;
    const percent = document.createElement("strong");
    percent.className = "legend-percent";
    row.append(dot, label, percent);
    legend.appendChild(row);
  });
  renderCategoryManager(user);
}

const categoryManager = document.getElementById("category-manager");
const categoryManagerTrigger = document.getElementById("manage-categories");
function renderCategoryManager(user) {
  const list = document.getElementById("category-manager-list");
  list.replaceChildren();
  const categories = categoriesFor(user);
  categories.forEach((category, index) => {
    const row = document.createElement("li");
    const label = document.createElement("span");
    label.textContent = category.label;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary-button category-delete-button";
    button.dataset.removeCategory = category.id;
    button.textContent = hopperText("Șterge");
    button.setAttribute("aria-label", hopperText("Șterge categoria: {0}", [category.label]));
    button.addEventListener("click", () => {
      if (getCurrentUser()?.email !== user.email) return;
      const status = document.getElementById("category-manager-status");
      try {
        const saved = updateCurrentUser((current) => {
          if (!categoriesFor(current).some((item) => item.id === category.id)) return false;
          current.hiddenCategories = { ...(current.hiddenCategories || {}), [category.id]: true };
        });
        if (!saved) return;
        status.textContent = hopperText("Categoria a fost eliminată. Cheltuielile existente sunt păstrate.");
        const remaining = list.querySelectorAll("button");
        (remaining[index] || remaining[index - 1] || document.getElementById("restore-categories")).focus();
      } catch {
        status.textContent = hopperText("Categoria nu a putut fi eliminată. Încearcă din nou.");
        button.focus();
      }
    });
    row.append(label, button);
    list.appendChild(row);
  });
  document.getElementById("category-manager-empty").hidden = categories.length > 0;
  document.getElementById("restore-categories").disabled = !categoriesFor(user, true).some((category) => user?.hiddenCategories?.[category.id] === true);
}
categoryManagerTrigger.addEventListener("click", () => {
  const user = getCurrentUser();
  if (!user) return;
  renderCategoryManager(user);
  document.getElementById("category-manager-status").textContent = "";
  categoryManager.showModal();
  categoryManagerTrigger.setAttribute("aria-expanded", "true");
  emitUI("dialog", categoryManager.id);
});
categoryManager.addEventListener("close", () => {
  categoryManagerTrigger.setAttribute("aria-expanded", "false");
  categoryManagerTrigger.focus();
});
categoryManager.addEventListener("click", (event) => { if (event.target === categoryManager) categoryManager.close(); });
document.getElementById("restore-categories").addEventListener("click", () => {
  try {
    const saved = updateCurrentUser((user) => {
      user.hiddenCategories = { ...(user.hiddenCategories || {}) };
      categoriesFor(user, true).forEach((category) => { delete user.hiddenCategories[category.id]; });
    });
    if (saved) {
      document.getElementById("category-manager-status").textContent = hopperText("Categoriile au fost restabilite.");
      document.querySelector("#category-manager-list button")?.focus();
    }
  } catch {
    document.getElementById("category-manager-status").textContent = hopperText("Categoriile nu au putut fi restabilite. Încearcă din nou.");
  }
});

function formatMoney(amount, currency = activeCurrency) {
  return new Intl.NumberFormat(hopperLocale(), { style: "currency", currency }).format(amount);
}

function categoryLabel(category) {
  return categoriesFor(getCurrentUser(), true).find((item) => item.id === normalizeCategory(category))?.label || hopperText("Altele");
}

function dateInputValue(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function expenseDateValidationMessage(value) {
  if (!value) return hopperText("Alege data.");
  const date = new Date(`${value}T00:00:00`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(date.getTime()) || dateInputValue(date) !== value) return hopperText("Alege o dată validă.");
  return value > dateInputValue(new Date()) ? hopperText("Cheltuiala nu poate avea o dată viitoare. Alege azi sau o zi din trecut.") : "";
}

function latestExpenseDate(date) {
  const now = new Date();
  return dateInputValue(date) > dateInputValue(now) ? new Date(now.getFullYear(), now.getMonth(), now.getDate()) : date;
}

function setSelectedExpenseDate() {
  document.getElementById("expense-date").value = dateInputValue(latestExpenseDate(selectedDate));
}

function syncDateFields() {
  document.querySelectorAll("[data-date-input]").forEach((button) => {
    const value = document.getElementById(button.dataset.dateInput).value;
    const date = value ? new Date(`${value}T00:00:00`) : null;
    const label = date && !Number.isNaN(date.getTime()) ? new Intl.DateTimeFormat(hopperLocale(), { day: "numeric", month: "long", year: "numeric" }).format(date) : hopperText("Alege data");
    button.querySelector(".date-field-value").textContent = label;
    button.setAttribute("aria-label", hopperText("Data {0}: {1}", [button.dataset.dateInput === "expense-date" ? hopperText("cheltuielii") : hopperText("venitului"), label]));
    if (button.dataset.dateInput === "expense-date" && button.hasAttribute("aria-invalid")) showFieldValidation(button, expenseDateValidationMessage(value));
  });
}

const datePicker = document.getElementById("date-picker");
let datePickerTrigger = null;
let datePickerMonth = null;
let datePickerFocus = null;

function renderDatePicker(focusDay = false) {
  const year = datePickerMonth.getFullYear();
  const month = datePickerMonth.getMonth();
  const isExpense = datePickerTrigger.dataset.dateInput === "expense-date";
  const currentDay = dateInputValue(new Date());
  document.getElementById("date-picker-next").disabled = isExpense && dateInputValue(new Date(year, month + 1, 1)) > currentDay;
  document.getElementById("date-picker-month").textContent = new Intl.DateTimeFormat(hopperLocale(), { month: "long", year: "numeric" }).format(datePickerMonth);
  const days = document.getElementById("date-picker-days");
  days.replaceChildren();
  const offset = (new Date(year, month, 1).getDay() + 6) % 7;
  for (let i = 0; i < offset; i++) {
    const empty = document.createElement("span");
    empty.setAttribute("aria-hidden", "true");
    days.appendChild(empty);
  }
  const selected = document.getElementById(datePickerTrigger.dataset.dateInput).value;
  const lastDay = new Date(year, month + 1, 0).getDate();
  for (let day = 1; day <= lastDay; day++) {
    const date = new Date(year, month, day);
    const value = dateInputValue(date);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "date-picker-day";
    button.dataset.date = value;
    button.textContent = day;
    button.disabled = isExpense && value > currentDay;
    button.tabIndex = !button.disabled && value === dateInputValue(datePickerFocus) ? 0 : -1;
    button.setAttribute("aria-label", new Intl.DateTimeFormat(hopperLocale(), { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(date));
    button.setAttribute("aria-pressed", String(value === selected));
    if (value === selected) button.classList.add("selected");
    if (value === currentDay) {
      button.classList.add("today");
      button.setAttribute("aria-current", "date");
    }
    button.addEventListener("click", () => choosePickerDate(date));
    button.addEventListener("focus", () => {
      datePickerFocus = date;
      days.querySelectorAll("button").forEach((item) => { item.tabIndex = item === button ? 0 : -1; });
    });
    days.appendChild(button);
  }
  if (focusDay) days.querySelector('[tabindex="0"]')?.focus();
}

function choosePickerDate(date) {
  const input = document.getElementById(datePickerTrigger.dataset.dateInput);
  if (input.id === "expense-date" && expenseDateValidationMessage(dateInputValue(date))) {
    datePickerFocus = latestExpenseDate(date);
    datePickerMonth = new Date(datePickerFocus.getFullYear(), datePickerFocus.getMonth(), 1);
    renderDatePicker(true);
    return;
  }
  input.value = dateInputValue(date);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  syncDateFields();
  datePicker.close();
}

function movePickerMonth(direction, focusDay = false) {
  const nextMonth = new Date(datePickerMonth.getFullYear(), datePickerMonth.getMonth() + direction, 1);
  if (datePickerTrigger.dataset.dateInput === "expense-date" && dateInputValue(nextMonth) > dateInputValue(new Date())) return;
  const day = Math.min(datePickerFocus.getDate(), new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0).getDate());
  datePickerMonth = nextMonth;
  datePickerFocus = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), day);
  if (datePickerTrigger.dataset.dateInput === "expense-date") datePickerFocus = latestExpenseDate(datePickerFocus);
  renderDatePicker(focusDay);
}

document.querySelectorAll("[data-date-input]").forEach((button) => {
  button.addEventListener("click", () => {
    datePickerTrigger = button;
    const value = document.getElementById(button.dataset.dateInput).value;
    const date = value ? new Date(`${value}T00:00:00`) : new Date();
    datePickerFocus = Number.isNaN(date.getTime()) ? new Date() : date;
    if (button.dataset.dateInput === "expense-date") datePickerFocus = latestExpenseDate(datePickerFocus);
    datePickerMonth = new Date(datePickerFocus.getFullYear(), datePickerFocus.getMonth(), 1);
    document.getElementById("date-picker-title").textContent = button.dataset.dateInput === "expense-date" ? hopperText("Data cheltuielii") : hopperText("Data venitului");
    button.setAttribute("aria-expanded", "true");
    renderDatePicker();
    datePicker.showModal();
    emitUI("dialog", datePicker.id);
    document.querySelector('#date-picker-days [tabindex="0"]')?.focus();
  });
  document.getElementById(button.dataset.dateInput).addEventListener("change", syncDateFields);
});
document.getElementById("date-picker-prev").addEventListener("click", () => movePickerMonth(-1));
document.getElementById("date-picker-next").addEventListener("click", () => movePickerMonth(1));
document.getElementById("date-picker-today").addEventListener("click", () => choosePickerDate(new Date()));
for (const id of ["date-picker-close", "date-picker-cancel"]) {
  document.getElementById(id).addEventListener("click", () => datePicker.close());
}
datePicker.addEventListener("click", (event) => { if (event.target === datePicker) datePicker.close(); });
datePicker.addEventListener("close", () => {
  datePickerTrigger?.setAttribute("aria-expanded", "false");
  datePickerTrigger?.focus();
});
document.getElementById("date-picker-days").addEventListener("keydown", (event) => {
  if (!event.target.matches(".date-picker-day")) return;
  const steps = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
  if (event.key === "PageUp" || event.key === "PageDown") {
    event.preventDefault();
    movePickerMonth(event.key === "PageUp" ? -1 : 1, true);
    return;
  }
  let step = steps[event.key];
  if (event.key === "Home") step = -((datePickerFocus.getDay() + 6) % 7);
  if (event.key === "End") step = 6 - ((datePickerFocus.getDay() + 6) % 7);
  if (step === undefined) return;
  event.preventDefault();
  datePickerFocus = new Date(datePickerFocus.getFullYear(), datePickerFocus.getMonth(), datePickerFocus.getDate() + step);
  if (datePickerTrigger.dataset.dateInput === "expense-date") datePickerFocus = latestExpenseDate(datePickerFocus);
  datePickerMonth = new Date(datePickerFocus.getFullYear(), datePickerFocus.getMonth(), 1);
  renderDatePicker(true);
});

function validAmount(amount) {
  return Number.isFinite(Number(amount)) && Number(amount) > 0;
}

function setupOptionPicker(prefix, fieldId) {
  const field = document.getElementById(fieldId);
  const trigger = document.getElementById(prefix + "-button");
  const picker = document.getElementById(prefix + "-picker");
  const options = document.getElementById(prefix + "-options");
  function sync() {
    document.getElementById(prefix + "-value").textContent = field.options[field.selectedIndex]?.textContent || "";
  }
  field.addEventListener("change", sync);
  trigger.addEventListener("click", () => {
    options.replaceChildren();
    Array.from(field.options).forEach((option) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "study-year-option" + (prefix === "currency" ? " currency-option" : "");
      button.dataset.value = option.value;
      button.textContent = option.value ? option.textContent : hopperText("Nespecificat");
      const selected = option.value === field.value;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", String(selected));
      button.tabIndex = selected ? 0 : -1;
      button.addEventListener("focus", () => {
        options.querySelectorAll("button").forEach((item) => { item.tabIndex = item === button ? 0 : -1; });
      });
      button.addEventListener("click", () => {
        if (!Array.from(field.options).some(current => current.value === option.value)) { sync(); picker.close(); return; }
        field.value = option.value;
        field.dispatchEvent(new Event("change", { bubbles: true }));
        picker.close();
      });
      options.appendChild(button);
    });
    trigger.setAttribute("aria-expanded", "true");
    picker.showModal();
    emitUI("dialog", picker.id);
    options.querySelector('[tabindex="0"]')?.focus();
  });
  options.addEventListener("keydown", (event) => {
    const buttons = Array.from(options.querySelectorAll("button"));
    const index = buttons.indexOf(event.target);
    if (index < 0) return;
    let target;
    if (event.key === "ArrowDown") target = Math.min(index + 1, buttons.length - 1);
    else if (event.key === "ArrowUp") target = Math.max(index - 1, 0);
    else if (event.key === "Home") target = 0;
    else if (event.key === "End") target = buttons.length - 1;
    else return;
    event.preventDefault();
    buttons[target].focus();
  });
  document.getElementById(prefix + "-close").addEventListener("click", () => picker.close());
  picker.addEventListener("click", (event) => { if (event.target === picker) picker.close(); });
  picker.addEventListener("close", () => {
    trigger.setAttribute("aria-expanded", "false");
    trigger.focus();
  });
  return sync;
}

const syncStudyYearField = setupOptionPicker("study-year", "profile-study-year");
const syncCurrencyField = setupOptionPicker("currency", "settings-currency");
const syncIncomeSourceField = setupOptionPicker("income-source", "income-source");
syncIncomeSourceField();
const syncExpenseCategoryField = setupOptionPicker("expense-category", "category");
syncExpenseCategoryField();
if (typeof document.getElementById("expense-category-picker").showModal === "function") {
  document.getElementById("category").hidden = true;
  document.getElementById("expense-category-button").hidden = false;
  document.getElementById("expense-category-label").htmlFor = "expense-category-button";
}

function transactionDate(transaction) {
  if (!transaction.date) return today;
  return new Date(/^\d{4}-\d{2}-\d{2}$/.test(transaction.date) ? `${transaction.date}T00:00:00` : transaction.date);
}

function monthTransactions(transactions = []) {
  return transactions.filter((transaction) => {
    const date = transactionDate(transaction);
    return (transaction.currency || "RON") === activeCurrency && validAmount(transaction.amount) && date.getFullYear() === currentMonth.getFullYear() && date.getMonth() === currentMonth.getMonth();
  });
}

function updateCurrentUser(update) {
  const currentUser = getCurrentUser();
  if (!currentUser) return;
  const users = getUsers();
  const index = users.findIndex((user) => user.email === currentUser.email);
  if (index === -1) return;
  const previousUsers = localStorage.getItem(USERS_KEY);
  const previousAchievements = achievementDefinitions(users[index]).filter((badge) => badge.earned).map((badge) => badge.id);
  if (update(users[index]) === false) return;
  if (users[index].cloudAccountId) window.HopperSync?.identifyRecords(users[index]);
  rememberAchievements(users[index], previousAchievements);
  try {
    saveUsers(users);
    saveCurrentUser(users[index]);
  } catch (error) {
    if (localStorage.getItem(USERS_KEY) !== previousUsers) {
      if (previousUsers === null) localStorage.removeItem(USERS_KEY);
      else localStorage.setItem(USERS_KEY, previousUsers);
    }
    throw error;
  }
  renderStudentDashboard(users[index]);
  document.dispatchEvent(new CustomEvent("hopper:data-changed"));
  return users[index];
}

function getUsers() {
  return JSON.parse(localStorage.getItem(USERS_KEY)) || [];
}

function saveUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
  window.HopperPersistence?.schedule();
}

function showScreen(screenName) {
  if (screenName === "app") {
    authScreen.classList.add("hidden");
    appScreen.classList.remove("hidden");
  } else {
    clearAchievementNotification();
    closeFeatureDialogs();
    applyTheme("garden");
    authScreen.classList.remove("hidden");
    appScreen.classList.add("hidden");
  }
  emitUI("screen", screenName === "app" ? appScreen.id : authScreen.id);
}

function setActiveTab(targetFormId) {
  clearLoginMessage();
  clearFormValidation(registerForm);
  const changed = !document.getElementById(targetFormId)?.classList.contains("active");
  loginForm.classList.toggle("active", targetFormId === "login-form");
  registerForm.classList.toggle("active", targetFormId === "register-form");
  if (changed) {
    document.getElementById(targetFormId).querySelector("input").focus();
    emitUI("auth-form", targetFormId);
  }
}

function getCurrentUser() {
  const user = JSON.parse(localStorage.getItem(CURRENT_USER_KEY));
  return window.HopperAuth?.canOpen(user) ? user : null;
}

function saveCurrentUser(user) {
  localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
  window.HopperPersistence?.schedule();
}

function detectCategory(description) {
  const text = description.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  const categoryMap = [
    { keywords: ["camin", "chirie", "rent"], category: "Housing" },
    { keywords: ["xerox", "print", "curs", "cursuri", "carte", "carti", "manual", "manuale", "rechizite", "facultate", "taxa universitara"], category: "Education" },
    { keywords: ["profi", "lidl", "kaufland", "penny", "mega image", "carrefour", "selgros", "cantina", "mancare", "alimente", "pizza", "restaurant", "sampanie", "sampania", "sampanii", "champagne", "prosecco", "bere", "vin", "vinuri", "cocktail", "cocktailuri", "vodca", "vodka", "whisky", "whiskey", "cognac", "bautura", "bauturi", "apa", "suc", "sucuri", "cola", "pepsi", "fanta", "sprite", "ceai", "cafea", "espresso", "cappuccino", "latte"], category: "Food" },
    { keywords: ["petrol", "shell", "rompetrol", "omv", "lukoil", "benzina", "motorina", "autobuz", "metrou", "tren", "transport", "bolt", "uber", "stb"], category: "Transport" },
    { keywords: ["electric", "eon", "digiservice", "vodafone", "orange", "telefon", "internet", "utilitati"], category: "Bills" },
    { keywords: ["netflix", "spotify", "cinema", "movie", "playstation", "steam", "youtube", "hbo", "concert", "festival"], category: "Entertainment" },
    { keywords: ["medic", "medicamente", "farmacie", "pharmacy", "clinic", "doctor"], category: "Health" }
  ];

  for (const item of categoryMap) {
    if (item.keywords.some((keyword) => new RegExp(`\\b${keyword}\\b`).test(text))) {
      return item.category;
    }
  }

  return "Other";
}

function normalizeCategory(category) {
  return ({ "Mâncare": "Food", "Facturi": "Bills", "Divertisment": "Entertainment", "Altele": "Other" })[category] || category;
}

function renderExpenseOverview(expenses) {
  const reported = reportCategoriesFor(expenses);
  const categories = reported.map((category) => category.id);
  const colors = reported.map((category) => category.color);
  const totals = Object.fromEntries(categories.map((category) => [category, 0]));

  expenses.forEach((expense) => {
    const amount = Number(expense.amount);
    if (!Number.isFinite(amount) || amount <= 0) return;
    const category = normalizeCategory(expense.category);
    totals[categories.includes(category) ? category : "Other"] += amount;
  });

  const total = Object.values(totals).reduce((sum, amount) => sum + amount, 0);
  const segments = [];
  const labels = [];
  let start = 0;

  categories.forEach((category, index) => {
    const percent = total > 0 ? (totals[category] / total) * 100 : 0;
    const label = new Intl.NumberFormat(hopperLocale(), { maximumFractionDigits: 1 }).format(percent) + "%";
    document.querySelector(`#expense-legend [data-category="${category}"] .legend-percent`).textContent = label;
    segments.push(`${colors[index]} ${start}% ${start + percent}%`);
    labels.push(`${categoryLabel(category)}: ${label}`);
    start += percent;
  });

  const wheel = document.getElementById("expense-wheel");
  wheel.style.setProperty("--expense-gradient", total > 0 ? `conic-gradient(${segments.join(", ")})` : "var(--w-lilac)");
  wheel.setAttribute("aria-label", total > 0 ? hopperText("Cheltuieli pe categorii. {0}", [labels.join(", ")]) : hopperText("Nu ai cheltuieli în această lună"));
}

function showApp(user) {
  if (!window.HopperAuth?.canOpen(user)) return false;
  clearExpenseNotification();
  clearAchievementNotification();
  companionAccount = null;
  profilePhotoRequest++;
  newGoalContext = null;
  document.getElementById("savings-cancel-new-goal").hidden = true;
  saveCurrentUser(user);
  renderStudentDashboard(user);
  loadAccountForms(user);
  document.getElementById("profile-status").textContent = "";
  document.getElementById("currency-status").textContent = "";
  document.getElementById("theme-status").textContent = hopperText("Tema se salvează automat pentru contul tău.");
  document.getElementById("profile-photo-input").value = "";
  document.getElementById("profile-photo-status").textContent = "";
  showScreen("app");
  return true;
}

function loadAccountForms(user) {
  closeFeatureDialogs();
  document.querySelectorAll("form:not(#login-form)").forEach(clearFormValidation);
  const currency = currencyCode(user.currency);
  const goal = savingsGoalFor(user, currency);
  document.getElementById("monthly-budget").value = monthlyBudgetFor(user, currency) || "";
  document.getElementById("savings-name").value = goal?.name || "";
  document.getElementById("savings-target").value = goal?.target || "";
  document.getElementById("savings-saved").value = "";
  document.getElementById("savings-status").textContent = "";
  newGoalContext = null;
  document.getElementById("custom-category-name").value = "";
  document.getElementById("custom-category-status").textContent = "";
  document.getElementById("profile-name").value = user.name;
  document.getElementById("profile-email").value = user.email;
  document.getElementById("profile-university").value = user.university || "";
  document.getElementById("profile-study-year").value = user.studyYear || "";
  syncStudyYearField();
  document.getElementById("settings-currency").value = currency;
  syncCurrencyField();
}

function applyTheme(theme) {
  const selected = ["garden", "peach", "night"].includes(theme) ? theme : "garden";
  document.documentElement.dataset.theme = selected;
  document.querySelectorAll("[data-theme-choice]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.themeChoice === selected));
  });
}

document.querySelectorAll("[data-theme-choice]").forEach((button) => {
  button.addEventListener("click", () => {
    const status = document.getElementById("theme-status");
    try {
      const saved = updateCurrentUser((user) => { user.theme = button.dataset.themeChoice; });
      if (saved) status.textContent = hopperText("Tema „{0}” a fost salvată.", [button.querySelector("strong").textContent]);
    } catch {
      status.textContent = hopperText("Tema nu a putut fi salvată. Încearcă din nou.");
    }
  });
});

let companionAccount = null;
let companionEarnedIds = new Set();
let companionMessages = [];
let companionSelectedBadge = null;

function showCompanionMessage(celebrating = false) {
  const message = companionMessages.find((item) => item.id === companionSelectedBadge) || companionMessages[0];
  document.getElementById("companion-message").textContent = message?.text || "";
  document.getElementById("achievement-companion").dataset.celebrating = String(celebrating);
  document.getElementById("companion-next").hidden = companionMessages.length < 2;
}

document.getElementById("companion-next").addEventListener("click", () => {
  const index = companionMessages.findIndex((item) => item.id === companionSelectedBadge);
  companionSelectedBadge = companionMessages[(index + 1) % companionMessages.length]?.id || null;
  showCompanionMessage();
});

function renderAchievementCompanion(user, badges) {
  const earned = badges.filter((badge) => badge.earned);
  const sameAccount = companionAccount === user.email;
  const newBadges = sameAccount ? earned.filter((badge) => !companionEarnedIds.has(badge.id)) : [];
  const newlyEarned = newBadges[0];
  companionAccount = user.email;
  companionEarnedIds = new Set(earned.map((badge) => badge.id));
  const messages = {
    "first-saving": hopperText("Ai deblocat „Prima economie”! Prima sumă pusă deoparte merită sărbătorită. ✦"),
    "goal-reached": hopperText("Obiectiv atins! Ai deblocat „Primul obiectiv atins”. ★"),
    "organized-month": hopperText("Ai deblocat „O lună organizată”! Ai înregistrat veniturile și cheltuielile unei luni încheiate. ✦"),
  };
  companionMessages = earned.length ? earned.map((badge) => ({ id: badge.id, text: messages[badge.id] || hopperText("Ai deblocat „{0}”! {1} ✦", [badge.title, badge.hint]) }))
    : [{ id: "next-saving", text: hopperText("Următoarea insignă: „Prima economie”. O deblochezi când adaugi prima sumă la economii.") }];
  if (newlyEarned) companionSelectedBadge = newlyEarned.id;
  else if (!sameAccount || !companionMessages.some((item) => item.id === companionSelectedBadge)) {
    companionSelectedBadge = earned.find((badge) => badge.id === "goal-reached")?.id || companionMessages[0].id;
  }
  showCompanionMessage(Boolean(newlyEarned));
  if (newBadges.length) {
    newBadges.forEach((badge) => emitUI("achievement-unlocked", `achievement-${badge.id}`));
    showAchievementNotification(newBadges);
  }
}

function achievementDefinitions(user) {
  const goalEntries = supportedCurrencies.map((currency) => ({ currency, goal: savingsGoalFor(user, currency) })).filter((item) => item.goal);
  const goals = goalEntries.map((item) => item.goal);
  const now = new Date();
  const dayIndex = (date) => Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
  const lastDay = dayIndex(now);
  const dated = (item) => {
    if (!item || !validAmount(item.amount) || !supportedCurrencies.includes(item.currency || "RON") || typeof item.date !== "string" || !item.date) return null;
    const date = transactionDate(item);
    if (Number.isNaN(date.getTime()) || dayIndex(date) > lastDay) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(item.date) && dateInputValue(date) !== item.date) return null;
    return date;
  };
  const contributions = (Array.isArray(user.savingsContributions) ? user.savingsContributions : []).filter((item) => dated(item));
  const consecutive = (values, length) => {
    const sorted = [...new Set(values)].sort((a, b) => a - b);
    let run = 0;
    return sorted.some((value, index) => { run = index > 0 && value === sorted[index - 1] + 1 ? run + 1 : 1; return run >= length; });
  };
  let weekly = false;
  let monthly = false;
  let returned = false;
  supportedCurrencies.forEach((currency) => {
    const dates = contributions.filter((item) => (item.currency || "RON") === currency).map(dated);
    weekly ||= consecutive(dates.map((date) => Math.floor((dayIndex(date) + 3) / 7)), 2);
    monthly ||= consecutive(dates.map((date) => date.getFullYear() * 12 + date.getMonth()), 3);
    const days = [...new Set(dates.map(dayIndex))].sort((a, b) => a - b);
    returned ||= days.some((day, index) => index > 0 && day - days[index - 1] >= 30);
  });
  const months = new Map();
  const addMonth = (item, kind) => {
    const date = dated(item);
    if (!date) return;
    const currency = item.currency || "RON";
    const key = `${currency}:${date.getFullYear()}-${date.getMonth()}`;
    if (!months.has(key)) months.set(key, { income: 0, expense: 0, saving: 0, date });
    months.get(key)[kind] += Math.round(Number(item.amount) * 100);
  };
  (user.incomes || []).forEach((item) => addMonth(item, "income"));
  (user.expenses || []).forEach((item) => addMonth(item, "expense"));
  contributions.forEach((item) => addMonth(item, "saving"));
  const monthValues = [...months.values()];
  const ratio = (percent) => monthValues.some((month) => month.income > 0 && month.saving * 100 >= month.income * percent);
  const remaining = monthValues.some((month) => month.date < new Date(now.getFullYear(), now.getMonth(), 1) && month.income - month.expense - month.saving > 0);
  const progress = (percent) => goals.some((goal) => validAmount(goal.target) && Number.isFinite(Number(goal.saved)) && Number(goal.saved) * 100 >= Number(goal.target) * percent);
  const categoryIds = new Set(categoriesFor(user, true).map((item) => item.id));
  const expenses = (user.expenses || []).filter((item) => validAmount(item.amount));
  const categorized = expenses.length > 0 && expenses.every((item) => categoryIds.has(normalizeCategory(item.category)));
  const completions = new Set((Array.isArray(user.completedSavingsGoals) ? user.completedSavingsGoals : []).filter((goal) => goal?.id && supportedCurrencies.includes(goal.currency) && validAmount(goal.target) && Number(goal.saved) >= Number(goal.target)).map((goal) => goal.id));
  goalEntries.forEach(({ currency, goal }) => {
    if (validAmount(goal.target) && Number(goal.saved) >= Number(goal.target)) completions.add(user.savingsGoalIds?.[currency] || `legacy-${currency}`);
  });
  const monthKey = (item) => {
    const date = dated(item);
    return date && date < new Date(now.getFullYear(), now.getMonth(), 1)
      ? `${item.currency || "RON"}:${date.getFullYear()}-${date.getMonth()}` : null;
  };
  const incomeMonths = new Set((user.incomes || []).map(monthKey).filter(Boolean));
  const organized = (user.expenses || []).some((item) => incomeMonths.has(monthKey(item)));
  return [
    { id: "first-saving", title: hopperText("Prima economie"), earned: goals.some((goal) => Number(goal.saved) > 0) || (user.savingsContributions || []).some((item) => validAmount(item.amount)), hint: hopperText("Adaugă prima sumă la economii.") },
    { id: "goal-reached", title: hopperText("Primul obiectiv atins"), earned: goals.some((goal) => validAmount(goal.target) && Number(goal.saved) >= Number(goal.target)), hint: hopperText("Strânge suma propusă pentru un obiectiv.") },
    { id: "organized-month", title: hopperText("O lună organizată"), earned: organized, hint: hopperText("Înregistrează venituri și cheltuieli în aceeași monedă, într-o lună încheiată.") },
    { id: "goal-quarter", title: hopperText("Un sfert de vis"), earned: progress(25), hint: hopperText("Atinge 25% dintr-un obiectiv de economii.") },
    { id: "goal-half", title: hopperText("La jumătatea drumului"), earned: progress(50), hint: hopperText("Atinge 50% dintr-un obiectiv de economii.") },
    { id: "goal-three-quarters", title: hopperText("Aproape acolo"), earned: progress(75), hint: hopperText("Atinge 75% dintr-un obiectiv de economii.") },
    { id: "goal-ninety", title: hopperText("Ultima sută de metri"), earned: progress(90), hint: hopperText("Atinge 90% dintr-un obiectiv de economii.") },
    { id: "saving-three", title: hopperText("Trei pași înainte"), earned: contributions.length >= 3, hint: hopperText("Adaugă trei contribuții la economii.") },
    { id: "saving-ten", title: hopperText("Obicei în formare"), earned: contributions.length >= 10, hint: hopperText("Adaugă zece contribuții la economii.") },
    { id: "saving-days", title: hopperText("Puțin, dar constant"), earned: new Set(contributions.map((item) => dayIndex(dated(item)))).size >= 3, hint: hopperText("Economisește în trei zile diferite.") },
    { id: "saving-weeks", title: hopperText("Ritm săptămânal"), earned: weekly, hint: hopperText("Economisește în aceeași valută în două săptămâni consecutive, de luni până duminică.") },
    { id: "saving-months", title: hopperText("Lună după lună"), earned: monthly, hint: hopperText("Economisește în aceeași valută în trei luni consecutive.") },
    { id: "saving-five-percent", title: hopperText("Ceva pentru tine"), earned: ratio(5), hint: hopperText("Pune deoparte cel puțin 5% din veniturile unei luni, în aceeași valută.") },
    { id: "saving-ten-percent", title: hopperText("Viitorul primește 10%"), earned: ratio(10), hint: hopperText("Pune deoparte cel puțin 10% din veniturile unei luni, în aceeași valută.") },
    { id: "money-left", title: hopperText("Bani rămași"), earned: remaining, hint: hopperText("Încheie o lună cu bani rămași după cheltuieli și economii, în aceeași valută.") },
    { id: "categorized", title: hopperText("Fiecare lucru la locul lui"), earned: categorized, hint: hopperText("Încadrează toate cheltuielile în categorii existente.") },
    { id: "custom-category", title: hopperText("Pe stilul tău"), earned: categoriesFor(user).some((category) => category.id.startsWith("custom-")), hint: hopperText("Creează prima categorie personalizată în Profil și setări.") },
    { id: "saving-return", title: hopperText("Revenire cu spor"), earned: returned, hint: hopperText("Reia economisirea în aceeași valută după o pauză de cel puțin 30 de zile.") },
    { id: "second-goal", title: hopperText("Încă un vis împlinit"), earned: completions.size >= 2, hint: hopperText("Finalizează două obiective distincte de economii.") },
  ];
}

function rememberAchievements(user, previous = []) {
  const earned = new Set(Array.isArray(user.achievementState?.earned) ? user.achievementState.earned : []);
  previous.forEach((id) => earned.add(id));
  achievementDefinitions(user).forEach((badge) => { if (badge.earned) earned.add(badge.id); });
  if (earned.size) user.achievementState = { ...(user.achievementState || {}), earned: [...earned] };
}

function recordCompletedGoal(user, currency, goal) {
  if (!goal || !validAmount(goal.target) || Number(goal.saved) < Number(goal.target)) return;
  const id = user.savingsGoalIds?.[currency] || `goal-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  user.savingsGoalIds = { ...(user.savingsGoalIds || {}), [currency]: id };
  const completed = Array.isArray(user.completedSavingsGoals) ? user.completedSavingsGoals : [];
  if (!completed.some((item) => item.id === id)) user.completedSavingsGoals = [...completed, { ...goal, id, currency, completedAt: dateInputValue(new Date()) }];
  else user.completedSavingsGoals = completed.map((item) => item.id === id ? { ...item, ...goal, id, currency } : item);
}

const achievementSymbolPaths = {
  "first-saving": "M8 3h8l5 5v8l-5 5H8l-5-5V8Z M14 7h-4v5h4v5h-4 M12 5v14",
  "goal-reached": "M7 3h10v8l-5 4-5-4Z M7 5H3v5l4 2 M17 5h4v5l-4 2 M12 15v5 M7 21h10",
  "organized-month": "M3 5h18v16H3Z M3 9h18 M7 3v4 M17 3v4 M7 13h2 M13 13h2 M7 17h2 M13 17h4",
  "goal-quarter": "M18 3h-7L4 10v7l7 4h7l3-4h-8l-5-5V7l5-4Z",
  "goal-half": "M3 17v-5l5-5h8l5 5v5 M3 21h18 M8 17v-5h8v5",
  "goal-three-quarters": "M2 19l7-12 5 7 3-5 5 10Z M7 11h4 M15 12h4",
  "goal-ninety": "M5 21V3h14v9H5 M9 3v5h5v4 M14 3v5h5",
  "saving-three": "M3 17h6v4H3Z M9 11h6v10H9Z M15 5h6v16h-6Z",
  "saving-ten": "M12 21V9 M12 14H7L3 10V5h5l4 4 M12 9l4-5h5v5l-4 5h-5 M8 21h8",
  "saving-days": "M9 7h6l2 2v6l-2 2H9l-2-2V9Z M12 2v2 M12 20v2 M2 12h2 M20 12h2 M4 4l2 2 M18 18l2 2 M4 20l2-2 M18 6l2-2",
  "saving-weeks": "M3 4h18v17H3Z M3 8h18 M7 2v4 M17 2v4 M7 14l3 3 7-6",
  "saving-months": "M7 3h14v14 M3 7h14v14H3Z M3 11h14 M7 15h2 M11 15h2 M7 18h2",
  "saving-five-percent": "M12 20l-9-9V6l3-3h3l3 3 3-3h3l3 3v5Z",
  "saving-ten-percent": "M10 3h4l4 6v7H6V9Z M10 7h4 M12 16v5 M8 16l-3 5 M16 16l3 5 M10 11h4",
  "money-left": "M3 5h17v15H3Z M3 5V3h13v2 M14 10h7v6h-7Z M17 13h1",
  "categorized": "M3 3h7l2 3h9v14H3Z M3 10h18 M7 14h3 M7 17h8",
  "custom-category": "M3 21l3-7L17 3l4 4-11 11Z M6 14l4 4 M15 5l4 4 M3 21h5",
  "saving-return": "M8 7H3V2 M3 7l5-4h8l5 5v8l-5 5H8l-4-4 M8 12h8 M12 8l4 4-4 4",
  "second-goal": "M3 21V9h6v5h6V9h6v12Z M3 9V3h2v3h2V3h2v6 M15 9V3h2v3h2V3h2v6 M10 21v-4h4v4",
};
let achievementPage = 0;
let achievementPageAccount = null;

function updateAchievementPage() {
  const cards = [...document.getElementById("achievement-list").children];
  const lastPage = Math.max(0, Math.ceil(cards.length / 4) - 1);
  achievementPage = Math.max(0, Math.min(achievementPage, lastPage));
  cards.forEach((card, index) => { card.hidden = index < achievementPage * 4 || index >= (achievementPage + 1) * 4; });
  document.getElementById("achievements-prev").disabled = achievementPage === 0;
  document.getElementById("achievements-next").disabled = achievementPage === lastPage;
  document.getElementById("achievements-page-status").textContent = hopperText("Reușitele {0}–{1} din {2}", [achievementPage * 4 + 1, Math.min((achievementPage + 1) * 4, cards.length), cards.length]);
}

for (const [id, step] of [["achievements-prev", -1], ["achievements-next", 1]]) {
  document.getElementById(id).addEventListener("click", (event) => {
    achievementPage += step;
    updateAchievementPage();
    if (event.currentTarget.disabled) document.getElementById(step > 0 ? "achievements-prev" : "achievements-next").focus();
  });
}

function renderAchievements(user) {
  if (achievementPageAccount !== user.email) {
    achievementPage = 0;
    achievementPageAccount = user.email;
  }
  const saved = new Set(Array.isArray(user.achievementState?.earned) ? user.achievementState.earned : []);
  const badges = achievementDefinitions(user).map((badge) => ({ ...badge, earned: badge.earned || saved.has(badge.id) }));
  const list = document.getElementById("achievement-list");
  list.replaceChildren();
  badges.forEach((badge) => {
    const card = document.createElement("article");
    card.className = `achievement${badge.earned ? " earned" : ""}`;
    card.id = `achievement-${badge.id}`;
    card.dataset.badge = badge.id;
    const icon = document.createElement("span");
    icon.className = "achievement-icon";
    icon.setAttribute("aria-hidden", "true");
    const symbol = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    symbol.setAttribute("viewBox", "0 0 24 24");
    symbol.setAttribute("focusable", "false");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", achievementSymbolPaths[badge.id]);
    symbol.appendChild(path);
    icon.appendChild(symbol);
    const title = document.createElement("strong");
    title.textContent = badge.title;
    const status = document.createElement("p");
    status.textContent = badge.earned ? hopperText("Reușită deblocată ✦") : hopperText("Următorul pas");
    const hint = document.createElement("small");
    hint.textContent = badge.hint;
    card.append(icon, title, status, hint);
    list.appendChild(card);
  });
  updateAchievementPage();
  renderAchievementCompanion(user, badges);
}

let selectedChartCategory = null;
function renderCategoryChart(expenses, total) {
  const chart = document.getElementById("category-totals");
  chart.replaceChildren();
  const categories = reportCategoriesFor(expenses);
  if (!categories.some((category) => category.id === selectedChartCategory)) selectedChartCategory = null;
  categories.forEach((category) => {
    const entries = expenses.filter((expense) => {
      const id = normalizeCategory(expense.category);
      return (categories.some((item) => item.id === id) ? id : "Other") === category.id;
    });
    const amount = entries.reduce((sum, item) => sum + Number(item.amount), 0);
    const share = total > 0 ? amount / total * 100 : 0;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "student-category-row category-bar-button";
    button.dataset.category = category.id;
    button.style.setProperty("--category-color", category.color);
    button.setAttribute("aria-pressed", String(selectedChartCategory === category.id));
    button.setAttribute("aria-describedby", "category-chart-detail");
    const label = document.createElement("span");
    label.textContent = category.label;
    const value = document.createElement("strong");
    value.textContent = formatMoney(amount);
    const track = document.createElement("span");
    track.className = "category-bar-track";
    track.setAttribute("aria-hidden", "true");
    const fill = document.createElement("span");
    fill.style.width = `${share}%`;
    track.appendChild(fill);
    button.append(label, value, track);
    const detail = hopperText("{0} · {1} · {2} înregistrări · {3}% din cheltuielile lunii.", [category.label, formatMoney(amount), entries.length, Math.round(share)]);
    if (selectedChartCategory === category.id) document.getElementById("category-chart-detail").textContent = detail;
    button.addEventListener("click", () => {
      selectedChartCategory = category.id;
      chart.querySelectorAll("button").forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
      document.getElementById("category-chart-detail").textContent = detail;
    });
    chart.appendChild(button);
  });
  if (!selectedChartCategory) document.getElementById("category-chart-detail").textContent = hopperText("Alege o bară pentru a vedea suma și ponderea ei.");
}

const editor = document.getElementById("transaction-editor");
const dayDetails = document.getElementById("day-details");
let editContext = null;

function closeFeatureDialogs() {
  for (const dialog of [editor, dayDetails, categoryManager, document.getElementById("income-source-picker"), document.getElementById("expense-category-picker")]) if (dialog.open) dialog.close();
}

function makeEditButton(user, kind, index, transaction) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "edit-transaction-button";
  button.dataset.kind = kind;
  button.dataset.index = String(index);
  button.textContent = hopperText("Modifică");
  button.setAttribute("aria-label", hopperText("Modifică {0}: {1}, {2}", [kind === "expenses" ? hopperText("cheltuiala") : hopperText("venitul"), transaction.description || transaction.source, formatMoney(Number(transaction.amount))]));
  button.addEventListener("click", () => {
    if (getCurrentUser()?.email !== user.email) return;
    editContext = { email: user.email, kind, index, snapshot: JSON.stringify(transaction), original: transaction, trigger: button };
    clearFormValidation(document.getElementById("transaction-edit-form"));
    const isExpense = kind === "expenses";
    document.getElementById("transaction-editor-title").textContent = isExpense ? hopperText("Modifică cheltuiala") : hopperText("Modifică venitul");
    document.getElementById("edit-description-label").textContent = isExpense ? hopperText("Ce ai cumpărat?") : hopperText("Sursa venitului");
    document.getElementById("edit-description").value = (isExpense ? transaction.description : transaction.source) || "";
    document.getElementById("edit-amount").value = transaction.amount;
    const currency = transaction.currency || "RON";
    document.getElementById("edit-amount-label").textContent = hopperText("Sumă ({0})", [currency]);
    document.getElementById("edit-currency").textContent = hopperText("Valută: {0} · se păstrează la modificare", [currency]);
    document.getElementById("edit-category-group").hidden = !isExpense;
    document.getElementById("edit-category").disabled = !isExpense;
    const categoryChoices = categoriesFor(user);
    const existingCategory = categoriesFor(user, true).find((category) => category.id === documentCategory(transaction));
    if (existingCategory && !categoryChoices.some((category) => category.id === existingCategory.id)) categoryChoices.push(existingCategory);
    fillCategorySelect(document.getElementById("edit-category"), categoryChoices, documentCategory(transaction));
    document.getElementById("edit-date").value = dateInputValue(transactionDate(transaction));
    if (isExpense) document.getElementById("edit-date").max = dateInputValue(new Date());
    else document.getElementById("edit-date").removeAttribute("max");
    document.getElementById("edit-status").textContent = "";
    editor.showModal();
    emitUI("dialog", editor.id);
    document.getElementById("edit-description").focus();
  });
  return button;
}

document.getElementById("transaction-edit-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const context = editContext;
  const status = document.getElementById("edit-status");
  if (!context || getCurrentUser()?.email !== context.email) {
    status.textContent = hopperText("Contul s-a schimbat. Închide și deschide din nou înregistrarea.");
    return;
  }
  const description = document.getElementById("edit-description").value.trim();
  const amount = Number(document.getElementById("edit-amount").value);
  const date = document.getElementById("edit-date").value;
  const category = document.getElementById("edit-category").value;
  if (context.kind === "expenses") {
    const dateError = expenseDateValidationMessage(date);
    if (dateError) {
      showFieldValidation(document.getElementById("edit-date"), dateError);
      document.getElementById("edit-date").focus();
      return;
    }
  }
  if (!description || !validAmount(amount) || !date) return;
  try {
    const saved = updateCurrentUser((user) => {
      const original = user[context.kind]?.[context.index];
      if (JSON.stringify(original) !== context.snapshot) return false;
      // Preserve legacy currency/date/category and unknown fields unless explicitly edited.
      const changes = { amount, [context.kind === "expenses" ? "description" : "source"]: description };
      if (date !== dateInputValue(transactionDate(original))) changes.date = date;
      if (context.kind === "expenses" && category !== documentCategory(original)) changes.category = category;
      user[context.kind][context.index] = { ...original, ...changes };
    });
    if (!saved) {
      status.textContent = hopperText("Înregistrarea s-a schimbat între timp. Închide și deschide-o din nou.");
      return;
    }
    editor.close();
    showExpenseNotification(context.kind === "expenses" ? hopperText("Cheltuială modificată") : hopperText("Venit modificat"));
  } catch {
    status.textContent = hopperText("Modificările nu au putut fi salvate. Datele introduse sunt păstrate; încearcă din nou.");
  }
});

function documentCategory(transaction) {
  const category = normalizeCategory(transaction.category);
  return categoriesFor(getCurrentUser(), true).some((item) => item.id === category) ? category : "Other";
}

editor.addEventListener("close", () => {
  const context = editContext;
  editContext = null;
  const target = context && document.querySelector(`.edit-transaction-button[data-kind="${context.kind}"][data-index="${context.index}"]`);
  (target || (context?.kind === "incomes" ? document.getElementById("income-amount") : document.getElementById("report-total"))).focus();
});

function renderDayDetails() {
  const user = getCurrentUser();
  const date = dateInputValue(selectedDate);
  const futureDay = date > dateInputValue(new Date());
  document.getElementById("day-add-expense").disabled = futureDay;
  document.getElementById("day-expense-date-note").hidden = !futureDay;
  document.getElementById("day-details-title").textContent = new Intl.DateTimeFormat(hopperLocale(), { day: "numeric", month: "long", year: "numeric" }).format(selectedDate);
  const onDay = (items = []) => items.filter((item) => (item.currency || "RON") === activeCurrency && validAmount(item.amount) && dateInputValue(transactionDate(item)) === date);
  const expenses = onDay(user?.expenses);
  const incomes = onDay(user?.incomes);
  const savings = onDay(user?.savingsContributions);
  const sum = (items) => items.reduce((total, item) => total + Number(item.amount), 0);
  const summary = document.getElementById("day-details-summary");
  summary.replaceChildren();
  for (const [label, value] of [[hopperText("Venituri"), sum(incomes)], [hopperText("Cheltuieli"), sum(expenses)], [hopperText("Puși deoparte"), sum(savings)], [hopperText("Diferența zilei"), sum(incomes) - sum(expenses) - sum(savings)]]) {
    const item = document.createElement("div");
    const title = document.createElement("span"); title.textContent = label;
    const amount = document.createElement("strong"); amount.textContent = formatMoney(value);
    item.append(title, amount); summary.appendChild(item);
  }
  const list = document.getElementById("day-details-list");
  list.replaceChildren();
  for (const [entries, kind] of [[incomes, "income"], [expenses, "expense"], [savings, "saving"]]) {
    entries.forEach((entry) => {
      const row = document.createElement("li");
      const label = document.createElement("span");
      label.textContent = kind === "income" ? entry.source : kind === "expense" ? entry.description : hopperText("Adăugat la economii");
      const amount = document.createElement("strong");
      amount.textContent = `${kind === "income" ? "+" : "−"}${formatMoney(Number(entry.amount))}`;
      row.append(label, amount); list.appendChild(row);
    });
  }
  if (!list.childElementCount) {
    const empty = document.createElement("li"); empty.textContent = hopperText("Nicio înregistrare în {0} pentru această zi.", [activeCurrency]); list.appendChild(empty);
  }
}

dayDetails.addEventListener("close", () => {
  document.querySelector(`.calendar-day[data-date="${dateInputValue(selectedDate)}"]`)?.focus();
});
document.getElementById("day-add-expense").addEventListener("click", () => {
  if (expenseDateValidationMessage(dateInputValue(selectedDate))) return;
  dayDetails.close();
  setActiveView("home");
  document.getElementById("description").focus();
});
document.querySelectorAll("[data-close-dialog]").forEach((button) => {
  button.addEventListener("click", () => document.getElementById(button.dataset.closeDialog).close());
});
for (const dialog of [editor, dayDetails]) {
  dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
}

function renderStudentDashboard(user) {
  applyTheme(user.theme);
  activeCurrency = currencyCode(user.currency);
  syncCategoryOptions(user);
  userNameElement.textContent = user.name;
  document.getElementById("profile-display-name").textContent = user.name;
  document.getElementById("profile-display-email").textContent = user.email;
  renderProfilePhoto(user);
  document.getElementById("active-currency-label").textContent = hopperText("Valută: {0}", [activeCurrency]);
  document.querySelectorAll("[data-money-label]").forEach((label) => {
    label.textContent = `${hopperText(label.dataset.moneyLabel)} (${activeCurrency})`;
  });
  const expenses = monthTransactions(user.expenses);
  const incomes = monthTransactions(user.incomes);
  const savingsContributions = monthTransactions(user.savingsContributions);
  const spent = expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
  const savedThisMonth = savingsContributions.reduce((sum, item) => sum + Number(item.amount), 0);
  const grossIncome = incomes.reduce((sum, item) => sum + Number(item.amount), 0);
  const income = Math.round((grossIncome - savedThisMonth) * 100) / 100;
  const budgetValue = monthlyBudgetFor(user);
  const budget = validAmount(budgetValue) ? Number(budgetValue) : 0;
  renderExpenseOverview(expenses);
  document.getElementById("monthly-income").textContent = formatMoney(income);
  document.getElementById("monthly-expenses").textContent = formatMoney(spent);
  document.getElementById("monthly-balance").textContent = formatMoney(income - spent);
  document.getElementById("budget-remaining").textContent = budget ? formatMoney(budget - spent) : hopperText("Nesetat");
  document.getElementById("budget-status").textContent = !budget ? hopperText("Setează un buget pentru a urmări cât mai poți cheltui.") : spent > budget ? hopperText("Ai depășit bugetul cu {0}.", [formatMoney(spent - budget)]) : hopperText("Mai ai {0} din bugetul acestei luni.", [formatMoney(budget - spent)]);
  const month = new Intl.DateTimeFormat(hopperLocale(), { month: "long", year: "numeric" }).format(currentMonth);
  document.getElementById("summary-title").textContent = hopperText("Bugetul tău · {0}", [month]);
  document.querySelector(".report-header .student-note").textContent = hopperText("Tranzacțiile din {0}", [month]);
  const incomeList = document.getElementById("income-list");
  incomeList.replaceChildren();
  incomes.forEach((item) => {
    const row = document.createElement("li");
    const source = document.createElement("span");
    source.textContent = item.source;
    const amount = document.createElement("strong");
    amount.textContent = formatMoney(Number(item.amount));
    const edit = makeEditButton(user, "incomes", user.incomes.indexOf(item), item);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "delete-income-button";
    remove.textContent = hopperText("Șterge");
    remove.setAttribute("aria-label", hopperText("Șterge venitul: {0}, {1}", [item.source, formatMoney(Number(item.amount))]));
    const incomeIndex = user.incomes.indexOf(item);
    const incomeSnapshot = JSON.stringify(item);
    remove.addEventListener("click", () => {
      if (getCurrentUser()?.email !== user.email) return;
      const buttonIndex = Array.from(incomeList.querySelectorAll(".delete-income-button")).indexOf(remove);
      try {
        const saved = updateCurrentUser((current) => {
          if (JSON.stringify(current.incomes?.[incomeIndex]) !== incomeSnapshot) return false;
          current.incomes.splice(incomeIndex, 1);
        });
        if (!saved) return;
        showExpenseNotification(hopperText("Venit șters"));
        const remaining = incomeList.querySelectorAll(".delete-income-button");
        (remaining[Math.min(buttonIndex, remaining.length - 1)] || document.getElementById("income-amount")).focus();
      } catch {
        showExpenseNotification(hopperText("Venitul nu a putut fi șters. Încearcă din nou."), true);
        remove.focus();
      }
    });
    const actions = document.createElement("div");
    actions.className = "income-row-actions";
    actions.append(amount, edit, remove);
    row.append(source, actions);
    incomeList.appendChild(row);
  });
  if (savingsContributions.length) {
    const row = document.createElement("li");
    const label = document.createElement("span");
    label.textContent = hopperText("Puși deoparte pentru economii");
    const amount = document.createElement("strong");
    amount.textContent = `−${formatMoney(savedThisMonth)}`;
    row.append(label, amount);
    incomeList.appendChild(row);
  }
  if (!incomes.length && !savingsContributions.length) {
    const empty = document.createElement("li");
    empty.textContent = hopperText("Adaugă bursa, sprijinul de la familie sau venitul din job.");
    incomeList.appendChild(empty);
  }
  renderCategoryChart(expenses, spent);
  document.getElementById("report-total").textContent = formatMoney(spent);
  const reportList = document.getElementById("report-list");
  reportList.replaceChildren();
  expenses.slice().sort((a, b) => String(b.date || "").localeCompare(String(a.date || ""))).forEach((expense) => {
    const row = document.createElement("div");
    row.className = "report-item student-report-row";
    const info = document.createElement("div");
    info.className = "expense-entry-info";
    const title = document.createElement("strong");
    title.textContent = expense.description;
    const detail = document.createElement("small");
    detail.textContent = categoryLabel(expense.category) + (expense.date ? ` · ${new Intl.DateTimeFormat(hopperLocale()).format(transactionDate(expense))}` : "");
    info.append(title, detail);
    const amount = document.createElement("span");
    amount.className = "negative";
    amount.textContent = `−${formatMoney(Number(expense.amount))}`;
    const actions = document.createElement("div");
    actions.className = "expense-row-actions";
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "delete-expense-button";
    deleteButton.textContent = hopperText("Șterge");
    deleteButton.setAttribute("aria-label", hopperText("Șterge cheltuiala: {0}, {1}{2}", [expense.description, formatMoney(Number(expense.amount)), expense.date ? `, ${new Intl.DateTimeFormat(hopperLocale()).format(transactionDate(expense))}` : ""]));
    const expenseIndex = user.expenses.indexOf(expense);
    const expenseSnapshot = JSON.stringify(expense);
    deleteButton.addEventListener("click", () => {
      if (getCurrentUser()?.email !== user.email) return;
      const buttonIndex = Array.from(reportList.querySelectorAll(".delete-expense-button")).indexOf(deleteButton);
      let deleted = false;
      try {
        const savedUser = updateCurrentUser((savedUser) => {
          // Use the original array index so identical legacy entries are deleted individually.
          if (JSON.stringify(savedUser.expenses?.[expenseIndex]) !== expenseSnapshot) return;
          savedUser.expenses.splice(expenseIndex, 1);
          deleted = true;
        });
        if (!savedUser || !deleted) return;
        showExpenseNotification(hopperText("Cheltuială ștearsă"));
        const remainingButtons = reportList.querySelectorAll(".delete-expense-button");
        const focusTarget = remainingButtons[Math.min(buttonIndex, remainingButtons.length - 1)] || document.getElementById("report-total");
        focusTarget.focus();
      } catch (error) {
        showExpenseNotification(hopperText("Cheltuiala nu a putut fi ștearsă. Încearcă din nou."), true);
      }
    });
    actions.append(amount, makeEditButton(user, "expenses", expenseIndex, expense), deleteButton);
    row.append(info, actions);
    reportList.appendChild(row);
  });
  if (!expenses.length) reportList.textContent = hopperText("Încă nu ai cheltuieli în această lună.");
  const goal = savingsGoalFor(user);
  const progress = goal?.target > 0 ? Math.min(100, (goal.saved / goal.target) * 100) : 0;
  document.getElementById("savings-title").textContent = goal?.name || hopperText("Setează primul tău obiectiv");
  document.getElementById("savings-progress-text").textContent = goal ? hopperText("Ai strâns {0} din {1} · {2}%", [formatMoney(goal.saved), formatMoney(goal.target), Math.round(progress)]) : hopperText("Progresul tău va apărea aici.");
  const startingGoal = newGoalContext?.email === user.email && newGoalContext.currency === activeCurrency;
  document.getElementById("savings-saved").disabled = !goal || startingGoal;
  document.getElementById("savings-add-button").disabled = !goal || startingGoal;
  document.getElementById("savings-new-goal").hidden = !goal || !validAmount(goal.target) || Number(goal.saved) < Number(goal.target) || startingGoal;
  document.getElementById("savings-cancel-new-goal").hidden = !startingGoal;
  document.getElementById("savings-progress-fill").style.width = `${progress}%`;
  document.getElementById("savings-progress").setAttribute("aria-valuenow", String(Math.round(progress)));
  renderAchievements(user);
  renderCalendar(user);
  if (document.getElementById("day-details").open) renderDayDetails();
  emitUI("render");
}

function renderCalendar(user = getCurrentUser()) {
  syncDateFields();
  activeCurrency = currencyCode(user?.currency);
  const calendarMonthLabel = document.getElementById("calendar-month-label");
  const calendarDates = document.getElementById("calendar-dates");

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDayIndex = (firstDay.getDay() + 6) % 7;
  const daysInMonth = lastDay.getDate();
  const prevMonthLastDay = new Date(year, month, 0).getDate();
  const budget = monthlyBudgetFor(user);
  const hasBudget = validAmount(budget);
  const dailyLimitCents = hasBudget ? Math.round((Number(budget) / daysInMonth) * 100) : 5000;
  const lowLimitCents = Math.floor(dailyLimitCents / 2);
  const dailyTotals = new Map();
  monthTransactions(user?.expenses).forEach((expense) => {
    if (!expense.date) return;
    const key = dateInputValue(transactionDate(expense));
    dailyTotals.set(key, (dailyTotals.get(key) || 0) + Math.round(Number(expense.amount) * 100));
  });
  const spendingLevel = (cents) => cents <= lowLimitCents ? "low" : cents <= dailyLimitCents ? "normal" : "high";
  const spendingLabels = { low: "Cheltuieli reduse", normal: "Cheltuieli moderate", high: "Cheltuieli ridicate" };
  const formatDay = (date) => new Intl.DateTimeFormat(hopperLocale(), { day: "numeric", month: "long", year: "numeric" }).format(date);

  const monthTitle = new Intl.DateTimeFormat(hopperLocale(), {
    month: "long",
    year: "numeric",
  }).format(currentMonth);
  const monthName = document.createElement("span");
  monthName.className = "calendar-month-name";
  monthName.textContent = new Intl.DateTimeFormat(hopperLocale(), { month: "long" }).format(currentMonth);
  const monthYear = document.createElement("span");
  monthYear.className = "calendar-month-year";
  monthYear.textContent = String(year);
  calendarMonthLabel.replaceChildren(monthName, document.createTextNode(" "), monthYear);
  calendarMonthLabel.setAttribute("aria-label", monthTitle);
  document.getElementById("expense-wheel-month").textContent = new Intl.DateTimeFormat(hopperLocale(), {
    month: "long",
  }).format(currentMonth);

  calendarDates.innerHTML = "";

  for (let i = 0; i < startDayIndex; i++) {
    const day = document.createElement("span");
    day.classList.add("muted");
    day.textContent = prevMonthLastDay - startDayIndex + i + 1;
    calendarDates.appendChild(day);
  }

  for (let dayNumber = 1; dayNumber <= daysInMonth; dayNumber++) {
    const day = document.createElement("button");
    day.type = "button";
    day.classList.add("calendar-day");
    day.textContent = dayNumber;

    const date = new Date(year, month, dayNumber);
    const isToday = date.toDateString() === new Date().toDateString();
    const isSelected = date.toDateString() === selectedDate.toDateString();
    const key = dateInputValue(date);
    const spentCents = dailyTotals.get(key) || 0;
    const hasExpenses = dailyTotals.has(key);
    const status = hasExpenses ? hopperText(spendingLabels[spendingLevel(spentCents)]) : hopperText("Fără cheltuieli");
    day.dataset.date = key;
    if (hasExpenses) day.classList.add(`spending-${spendingLevel(spentCents)}`);
    day.title = `${formatDay(date)}: ${formatMoney(spentCents / 100)} · ${status}`;
    day.setAttribute("aria-label", day.title);
    day.setAttribute("aria-pressed", String(isSelected));
    day.setAttribute("aria-haspopup", "dialog");
    day.setAttribute("aria-controls", "day-details");

    if (isToday) {
      day.classList.add("today");
      day.setAttribute("aria-current", "date");
    }
    if (isSelected) day.classList.add("selected");

    day.addEventListener("click", () => {
      selectedDate = new Date(year, month, dayNumber);
      setSelectedExpenseDate();
      renderCalendar();
      renderDayDetails();
      document.getElementById("day-details").showModal();
      emitUI("dialog", "day-details");
    });

    calendarDates.appendChild(day);
  }

  const totalCells = startDayIndex + daysInMonth;
  const nextMonthDays = (7 - (totalCells % 7)) % 7;

  for (let i = 1; i <= nextMonthDays; i++) {
    const day = document.createElement("span");
    day.classList.add("muted");
    day.textContent = i;
    calendarDates.appendChild(day);
  }
}

authSwitches.forEach((button) => {
  button.addEventListener("click", () => {
    setActiveTab(button.dataset.target);
  });
});

function setActiveView(targetView) {
  const changed = !Array.from(pageViews).some((page) => page.dataset.view === targetView && page.classList.contains("active"));
  viewTabs.forEach((tab) => {
    const selected = tab.dataset.view === targetView;
    tab.classList.toggle("active", selected);
    tab.setAttribute("aria-pressed", String(selected));
    if (selected) tab.setAttribute("aria-current", "page"); else tab.removeAttribute("aria-current");
  });
  pageViews.forEach((page) => page.classList.toggle("active", page.dataset.view === targetView));
  if (changed) emitUI("view", targetView);
}

viewTabs.forEach((button) => {
  button.addEventListener("click", () => setActiveView(button.dataset.view));
});

document.getElementById("brand-bunny-button").addEventListener("click", () => {
  setActiveView("home");
});

document.getElementById("header-profile-button").addEventListener("click", () => {
  setActiveView("settings");
});

registerForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const status = document.getElementById("register-status");
  const name = document.getElementById("register-name").value.trim();
  const email = document.getElementById("register-email").value.trim();
  const password = document.getElementById("register-password").value;
  if (!window.HopperAuth) {
    status.textContent = hopperText("Conectarea securizată nu este disponibilă momentan.");
    status.hidden = false;
    return;
  }
  if (password.length < 8) {
    status.textContent = hopperText("Alege o parolă de cel puțin 8 caractere.");
    status.hidden = false;
    document.getElementById("register-password").focus();
    return;
  }
  void window.HopperAuth.register({ name, email, password });
});

function clearLoginMessage() {
  loginStatus.textContent = "";
  loginStatus.hidden = true;
  delete loginStatus.dataset.kind;
  loginForm.querySelectorAll("input").forEach((input) => input.removeAttribute("aria-invalid"));
}

function showLoginError(message, fieldIds) {
  loginStatus.dataset.kind = "error";
  loginStatus.setAttribute("role", "alert");
  loginStatus.textContent = message;
  loginStatus.hidden = false;
  fieldIds.forEach((id) => document.getElementById(id).setAttribute("aria-invalid", "true"));
  document.getElementById(fieldIds[0]).focus();
}

loginForm.addEventListener("input", clearLoginMessage);
loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  clearLoginMessage();

  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;

  if (!email || !password) {
    showLoginError(hopperText("Completează emailul și parola pentru a te conecta."), [!email ? "login-email" : "login-password"]);
    return;
  }
  if (!document.getElementById("login-email").validity.valid) {
    showLoginError(hopperText("Introdu o adresă de email validă."), ["login-email"]);
    return;
  }
  if (!window.HopperAuth) {
    showLoginError(hopperText("Conectarea securizată nu este disponibilă momentan."), ["login-email"]);
    return;
  }
  void window.HopperAuth.signIn({ email, password });
});

expenseForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const user = getCurrentUser();
  if (!user) return;

  const description = document.getElementById("description").value.trim();
  const amount = Number(document.getElementById("amount").value);
  let category = document.getElementById("category").value;
  const date = document.getElementById("expense-date").value;
  const dateError = expenseDateValidationMessage(date);
  showFieldValidation(document.getElementById("expense-date-button"), dateError);
  if (dateError) {
    document.getElementById("expense-date-button").focus();
    return;
  }

  if (!description || !validAmount(amount) || !date) {
    alert(hopperText("Completează descrierea, o sumă pozitivă și data."));
    return;
  }

  if (!category || category === "auto") {
    category = detectCategory(description);
    if (!categoriesFor().some((item) => item.id === category) && categoriesFor().some((item) => item.id === "Other")) category = "Other";
  }
  if (!categoriesFor().some((item) => item.id === category)) {
    showFieldValidation(document.getElementById("category"), hopperText("Alege o categorie disponibilă sau restabilește categoriile."));
    (document.getElementById("category").hidden ? document.getElementById("expense-category-button") : document.getElementById("category")).focus();
    return;
  }

  const newExpense = {
    description,
    amount,
    category,
    date,
    currency: activeCurrency,
  };

  const savedUser = updateCurrentUser((savedUser) => {
    savedUser.expenses = [...(savedUser.expenses || []), newExpense];
  });
  if (!savedUser) return;

  expenseForm.reset();
  document.getElementById("category").value = "auto";
  syncExpenseCategoryField();
  setSelectedExpenseDate();
  syncDateFields();
  showExpenseNotification();
  emitUI("expense-added", "expense-notification");
});

document.getElementById("income-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const source = document.getElementById("income-source").value;
  const amount = Number(document.getElementById("income-amount").value);
  const date = document.getElementById("income-date").value;
  if (!validAmount(amount) || !date) return;
  updateCurrentUser((user) => {
    user.incomes = [...(user.incomes || []), { source, amount, date, currency: activeCurrency }];
  });
  event.target.reset();
  syncIncomeSourceField();
  document.getElementById("income-date").value = dateInputValue(selectedDate);
  syncDateFields();
});

document.getElementById("budget-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const budget = Number(document.getElementById("monthly-budget").value);
  if (!validAmount(budget)) return;
  updateCurrentUser((user) => {
    user.monthlyBudgets = { ...(user.monthlyBudgets || {}), [activeCurrency]: budget };
    if (activeCurrency === "RON") user.monthlyBudget = budget;
  });
});

let newGoalContext = null;
document.getElementById("savings-cancel-new-goal").addEventListener("click", () => {
  const user = getCurrentUser();
  if (!user) return;
  newGoalContext = null;
  const goal = savingsGoalFor(user);
  document.getElementById("savings-name").value = goal?.name || "";
  document.getElementById("savings-target").value = goal?.target || "";
  document.getElementById("savings-status").textContent = "";
  clearFormValidation(document.getElementById("savings-form"));
  renderStudentDashboard(user);
  document.getElementById("savings-new-goal").focus();
});
document.getElementById("savings-new-goal").addEventListener("click", () => {
  const user = getCurrentUser();
  const goal = savingsGoalFor(user);
  if (!user || !goal || !validAmount(goal.target) || Number(goal.saved) < Number(goal.target)) return;
  newGoalContext = { email: user.email, currency: activeCurrency, snapshot: JSON.stringify(goal) };
  document.getElementById("savings-name").value = "";
  document.getElementById("savings-target").value = "";
  clearFormValidation(document.getElementById("savings-form"));
  document.getElementById("savings-status").textContent = hopperText("Introdu un obiectiv nou. Cel finalizat și banii puși deoparte rămân în istoric.");
  renderStudentDashboard(user);
  document.getElementById("savings-name").focus();
});

document.getElementById("savings-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const name = document.getElementById("savings-name").value.trim();
  const target = Number(document.getElementById("savings-target").value);
  const status = document.getElementById("savings-status");
  if (!name || !validAmount(target)) {
    status.textContent = hopperText("Introdu numele obiectivului și o țintă mai mare decât zero.");
    return;
  }
  try {
    const savedUser = updateCurrentUser((user) => {
      const existing = savingsGoalFor(user);
      if (newGoalContext && (newGoalContext.email !== user.email || newGoalContext.currency !== activeCurrency || newGoalContext.snapshot !== JSON.stringify(existing))) return false;
      if (newGoalContext) recordCompletedGoal(user, activeCurrency, existing);
      const goal = newGoalContext ? { name, target, saved: 0 } : { ...existing, name, target };
      goal.saved = Number(goal.saved) || 0;
      if (newGoalContext || !existing) user.savingsGoalIds = { ...(user.savingsGoalIds || {}), [activeCurrency]: `goal-${Date.now()}-${Math.random().toString(36).slice(2)}` };
      user.savingsGoals = { ...(user.savingsGoals || {}), [activeCurrency]: goal };
      if (activeCurrency === "RON") user.savingsGoal = goal;
      recordCompletedGoal(user, activeCurrency, goal);
    });
    if (savedUser) {
      newGoalContext = null;
      document.getElementById("savings-cancel-new-goal").hidden = true;
      document.getElementById("savings-saved").disabled = false;
      document.getElementById("savings-add-button").disabled = false;
      const savedGoal = savingsGoalFor(savedUser);
      document.getElementById("savings-new-goal").hidden = Number(savedGoal.saved) < Number(savedGoal.target);
      status.textContent = hopperText("Obiectivul a fost salvat. Adaugă suma pe care vrei să o economisești.");
    } else status.textContent = hopperText("Obiectivul s-a schimbat. Redeschide economiile înainte de a salva.");
  } catch {
    status.textContent = hopperText("Obiectivul nu a putut fi salvat. Încearcă din nou.");
  }
});

document.getElementById("savings-contribution-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const input = document.getElementById("savings-saved");
  const status = document.getElementById("savings-status");
  const amount = Number(input.value);
  const goal = savingsGoalFor(getCurrentUser());
  if (newGoalContext) {
    status.textContent = hopperText("Salvează mai întâi noul obiectiv.");
    return;
  }
  if (!goal) {
    status.textContent = hopperText("Salvează mai întâi un obiectiv pentru economii.");
    return;
  }
  if (!validAmount(amount) || !input.validity.valid) {
    status.textContent = hopperText("Introdu o sumă mai mare decât zero, cu maximum două zecimale.");
    return;
  }
  let reachedGoal = false;
  try {
    const savedUser = updateCurrentUser((user) => {
      const existingGoal = savingsGoalFor(user);
      const saved = Math.round((Number(existingGoal.saved) + amount) * 100) / 100;
      if (!Number.isFinite(saved)) throw new Error("invalid savings total");
      const updatedGoal = { ...existingGoal, saved };
      reachedGoal = Number(existingGoal.saved) < existingGoal.target && saved >= existingGoal.target;
      user.savingsGoals = { ...(user.savingsGoals || {}), [activeCurrency]: updatedGoal };
      if (activeCurrency === "RON") user.savingsGoal = updatedGoal;
      recordCompletedGoal(user, activeCurrency, updatedGoal);
      user.savingsContributions = [...(user.savingsContributions || []), {
        amount,
        currency: activeCurrency,
        date: dateInputValue(new Date()),
      }];
    });
    if (savedUser) {
      input.value = "";
      status.textContent = hopperText("Ai adăugat {0} la economii.", [formatMoney(amount)]);
      emitUI(reachedGoal ? "savings-reached" : "savings-contribution", "savings-progress");
    }
  } catch {
    status.textContent = hopperText("Suma nu a putut fi salvată. Încearcă din nou.");
  }
});

document.getElementById("custom-category-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const input = document.getElementById("custom-category-name");
  const label = input.value.trim().slice(0, 40);
  const status = document.getElementById("custom-category-status");
  if (!label) return;
  if (categoriesFor().some((item) => item.label.toLocaleLowerCase("ro-RO") === label.toLocaleLowerCase("ro-RO"))) {
    status.textContent = hopperText("Există deja o categorie cu acest nume.");
    return;
  }
  try {
    const saved = updateCurrentUser((user) => {
      const hidden = categoriesFor(user, true).find((item) => item.label.toLocaleLowerCase("ro-RO") === label.toLocaleLowerCase("ro-RO"));
      if (hidden) {
        user.hiddenCategories = { ...(user.hiddenCategories || {}) };
        delete user.hiddenCategories[hidden.id];
      } else user.customCategories = [...(Array.isArray(user.customCategories) ? user.customCategories : []), { id: `custom-${Date.now()}-${Math.random().toString(36).slice(2)}`, label }];
    });
    if (saved) { input.value = ""; status.textContent = hopperText("Categoria a fost adăugată. O poți alege la cheltuieli."); }
  } catch {
    status.textContent = hopperText("Categoria nu a putut fi salvată. Încearcă din nou.");
  }
});

document.getElementById("profile-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const name = document.getElementById("profile-name").value.trim().slice(0, 80);
  const university = document.getElementById("profile-university").value.trim().slice(0, 120);
  const studyYear = document.getElementById("profile-study-year").value;
  if (!name) {
    document.getElementById("profile-status").textContent = hopperText("Introdu numele tău înainte de salvare.");
    return;
  }
  const user = updateCurrentUser((user) => { Object.assign(user, { name, university, studyYear }); });
  if (user) {
    document.getElementById("profile-name").value = user.name;
    syncStudyYearField();
    document.getElementById("profile-status").textContent = hopperText("Profilul tău a fost salvat.");
    emitUI("profile-saved", "header-profile-button");
  }
});

document.getElementById("choose-profile-photo").addEventListener("click", () => {
  document.getElementById("profile-photo-input").click();
});

document.getElementById("profile-photo-input").addEventListener("change", async (event) => {
  const input = event.target;
  const file = input.files?.[0];
  const account = getCurrentUser();
  const request = ++profilePhotoRequest;
  const status = document.getElementById("profile-photo-status");
  if (!file || !account) return;
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
    status.textContent = hopperText("Alege o imagine JPG, PNG sau WebP de maximum 5 MB.");
    input.value = "";
    return;
  }
  status.textContent = hopperText("Se pregătește poza…");
  try {
    const photo = await prepareProfilePhoto(file);
    if (request !== profilePhotoRequest || getCurrentUser()?.email !== account.email) return;
    const user = updateCurrentUser((user) => { user.profilePhoto = photo; });
    status.textContent = user ? hopperText("Poza de profil a fost salvată.") : hopperText("Autentifică-te pentru a salva poza.");
    if (user) emitUI("profile-saved", "header-profile-button");
  } catch (error) {
    if (request !== profilePhotoRequest || getCurrentUser()?.email !== account.email) return;
    if (error?.name === "AbortError") { status.textContent = hopperText("Decuparea a fost anulată."); return; }
    status.textContent = error?.name === "QuotaExceededError" ? hopperText("Nu mai este suficient spațiu în browser pentru a salva poza. Poza anterioară a fost păstrată.") : hopperText("Poza nu a putut fi încărcată. Încearcă o altă imagine.");
  } finally {
    if (request === profilePhotoRequest) input.value = "";
  }
});

document.getElementById("remove-profile-photo").addEventListener("click", () => {
  profilePhotoRequest++;
  const user = updateCurrentUser((user) => { delete user.profilePhoto; });
  document.getElementById("profile-photo-input").value = "";
  if (user) document.getElementById("profile-photo-status").textContent = hopperText("Poza a fost eliminată. Se afișează inițiala numelui tău.");
});

document.getElementById("currency-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const currency = document.getElementById("settings-currency").value;
  if (!supportedCurrencies.includes(currency)) return;
  const user = updateCurrentUser((user) => { user.currency = currency; });
  if (user) {
    loadAccountForms(user);
    document.getElementById("currency-status").textContent = hopperText("Valuta {0} a fost salvată. Vezi doar sumele în această monedă; celelalte rămân păstrate.", [currency]);
  }
});

logoutButton.addEventListener("click", () => {
  document.dispatchEvent(new CustomEvent("hopper:logout"));
  clearExpenseNotification();
  profilePhotoRequest++;
  localStorage.removeItem(CURRENT_USER_KEY);
  window.HopperPersistence?.schedule();
  showScreen("auth");
  loginForm.reset();
  clearLoginMessage();
  registerForm.reset();
});

const calendarMonthLabel = document.getElementById("calendar-month-label");
const calendarDates = document.getElementById("calendar-dates");
const prevMonthButton = document.getElementById("prev-month");
const nextMonthButton = document.getElementById("next-month");

const today = new Date();
let currentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
let selectedDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());

prevMonthButton.addEventListener("click", () => {
  currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);
  selectedDate = new Date(currentMonth);
  setSelectedExpenseDate();
  document.getElementById("income-date").value = dateInputValue(selectedDate);
  renderCalendar();
  const user = getCurrentUser();
  if (user) renderStudentDashboard(user);
});

nextMonthButton.addEventListener("click", () => {
  currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
  selectedDate = new Date(currentMonth);
  setSelectedExpenseDate();
  document.getElementById("income-date").value = dateInputValue(selectedDate);
  renderCalendar();
  const user = getCurrentUser();
  if (user) renderStudentDashboard(user);
});

document.getElementById("expense-date").value = dateInputValue(today);
document.getElementById("income-date").value = dateInputValue(today);
renderCalendar();


// A small bridge keeps online transport separate from the local financial model.
window.HopperApp = {
  currentUser: getCurrentUser,
  users: getUsers,
  openUser: showApp,
  lock() { showScreen("auth"); },
  async acceptAuthenticated(user) {
    if (!window.HopperAuth?.canAccept(user)) throw Error("mfa-required");
    const previousUsers = localStorage.getItem(USERS_KEY);
    const previousCurrent = localStorage.getItem(CURRENT_USER_KEY);
    const users = getUsers();
    const index = users.findIndex(value => value.email.toLowerCase() === user.email.toLowerCase());
    if (index < 0) users.push(user); else users[index] = user;
    try {
      saveUsers(users); saveCurrentUser(user);
      if (window.HopperPersistence) await window.HopperPersistence.flush();
    } catch (error) {
      for (const [key, value] of [[USERS_KEY, previousUsers], [CURRENT_USER_KEY, previousCurrent]]) {
        if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value);
      }
      window.HopperPersistence?.schedule();
      throw error;
    }
  },
  applyCloud(user) {
    if (!window.HopperAuth?.canOpen(user)) throw Error("mfa-required");
    const users = getUsers();
    const index = users.findIndex(item => item.email.toLowerCase() === user.email.toLowerCase());
    const previous = localStorage.getItem(USERS_KEY);
    if (index < 0) users.push(user); else users[index] = user;
    try { saveUsers(users); saveCurrentUser(user); }
    catch (error) { if (previous === null) localStorage.removeItem(USERS_KEY); else localStorage.setItem(USERS_KEY, previous); throw error; }
    // Do not reset unsaved forms or close a dialog when a remote update arrives.
    renderStudentDashboard(user);
  },
  dispose() { document.removeEventListener("hopper:language", onLanguageChanged); },
};
function onLanguageChanged() {
  const user = getCurrentUser();
  if (user) renderStudentDashboard(user);
  renderCalendar();
  syncDateFields(); syncStudyYearField(); syncCurrencyField(); syncIncomeSourceField();
  if (datePicker.open && datePickerTrigger) renderDatePicker();
  document.querySelectorAll("[aria-invalid=true][required]").forEach(field => showFieldValidation(field, fieldValidationMessage(field)));
}
document.addEventListener("hopper:language", onLanguageChanged);

void window.HopperAuth?.resume();
