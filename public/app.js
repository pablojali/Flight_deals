const $ = (sel) => document.querySelector(sel);
const WEEKDAYS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const AIRPORTS = {
  MPL: "Montpellier", MRS: "Marsella", FNI: "Nîmes", BZR: "Béziers", TLN: "Toulon", AVN: "Aviñón",
  CCF: "Carcassonne", PGF: "Perpiñán", NCE: "Niza", TLS: "Toulouse",
};

let modes = {};

function fmtDate(iso) {
  const d = iso.slice(0, 10);
  const wd = WEEKDAYS[new Date(`${d}T12:00:00Z`).getUTCDay()];
  return `${wd} ${d.slice(8, 10)}/${d.slice(5, 7)} · ${iso.slice(11, 16)}`;
}

function option(value, label) {
  const o = document.createElement("option");
  o.value = value;
  o.textContent = label;
  return o;
}

function readFilters() {
  const params = new URLSearchParams();
  for (const [k, v] of new FormData($("#filters"))) if (v) params.set(k, String(v));
  return params;
}

function render(deals) {
  const grid = $("#deals");
  grid.replaceChildren();
  const status = $("#status");
  if (deals.length === 0) {
    status.textContent = "No hay ofertas con estos filtros ahora mismo. El radar se actualiza cada pocas horas.";
    return;
  }
  status.textContent = `${deals.length} ofertas, ordenadas por puntuación`;
  const tpl = $("#card");
  for (const d of deals) {
    const node = tpl.content.cloneNode(true);
    const card = node.querySelector(".card");
    if (d.error_fare) card.classList.add("is-error");
    node.querySelector(".route").textContent = `${d.origin} → ${d.destination}`;
    node.querySelector(".mode").textContent = modes[d.mode] ?? d.mode;
    node.querySelector(".error-fare").hidden = !d.error_fare;
    node.querySelector(".out").textContent = fmtDate(d.depart_at);
    node.querySelector(".back").textContent = fmtDate(d.return_at);
    node.querySelector(".hours").textContent =
      `${d.airline || "—"}${d.useful_hours != null ? ` · ~${Math.round(d.useful_hours)} h útiles en destino` : ""}`;
    node.querySelector(".price").textContent = `${d.price} €`;
    node.querySelector(".normal").textContent = `normal ~${Math.round(d.median_price)} € · −${Math.round(d.discount * 100)}%`;
    const buy = node.querySelector(".buy");
    if (d.link) buy.href = d.link;
    else buy.remove();
    node.querySelector(".gf").href = d.google_flights;
    grid.append(node);
  }
}

async function load() {
  $("#status").textContent = "Cargando…";
  try {
    const res = await fetch(`/api/deals?${readFilters()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { deals } = await res.json();
    render(deals);
  } catch (e) {
    $("#status").textContent = `No se pudieron cargar las ofertas (${e.message}).`;
  }
}

async function init() {
  try {
    const res = await fetch("/api/config");
    const cfg = await res.json();
    modes = cfg.modes;
    for (const o of cfg.origins) $("#origin").append(option(o, `${AIRPORTS[o] ?? o} (${o})`));
    for (const [k, label] of Object.entries(modes)) $("#mode").append(option(k, label));
  } catch {
    // Los filtros de salida/modalidad quedan en "Todos".
  }
  $("#filters").addEventListener("change", load);
  await load();
}

init();
