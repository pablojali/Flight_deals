/** Búsqueda de ciudades/aeropuertos por nombre para obtener su código IATA. */

export interface Place {
  code: string;
  name: string;
  country: string;
  /** city = código de ciudad (agrupa todos sus aeropuertos). */
  type: "city" | "airport";
  /** Para aeropuertos: ciudad a la que pertenece. */
  city?: string;
}

/**
 * Lista propia de destinos habituales desde el sur de Francia (y larga distancia).
 * Se usa siempre como base y como respaldo si el autocompletado externo falla.
 * Formato: código|nombre|país|tipo (c = ciudad con varios aeropuertos, a = aeropuerto)|ciudad
 */
const RAW = `
MPL|Montpellier|Francia|a
MRS|Marsella|Francia|a
FNI|Nîmes|Francia|a
BZR|Béziers|Francia|a
TLN|Toulon-Hyères|Francia|a
AVN|Aviñón|Francia|a
CCF|Carcassonne|Francia|a
PGF|Perpiñán|Francia|a
NCE|Niza|Francia|a
TLS|Toulouse|Francia|a
LYS|Lyon|Francia|a
BOD|Burdeos|Francia|a
NTE|Nantes|Francia|a
AJA|Ajaccio|Francia|a
BIA|Bastia|Francia|a
PAR|París (todos los aeropuertos)|Francia|c
CDG|París-Charles de Gaulle|Francia|a|París
ORY|París-Orly|Francia|a|París
BVA|París-Beauvais|Francia|a|París
BCN|Barcelona|España|a
MAD|Madrid|España|a
PMI|Palma de Mallorca|España|a
IBZ|Ibiza|España|a
MAH|Menorca|España|a
AGP|Málaga|España|a
SVQ|Sevilla|España|a
VLC|Valencia|España|a
ALC|Alicante|España|a
BIO|Bilbao|España|a
SCQ|Santiago de Compostela|España|a
GRX|Granada|España|a
TFS|Tenerife Sur|España|a|Tenerife
TFN|Tenerife Norte|España|a|Tenerife
LPA|Gran Canaria|España|a
ACE|Lanzarote|España|a
FUE|Fuerteventura|España|a
LIS|Lisboa|Portugal|a
OPO|Oporto|Portugal|a
FAO|Faro|Portugal|a
FNC|Madeira (Funchal)|Portugal|a
PDL|Azores (Ponta Delgada)|Portugal|a
ROM|Roma (todos los aeropuertos)|Italia|c
FCO|Roma-Fiumicino|Italia|a|Roma
CIA|Roma-Ciampino|Italia|a|Roma
MIL|Milán (todos los aeropuertos)|Italia|c
MXP|Milán-Malpensa|Italia|a|Milán
BGY|Milán-Bérgamo|Italia|a|Milán
LIN|Milán-Linate|Italia|a|Milán
VCE|Venecia|Italia|a
NAP|Nápoles|Italia|a
BLQ|Bolonia|Italia|a
FLR|Florencia|Italia|a
PSA|Pisa|Italia|a
TRN|Turín|Italia|a
BRI|Bari|Italia|a
CTA|Catania (Sicilia)|Italia|a
PMO|Palermo (Sicilia)|Italia|a
CAG|Cagliari (Cerdeña)|Italia|a
OLB|Olbia (Cerdeña)|Italia|a
LON|Londres (todos los aeropuertos)|Reino Unido|c
LHR|Londres-Heathrow|Reino Unido|a|Londres
LGW|Londres-Gatwick|Reino Unido|a|Londres
STN|Londres-Stansted|Reino Unido|a|Londres
LTN|Londres-Luton|Reino Unido|a|Londres
MAN|Mánchester|Reino Unido|a
EDI|Edimburgo|Reino Unido|a
BRS|Bristol|Reino Unido|a
DUB|Dublín|Irlanda|a
AMS|Ámsterdam|Países Bajos|a
EIN|Eindhoven|Países Bajos|a
BRU|Bruselas|Bélgica|a
CRL|Bruselas-Charleroi|Bélgica|a|Bruselas
BER|Berlín|Alemania|a
MUC|Múnich|Alemania|a
FRA|Fráncfort|Alemania|a
HAM|Hamburgo|Alemania|a
CGN|Colonia|Alemania|a
DUS|Düsseldorf|Alemania|a
GVA|Ginebra|Suiza|a
ZRH|Zúrich|Suiza|a
BSL|Basilea-Mulhouse|Suiza|a
VIE|Viena|Austria|a
CPH|Copenhague|Dinamarca|a
STO|Estocolmo (todos los aeropuertos)|Suecia|c
ARN|Estocolmo-Arlanda|Suecia|a|Estocolmo
OSL|Oslo|Noruega|a
HEL|Helsinki|Finlandia|a
KEF|Reikiavik|Islandia|a
RIX|Riga|Letonia|a
TLL|Tallin|Estonia|a
VNO|Vilna|Lituania|a
WAW|Varsovia|Polonia|a
KRK|Cracovia|Polonia|a
GDN|Gdansk|Polonia|a
PRG|Praga|Chequia|a
BUD|Budapest|Hungría|a
OTP|Bucarest|Rumanía|a
SOF|Sofía|Bulgaria|a
BEG|Belgrado|Serbia|a
ZAG|Zagreb|Croacia|a
SPU|Split|Croacia|a
DBV|Dubrovnik|Croacia|a
LJU|Liubliana|Eslovenia|a
TIA|Tirana|Albania|a
ATH|Atenas|Grecia|a
SKG|Salónica|Grecia|a
JTR|Santorini|Grecia|a
JMK|Mykonos|Grecia|a
HER|Creta (Heraclión)|Grecia|a
CFU|Corfú|Grecia|a
MLA|Malta|Malta|a
LCA|Lárnaca|Chipre|a
IST|Estambul (todos los aeropuertos)|Turquía|c
SAW|Estambul-Sabiha Gökçen|Turquía|a|Estambul
AYT|Antalya|Turquía|a
RAK|Marrakech|Marruecos|a
CMN|Casablanca|Marruecos|a
FEZ|Fez|Marruecos|a
TNG|Tánger|Marruecos|a
AGA|Agadir|Marruecos|a
RBA|Rabat|Marruecos|a
ALG|Argel|Argelia|a
TUN|Túnez|Túnez|a
DJE|Djerba|Túnez|a
CAI|El Cairo|Egipto|a
TLV|Tel Aviv|Israel|a
DXB|Dubái|Emiratos Árabes Unidos|a
BUE|Buenos Aires (todos los aeropuertos)|Argentina|c
EZE|Buenos Aires-Ezeiza|Argentina|a|Buenos Aires
AEP|Buenos Aires-Aeroparque|Argentina|a|Buenos Aires
COR|Córdoba|Argentina|a
MDZ|Mendoza|Argentina|a
ROS|Rosario|Argentina|a
BRC|Bariloche|Argentina|a
IGR|Puerto Iguazú (Cataratas)|Argentina|a
SLA|Salta|Argentina|a
USH|Ushuaia|Argentina|a
FTE|El Calafate|Argentina|a
MVD|Montevideo|Uruguay|a
SCL|Santiago de Chile|Chile|a
SAO|São Paulo (todos los aeropuertos)|Brasil|c
GRU|São Paulo-Guarulhos|Brasil|a|São Paulo
RIO|Río de Janeiro (todos los aeropuertos)|Brasil|c
GIG|Río de Janeiro-Galeão|Brasil|a|Río de Janeiro
LIM|Lima|Perú|a
BOG|Bogotá|Colombia|a
MEX|Ciudad de México|México|a
CUN|Cancún|México|a
HAV|La Habana|Cuba|a
PUJ|Punta Cana|República Dominicana|a
NYC|Nueva York (todos los aeropuertos)|Estados Unidos|c
JFK|Nueva York-JFK|Estados Unidos|a|Nueva York
EWR|Nueva York-Newark|Estados Unidos|a|Nueva York
MIA|Miami|Estados Unidos|a
LAX|Los Ángeles|Estados Unidos|a
YUL|Montreal|Canadá|a
BKK|Bangkok|Tailandia|a
TYO|Tokio (todos los aeropuertos)|Japón|c
SIN|Singapur|Singapur|a
DPS|Bali (Denpasar)|Indonesia|a
MLE|Malé (Maldivas)|Maldivas|a
`;

export const LOCAL_PLACES: Place[] = RAW.trim()
  .split("\n")
  .map((line) => {
    const [code, name, country, t, city] = line.split("|");
    return { code: code!, name: name!, country: country!, type: t === "c" ? "city" : "airport", ...(city ? { city } : {}) };
  });

/** Minúsculas y sin acentos, para comparar "Zurich" con "Zúrich". */
export function normalize(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

function rank(p: Place, q: string): number {
  const code = p.code.toLowerCase();
  const name = normalize(p.name);
  const city = normalize(p.city ?? "");
  const country = normalize(p.country);
  if (code === q) return 0;
  if (name.startsWith(q)) return p.type === "city" ? 1 : 2;
  if (city.startsWith(q)) return 3;
  if (name.split(/[\s\-()]+/).some((w) => w.startsWith(q))) return 4;
  if (country.startsWith(q)) return 5;
  return -1;
}

export function searchLocal(query: string, limit = 8): Place[] {
  const q = normalize(query);
  if (q.length < 2) return [];
  return LOCAL_PLACES.map((p) => ({ p, r: rank(p, q) }))
    .filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r || a.p.name.localeCompare(b.p.name))
    .slice(0, limit)
    .map((x) => x.p);
}

/** Respuesta del autocompletado de Travelpayouts (places2). */
interface RemotePlace {
  type?: string;
  code?: string;
  name?: string;
  country_name?: string;
  city_name?: string;
}

export function normalizeRemote(data: unknown): Place[] {
  if (!Array.isArray(data)) return [];
  const out: Place[] = [];
  for (const raw of data as RemotePlace[]) {
    const code = String(raw?.code ?? "").toUpperCase();
    if (!/^[A-Z]{3}$/.test(code) || !raw.name) continue;
    if (raw.type !== "city" && raw.type !== "airport") continue;
    out.push({
      code,
      name: raw.name,
      country: raw.country_name ?? "",
      type: raw.type,
      ...(raw.type === "airport" && raw.city_name ? { city: raw.city_name } : {}),
    });
  }
  return out;
}

/** Une resultados: primero los locales (curados), luego los externos, sin repetir códigos. */
export function mergePlaces(local: Place[], remote: Place[], limit = 8): Place[] {
  const seen = new Set<string>();
  const out: Place[] = [];
  for (const p of [...local, ...remote]) {
    if (seen.has(p.code)) continue;
    seen.add(p.code);
    out.push(p);
    if (out.length >= limit) break;
  }
  return out;
}
