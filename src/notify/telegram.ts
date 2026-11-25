import { MODES } from "../config";
import { googleFlightsLink } from "../core/links";
import { localDate, localTime } from "../core/trip";
import type { DealRow } from "../storage/db";
import type { TripMode } from "../types";

const WEEKDAYS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

function prettyDate(iso: string): string {
  const d = localDate(iso);
  const wd = WEEKDAYS[new Date(`${d}T12:00:00Z`).getUTCDay()];
  return `${wd} ${d.slice(8, 10)}/${d.slice(5, 7)}`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function formatDealMessage(d: DealRow): string {
  const mode = MODES[d.mode as TripMode]?.label ?? d.mode;
  const pct = Math.round(d.discount * 100);
  const head = d.error_fare ? "🚨 <b>¿TARIFA ERRÓNEA?</b>" : "✈️ <b>Oferta detectada</b>";
  const lines = [
    `${head} · ${escapeHtml(mode)}`,
    "",
    `<b>${d.origin} → ${d.destination}</b>  ${escapeHtml(d.airline)}`,
    `🛫 ${prettyDate(d.depart_at)} ${localTime(d.depart_at)}`,
    `🛬 vuelta ${prettyDate(d.return_at)} ${localTime(d.return_at)}`,
    d.useful_hours !== null ? `⏱️ ~${Math.round(d.useful_hours)} h útiles en destino` : "",
    `💶 <b>${d.price} ${d.currency}</b> ida y vuelta (normal ~${Math.round(d.median_price)} ${d.currency}, −${pct}%)`,
  ].filter((l) => l !== "");

  const gf = googleFlightsLink(d.origin, d.destination, d.depart_at, d.return_at);
  const links = [d.link ? `<a href="${escapeHtml(d.link)}">Ver oferta</a>` : "", `<a href="${escapeHtml(gf)}">Google Flights</a>`];
  return [...lines, "", links.filter(Boolean).join(" · ")].join("\n");
}

export async function sendTelegram(
  token: string,
  chatId: string,
  html: string,
  fetchFn: typeof fetch = fetch,
): Promise<void> {
  const res = await fetchFn(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: html, parse_mode: "HTML", disable_web_page_preview: true }),
  });
  if (!res.ok) {
    // No incluimos el token en el mensaje de error.
    throw new Error(`Telegram HTTP ${res.status}`);
  }
}

export function formatWatchMessage(
  watchName: string,
  m: { origin: string; destination: string; price: number; currency: string; airline: string; departAt: string; returnAt: string; transfers: number; returnTransfers: number; link: string },
  reason: "under_max" | "new_low",
  maxPrice: number | null,
): string {
  const head =
    reason === "under_max"
      ? `🔔 <b>${escapeHtml(watchName)}</b>: por debajo de ${maxPrice} ${m.currency}`
      : `📉 <b>${escapeHtml(watchName)}</b>: nuevo precio mínimo`;
  const stops = (n: number) => (n === 0 ? "directo" : `${n} escala${n > 1 ? "s" : ""}`);
  const gf = googleFlightsLink(m.origin, m.destination, m.departAt, m.returnAt);
  const links = [m.link ? `<a href="${escapeHtml(m.link)}">Ver oferta</a>` : "", `<a href="${escapeHtml(gf)}">Google Flights</a>`];
  return [
    head,
    "",
    `<b>${m.origin} → ${m.destination}</b>  ${escapeHtml(m.airline)}`,
    `🛫 ${prettyDate(m.departAt)} ${localTime(m.departAt)} (${stops(m.transfers)})`,
    `🛬 vuelta ${prettyDate(m.returnAt)} ${localTime(m.returnAt)} (${stops(m.returnTransfers)})`,
    `💶 <b>${m.price} ${m.currency}</b> ida y vuelta`,
    "",
    links.filter(Boolean).join(" · "),
  ].join("\n");
}
