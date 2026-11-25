const $ = (sel, root = document) => root.querySelector(sel);
const WEEKDAYS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const AIRPORTS = {
  MPL: "Montpellier", MRS: "Marsella", FNI: "Nîmes", BZR: "Béziers", TLN: "Toulon", AVN: "Aviñón",
  CCF: "Carcassonne", PGF: "Perpiñán", NCE: "Niza", TLS: "Toulouse",
};
const DEST_HINTS = {
  europe: {
    placeholder: "LIS, OPO, RAK… (vacío = cualquier destino)",
    hint: "Códigos IATA separados por comas. Déjalo vacío para que te avise de cualquier destino barato.",
  },
  longhaul: {
    placeholder: "BUE",
    hint: "Argentina: BUE (todos los aeropuertos de Buenos Aires), COR Córdoba, MDZ Mendoza. Consejo: añade BCN, MAD o PAR como salida, desde allí hay muchos más vuelos.",
  },
};
const TOKEN_KEY = "fd-admin-token";

const state = { token: "", modes: {}, origins: [], watches: [], editingId: null };

// ───────────────────────── utilidades ─────────────────────────

function store(op, value) {
  try {
    if (op === "get") return localStorage.getItem(TOKEN_KEY) ?? "";
    if (op === "set") localStorage.setItem(TOKEN_KEY, value);
    if (op === "del") localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Sin almacenamiento: la contraseña no se recuerda entre visitas.
  }
  return "";
}

function fmtDay(isoOrDate) {
  const d = isoOrDate.slice(0, 10);
  const wd = WEEKDAYS[new Date(`${d}T12:00:00Z`).getUTCDay()];
  return `${wd} ${d.slice(8, 10)}/${d.slice(5, 7)}`;
}
const fmtDate = (iso) => `${fmtDay(iso)} · ${iso.slice(11, 16)}`;
const stopsText = (n) => (n === 0 ? "directo" : `${n} escala${n > 1 ? "s" : ""}`);
const safeHref = (url) => (typeof url === "string" && url.startsWith("https://") ? url : "");

function googleFlights(o, d, dep, ret) {
  const q = `Flights from ${o} to ${d} on ${dep.slice(0, 10)} through ${ret.slice(0, 10)}`;
  return `https://www.google.com/travel/flights?q=${encodeURIComponent(q)}&curr=EUR&hl=es`;
}

function timeAgo(iso) {
  if (!iso) return "todavía sin comprobar";
  const min = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (min < 1) return "comprobada ahora mismo";
  if (min < 60) return `comprobada hace ${min} min`;
  const h = Math.round(min / 60);
  return h < 48 ? `comprobada hace ${h} h` : `comprobada hace ${Math.round(h / 24)} días`;
}

function option(value, label) {
  const o = document.createElement("option");
  o.value = value;
  o.textContent = label;
  return o;
}

async function api(path, { method = "GET", body, auth = false } = {}) {
  const headers = {};
  if (auth) headers.Authorization = `Bearer ${state.token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

// ───────────────────────── pestañas ─────────────────────────

function showTab(name) {
  for (const t of ["watches", "radar"]) {
    const on = t === name;
    $(`#tab-${t}`).setAttribute("aria-selected", String(on));
    $(`#panel-${t}`).hidden = !on;
  }
  if (name === "radar") loadDeals();
}

// ───────────────────────── sesión ─────────────────────────

function setLoggedIn(on) {
  $("#login-form").hidden = on;
  $("#watches-area").hidden = !on;
  $("#logout").hidden = !on;
}

async function login(token) {
  state.token = token;
  try {
    await loadWatches();
    store("set", token);
    setLoggedIn(true);
    $("#login-error").hidden = true;
    return true;
  } catch (e) {
    state.token = "";
    setLoggedIn(false);
    if (e.status === 401 || e.status === 503) {
      $("#login-error").textContent = e.message;
      $("#login-error").hidden = false;
    }
    return false;
  }
}

// ───────────────────────── alertas ─────────────────────────

async function loadWatches() {
  const { watches } = await api("/api/watches", { auth: true });
  state.watches = watches;
  renderWatches();
}

function renderWatches() {
  const list = $("#watch-list");
  list.replaceChildren();
  const active = state.watches.filter((w) => w.active).length;
  $("#watches-status").textContent = state.watches.length
    ? `${state.watches.length} alerta${state.watches.length > 1 ? "s" : ""} · ${active} activa${active === 1 ? "" : "s"} · se comprueban cada 2 h`
    : "Aún no tienes alertas. Crea una y el bot te avisará por Telegram.";
  for (const w of state.watches) list.append(watchCard(w));
}

function watchCard(w) {
  const node = $("#watch-card").content.cloneNode(true);
  const card = $(".watch", node);
  card.dataset.id = w.id;
  if (!w.active) card.classList.add("is-paused");

  $(".watch-name", node).textContent = w.name;
  const route = `${w.origins.join(", ")} → ${w.destinations.length ? w.destinations.join(", ") : "cualquier destino"}`;
  $(".watch-route", node).textContent = route;
  $(".watch-route", node).hidden = route === w.name;
  $(".kind", node).textContent = w.kind === "longhaul" ? "Larga distancia" : "Europa";
  $(".paused", node).hidden = w.active;

  const flex = (n) => (n ? ` ±${n}` : "");
  const criteria = [
    `ida ${fmtDay(w.departDate)}${flex(w.departFlex)}`,
    `vuelta ${fmtDay(w.returnDate)}${flex(w.returnFlex)}`,
    w.maxPrice ? `avisa por debajo de ${w.maxPrice} €` : "avisa de nuevos mínimos",
    w.maxStops === 0 ? "solo directos" : `hasta ${stopsText(w.maxStops)}`,
  ];
  $(".watch-criteria", node).textContent = criteria.join(" · ");

  const [best, ...rest] = w.results;
  if (best) {
    $(".best-price", node).textContent = `${best.price} €`;
    if (w.maxPrice && best.price <= w.maxPrice) $(".best-price", node).classList.add("is-good");
    $(".best-detail", node).textContent =
      `${best.origin} → ${best.destination} · ${best.airline || "—"} · ${fmtDay(best.departAt)} → ${fmtDay(best.returnAt)} · ${stopsText(Math.max(best.transfers, best.returnTransfers))}`;
    for (const r of [best, ...rest].slice(0, 5)) $(".results", node).append(resultRow(r));
  } else {
    $(".best", node).hidden = true;
    $(".results", node).hidden = true;
    $(".watch-empty", node).hidden = false;
    $(".watch-empty", node).textContent = w.lastCheckedAt
      ? "Sin vuelos en esas fechas por ahora. Los datos de precios se renuevan con las búsquedas de otros viajeros; vuelve a mirar en unas horas o amplía el margen de días."
      : "Buscando…";
  }

  if (w.lastError) {
    $(".watch-error", node).hidden = false;
    $(".watch-error", node).textContent = `Último error: ${w.lastError}`;
  }
  $(".checked", node).textContent = timeAgo(w.lastCheckedAt);
  $('[data-act="toggle"]', node).textContent = w.active ? "Pausar" : "Activar";

  loadSparkline(card, w.id);
  return node;
}

function resultRow(r) {
  const node = $("#result-row").content.cloneNode(true);
  $(".r-price", node).textContent = `${r.price} €`;
  $(".r-route", node).textContent = `${r.origin} → ${r.destination} · ${r.airline || "—"} · ${stopsText(Math.max(r.transfers, r.returnTransfers))}`;
  $(".r-dates", node).textContent = `${fmtDate(r.departAt)} → ${fmtDate(r.returnAt)}`;
  const buy = $(".r-buy", node);
  if (safeHref(r.link)) buy.href = r.link;
  else buy.remove();
  $(".r-gf", node).href = googleFlights(r.origin, r.destination, r.departAt, r.returnAt);
  return node;
}

async function loadSparkline(card, id) {
  try {
    const { history } = await api(`/api/watches/${id}/history`, { auth: true });
    if (history.length < 2) return;
    const prices = history.map((h) => h.min_price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const span = max - min || 1;
    const pts = prices.map((p, i) => `${((i / (prices.length - 1)) * 116 + 2).toFixed(1)},${(32 - ((p - min) / span) * 28).toFixed(1)}`);
    const svg = $(".spark", card);
    $("polyline", svg).setAttribute("points", pts.join(" "));
    svg.removeAttribute("hidden"); // en SVG la propiedad .hidden no existe
    const cap = $(".spark-caption", card);
    cap.hidden = false;
    cap.textContent = `Evolución ${history.length} días · mínimo visto ${min} € · máximo ${max} €`;
  } catch {
    // La evolución es opcional.
  }
}

async function watchAction(ev) {
  const btn = ev.target.closest("button[data-act]");
  if (!btn) return;
  const card = btn.closest(".watch");
  const id = Number(card.dataset.id);
  const w = state.watches.find((x) => x.id === id);
  const act = btn.dataset.act;

  if (act === "edit") return openForm(w);
  if (act === "delete" && !confirm(`¿Borrar la alerta «${w.name}»?`)) return;

  btn.disabled = true;
  const label = btn.textContent;
  if (act === "check") btn.textContent = "Comprobando…";
  try {
    if (act === "check") await api(`/api/watches/${id}/check`, { method: "POST", auth: true });
    if (act === "toggle") await api(`/api/watches/${id}/active`, { method: "POST", auth: true, body: { active: !w.active } });
    if (act === "delete") await api(`/api/watches/${id}`, { method: "DELETE", auth: true });
    await loadWatches();
  } catch (e) {
    alert(`No se pudo completar: ${e.message}`);
    btn.disabled = false;
    btn.textContent = label;
  }
}

// ───────────────────────── formulario ─────────────────────────

function setKind(kind) {
  const form = $("#watch-form");
  form.elements.kind.value = kind;
  $("#stops-field").hidden = kind !== "longhaul";
  $("#dest-input").placeholder = DEST_HINTS[kind].placeholder;
  $("#dest-hint").textContent = DEST_HINTS[kind].hint;
}

function addDaysStr(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function openForm(w = null) {
  const form = $("#watch-form");
  form.reset();
  state.editingId = w ? w.id : null;
  $("#form-title").textContent = w ? "Editar alerta" : "Nueva alerta";
  $("#save-form").textContent = w ? "Guardar cambios" : "Guardar y buscar";
  $("#form-error").hidden = true;

  const local = new Set(state.origins);
  const origins = w ? w.origins : [state.origins[0]].filter(Boolean);
  for (const cb of form.querySelectorAll('input[name="origin"]')) cb.checked = origins.includes(cb.value);
  form.elements.extraOrigins.value = origins.filter((o) => !local.has(o)).join(", ");
  form.elements.name.value = w?.name ?? "";
  form.elements.destinations.value = w?.destinations.join(", ") ?? "";
  form.elements.departDate.value = w?.departDate ?? addDaysStr(30);
  form.elements.returnDate.value = w?.returnDate ?? addDaysStr(33);
  form.elements.departFlex.value = String(w?.departFlex ?? 2);
  form.elements.returnFlex.value = String(w?.returnFlex ?? 2);
  form.elements.maxPrice.value = w?.maxPrice ?? "";
  form.elements.maxStops.value = String(w?.maxStops ?? 1);
  setKind(w?.kind ?? "europe");

  form.hidden = false;
  $("#new-watch").hidden = true;
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function closeForm() {
  $("#watch-form").hidden = true;
  $("#new-watch").hidden = false;
  state.editingId = null;
}

async function submitForm(ev) {
  ev.preventDefault();
  const f = ev.target.elements;
  const checked = [...ev.target.querySelectorAll('input[name="origin"]:checked')].map((c) => c.value);
  const extra = f.extraOrigins.value.split(/[\s,;]+/).filter(Boolean);
  const body = {
    kind: f.kind.value,
    name: f.name.value,
    origins: [...checked, ...extra],
    destinations: f.destinations.value,
    departDate: f.departDate.value,
    departFlex: Number(f.departFlex.value),
    returnDate: f.returnDate.value,
    returnFlex: Number(f.returnFlex.value),
    maxPrice: f.maxPrice.value === "" ? null : Number(f.maxPrice.value),
    maxStops: Number(f.maxStops.value),
  };

  const btn = $("#save-form");
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Buscando vuelos…";
  $("#form-error").hidden = true;
  try {
    const path = state.editingId ? `/api/watches/${state.editingId}` : "/api/watches";
    await api(path, { method: state.editingId ? "PUT" : "POST", auth: true, body });
    closeForm();
    await loadWatches();
  } catch (e) {
    $("#form-error").textContent = e.message;
    $("#form-error").hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
}

function buildForm() {
  const chips = $("#origin-chips");
  for (const o of state.origins) {
    const label = document.createElement("label");
    label.className = "chip";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.name = "origin";
    cb.value = o;
    const span = document.createElement("span");
    span.textContent = `${AIRPORTS[o] ?? o} · ${o}`;
    label.append(cb, span);
    chips.append(label);
  }
  for (const name of ["departFlex", "returnFlex"]) {
    const sel = $(`select[name="${name}"]`);
    for (let i = 0; i <= 7; i++) sel.append(option(String(i), i === 0 ? "fecha exacta" : `± ${i} día${i > 1 ? "s" : ""}`));
  }
}

// ───────────────────────── radar ─────────────────────────

function readFilters() {
  const params = new URLSearchParams();
  for (const [k, v] of new FormData($("#filters"))) if (v) params.set(k, String(v));
  return params;
}

function renderDeals(deals) {
  const grid = $("#deals");
  grid.replaceChildren();
  const status = $("#status");
  if (deals.length === 0) {
    status.textContent = "No hay ofertas con estos filtros ahora mismo. El radar se actualiza cada pocas horas.";
    return;
  }
  status.textContent = `${deals.length} ofertas, ordenadas por puntuación`;
  for (const d of deals) {
    const node = $("#card").content.cloneNode(true);
    if (d.error_fare) $(".card", node).classList.add("is-error");
    $(".route", node).textContent = `${d.origin} → ${d.destination}`;
    $(".mode", node).textContent = state.modes[d.mode] ?? d.mode;
    $(".error-fare", node).hidden = !d.error_fare;
    $(".out", node).textContent = fmtDate(d.depart_at);
    $(".back", node).textContent = fmtDate(d.return_at);
    $(".hours", node).textContent =
      `${d.airline || "—"}${d.useful_hours != null ? ` · ~${Math.round(d.useful_hours)} h útiles en destino` : ""}`;
    $(".price", node).textContent = `${d.price} €`;
    $(".normal", node).textContent = `normal ~${Math.round(d.median_price)} € · −${Math.round(d.discount * 100)}%`;
    const buy = $(".buy", node);
    if (safeHref(d.link)) buy.href = d.link;
    else buy.remove();
    $(".gf", node).href = d.google_flights;
    grid.append(node);
  }
}

async function loadDeals() {
  $("#status").textContent = "Cargando…";
  try {
    const { deals } = await api(`/api/deals?${readFilters()}`);
    renderDeals(deals);
  } catch (e) {
    $("#status").textContent = `No se pudieron cargar las ofertas (${e.message}).`;
  }
}

async function scanNow() {
  const out = $("#scan-out");
  out.hidden = false;
  if (!state.token) {
    out.textContent = "Entra primero con tu contraseña en «Mis alertas».";
    return;
  }
  const btn = $("#scan-btn");
  btn.disabled = true;
  out.textContent = "Escaneando… (puede tardar hasta un minuto)";
  try {
    const r = await api("/api/scan?origins=MPL,MRS", { method: "POST", auth: true });
    out.textContent = `Escaneo hecho: ${r.offers} viajes analizados, ${r.deals} ofertas, ${r.alerts} avisos enviados.${r.errors.length ? `\nErrores: ${r.errors.join("\n")}` : ""}`;
    await loadDeals();
  } catch (e) {
    out.textContent = `Error: ${e.message}`;
  } finally {
    btn.disabled = false;
  }
}

// ───────────────────────── arranque ─────────────────────────

async function init() {
  try {
    const cfg = await api("/api/config");
    state.modes = cfg.modes;
    state.origins = cfg.origins;
    for (const o of cfg.origins) $("#origin").append(option(o, `${AIRPORTS[o] ?? o} (${o})`));
    for (const [k, label] of Object.entries(cfg.modes)) $("#mode").append(option(k, label));
  } catch {
    // Filtros y aeropuertos quedan vacíos; el resto funciona.
  }
  buildForm();

  $("#tab-watches").addEventListener("click", () => showTab("watches"));
  $("#tab-radar").addEventListener("click", () => showTab("radar"));
  $("#filters").addEventListener("change", loadDeals);
  $("#scan-btn").addEventListener("click", scanNow);
  $("#new-watch").addEventListener("click", () => openForm());
  $("#cancel-form").addEventListener("click", closeForm);
  $("#watch-form").addEventListener("submit", submitForm);
  for (const r of document.querySelectorAll('input[name="kind"]')) r.addEventListener("change", () => setKind(r.value));
  $("#watch-list").addEventListener("click", watchAction);
  $("#login-form").addEventListener("submit", (ev) => {
    ev.preventDefault();
    login($("#login-token").value.trim());
  });
  $("#logout").addEventListener("click", () => {
    store("del");
    state.token = "";
    setLoggedIn(false);
  });

  const saved = store("get");
  if (!(saved && (await login(saved)))) setLoggedIn(false);
}

init();
