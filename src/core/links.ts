import { localDate } from "./trip";

/** Enlace a Google Flights con la ruta y fechas exactas, para comparar antes de comprar. */
export function googleFlightsLink(origin: string, destination: string, departAt: string, returnAt: string): string {
  const q = `Flights from ${origin} to ${destination} on ${localDate(departAt)} through ${localDate(returnAt)}`;
  return `https://www.google.com/travel/flights?q=${encodeURIComponent(q)}&curr=EUR&hl=es`;
}
