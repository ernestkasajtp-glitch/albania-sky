// Comprehensive IATA airport code lookup
export interface Airport {
  code: string;
  city: string;
  name: string;
  country: string;
}

const AIRPORTS: Airport[] = [
  // Albania
  { code: "TIA", city: "Tiranë", name: "Mother Teresa International", country: "AL" },
  // Italy
  { code: "BLQ", city: "Bologna", name: "Guglielmo Marconi", country: "IT" },
  { code: "FCO", city: "Rome", name: "Fiumicino Leonardo da Vinci", country: "IT" },
  { code: "CIA", city: "Rome", name: "Ciampino", country: "IT" },
  { code: "MXP", city: "Milan", name: "Malpensa", country: "IT" },
  { code: "LIN", city: "Milan", name: "Linate", country: "IT" },
  { code: "BGY", city: "Milan/Bergamo", name: "Orio al Serio", country: "IT" },
  { code: "VCE", city: "Venice", name: "Marco Polo", country: "IT" },
  { code: "TSF", city: "Venice/Treviso", name: "Treviso Sant'Angelo", country: "IT" },
  { code: "NAP", city: "Naples", name: "Naples International", country: "IT" },
  { code: "CTA", city: "Catania", name: "Catania Fontanarossa", country: "IT" },
  { code: "PMO", city: "Palermo", name: "Falcone Borsellino", country: "IT" },
  { code: "PSA", city: "Pisa", name: "Galileo Galilei", country: "IT" },
  { code: "FLR", city: "Florence", name: "Amerigo Vespucci", country: "IT" },
  { code: "BRI", city: "Bari", name: "Karol Wojtyla", country: "IT" },
  { code: "TRN", city: "Turin", name: "Caselle Sandro Pertini", country: "IT" },
  { code: "GOA", city: "Genoa", name: "Cristoforo Colombo", country: "IT" },
  { code: "CAG", city: "Cagliari", name: "Elmas", country: "IT" },
  { code: "REG", city: "Reggio Calabria", name: "Tito Minniti", country: "IT" },
  { code: "VRN", city: "Verona", name: "Catullo", country: "IT" },
  // UK
  { code: "LHR", city: "London", name: "Heathrow", country: "GB" },
  { code: "LGW", city: "London", name: "Gatwick", country: "GB" },
  { code: "STN", city: "London", name: "Stansted", country: "GB" },
  { code: "LTN", city: "London/Luton", name: "Luton", country: "GB" },
  { code: "MAN", city: "Manchester", name: "Manchester Airport", country: "GB" },
  { code: "BHX", city: "Birmingham", name: "Birmingham Airport", country: "GB" },
  { code: "GLA", city: "Glasgow", name: "Glasgow International", country: "GB" },
  { code: "EDI", city: "Edinburgh", name: "Edinburgh Airport", country: "GB" },
  { code: "BRS", city: "Bristol", name: "Bristol Airport", country: "GB" },
  { code: "LBA", city: "Leeds", name: "Leeds Bradford", country: "GB" },
  // Germany
  { code: "FRA", city: "Frankfurt", name: "Frankfurt Airport", country: "DE" },
  { code: "MUC", city: "Munich", name: "Franz Josef Strauss", country: "DE" },
  { code: "BER", city: "Berlin", name: "Brandenburg BER", country: "DE" },
  { code: "DUS", city: "Düsseldorf", name: "Düsseldorf International", country: "DE" },
  { code: "HAM", city: "Hamburg", name: "Hamburg Airport", country: "DE" },
  { code: "STR", city: "Stuttgart", name: "Stuttgart Airport", country: "DE" },
  { code: "CGN", city: "Cologne", name: "Cologne Bonn", country: "DE" },
  { code: "NUE", city: "Nuremberg", name: "Nuremberg Airport", country: "DE" },
  { code: "DTM", city: "Dortmund", name: "Dortmund Airport", country: "DE" },
  { code: "FMM", city: "Memmingen", name: "Allgäu Airport Memmingen", country: "DE" },
  { code: "HHN", city: "Frankfurt/Hahn", name: "Frankfurt–Hahn", country: "DE" },
  { code: "LEJ", city: "Leipzig", name: "Leipzig/Halle", country: "DE" },
  { code: "HAJ", city: "Hannover", name: "Hannover Airport", country: "DE" },
  { code: "BRE", city: "Bremen", name: "Bremen Airport", country: "DE" },
  { code: "FKB", city: "Karlsruhe/Baden-Baden", name: "Karlsruhe Baden-Baden", country: "DE" },
  { code: "SXB", city: "Strasbourg", name: "Strasbourg Airport", country: "FR" },
  // France
  { code: "CDG", city: "Paris", name: "Charles de Gaulle", country: "FR" },
  { code: "ORY", city: "Paris", name: "Orly", country: "FR" },
  { code: "NCE", city: "Nice", name: "Nice Côte d'Azur", country: "FR" },
  { code: "MRS", city: "Marseille", name: "Provence", country: "FR" },
  { code: "LYS", city: "Lyon", name: "Lyon Saint-Exupéry", country: "FR" },
  { code: "TLS", city: "Toulouse", name: "Blagnac", country: "FR" },
  { code: "BOD", city: "Bordeaux", name: "Mérignac", country: "FR" },
  { code: "NTE", city: "Nantes", name: "Nantes Atlantique", country: "FR" },
  // Spain
  { code: "MAD", city: "Madrid", name: "Adolfo Suárez Barajas", country: "ES" },
  { code: "BCN", city: "Barcelona", name: "Josep Tarradellas El Prat", country: "ES" },
  { code: "PMI", city: "Palma de Mallorca", name: "Son Sant Joan", country: "ES" },
  { code: "AGP", city: "Málaga", name: "Costa del Sol", country: "ES" },
  { code: "ALC", city: "Alicante", name: "Alicante-Elche", country: "ES" },
  { code: "VLC", city: "Valencia", name: "Valencia Airport", country: "ES" },
  { code: "SVQ", city: "Seville", name: "San Pablo", country: "ES" },
  { code: "TFS", city: "Tenerife South", name: "Reina Sofía", country: "ES" },
  // Netherlands
  { code: "AMS", city: "Amsterdam", name: "Schiphol", country: "NL" },
  { code: "EIN", city: "Eindhoven", name: "Eindhoven Airport", country: "NL" },
  // Belgium
  { code: "BRU", city: "Brussels", name: "Brussels Airport", country: "BE" },
  { code: "CRL", city: "Brussels/Charleroi", name: "Brussels South Charleroi", country: "BE" },
  // Switzerland
  { code: "ZRH", city: "Zurich", name: "Kloten", country: "CH" },
  { code: "GVA", city: "Geneva", name: "Cointrin", country: "CH" },
  { code: "BSL", city: "Basel", name: "EuroAirport Basel-Mulhouse", country: "CH" },
  // Austria
  { code: "VIE", city: "Vienna", name: "Vienna International", country: "AT" },
  { code: "GRZ", city: "Graz", name: "Graz Airport", country: "AT" },
  { code: "SZG", city: "Salzburg", name: "W. A. Mozart", country: "AT" },
  { code: "INN", city: "Innsbruck", name: "Kranebitten", country: "AT" },
  { code: "LNZ", city: "Linz", name: "Blue Danube Airport", country: "AT" },
  // Turkey
  { code: "IST", city: "Istanbul", name: "Istanbul Airport", country: "TR" },
  { code: "SAW", city: "Istanbul/Sabiha", name: "Sabiha Gökçen", country: "TR" },
  { code: "AYT", city: "Antalya", name: "Antalya Airport", country: "TR" },
  { code: "ADB", city: "Izmir", name: "Adnan Menderes", country: "TR" },
  { code: "ESB", city: "Ankara", name: "Esenboğa", country: "TR" },
  { code: "DLM", city: "Dalaman", name: "Dalaman Airport", country: "TR" },
  { code: "BJV", city: "Bodrum", name: "Milas-Bodrum", country: "TR" },
  // Greece
  { code: "ATH", city: "Athens", name: "Eleftherios Venizelos", country: "GR" },
  { code: "SKG", city: "Thessaloniki", name: "Makedonia", country: "GR" },
  { code: "HER", city: "Heraklion/Crete", name: "Nikos Kazantzakis", country: "GR" },
  { code: "RHO", city: "Rhodes", name: "Diagoras", country: "GR" },
  { code: "CFU", city: "Corfu", name: "Ioannis Kapodistrias", country: "GR" },
  { code: "MJT", city: "Mytilene/Lesbos", name: "Odysseas Elytis", country: "GR" },
  // North Macedonia
  { code: "SKP", city: "Skopje", name: "Alexander the Great", country: "MK" },
  { code: "OHD", city: "Ohrid", name: "St. Paul the Apostle", country: "MK" },
  // Kosovo
  { code: "PRN", city: "Prishtina", name: "Adem Jashari", country: "XK" },
  // Serbia
  { code: "BEG", city: "Belgrade", name: "Nikola Tesla", country: "RS" },
  // Croatia
  { code: "ZAG", city: "Zagreb", name: "Franjo Tuđman", country: "HR" },
  { code: "SPU", city: "Split", name: "Split Airport", country: "HR" },
  { code: "DBV", city: "Dubrovnik", name: "Čilipi", country: "HR" },
  // Bosnia
  { code: "SJJ", city: "Sarajevo", name: "Butmir International", country: "BA" },
  // Slovenia
  { code: "LJU", city: "Ljubljana", name: "Jože Pučnik", country: "SI" },
  // Montenegro
  { code: "TGD", city: "Podgorica", name: "Podgorica Airport", country: "ME" },
  { code: "TIV", city: "Tivat", name: "Tivat Airport", country: "ME" },
  // Bulgaria
  { code: "SOF", city: "Sofia", name: "Sofia Airport", country: "BG" },
  { code: "VAR", city: "Varna", name: "Varna Airport", country: "BG" },
  { code: "BOJ", city: "Burgas", name: "Burgas Airport", country: "BG" },
  // Romania
  { code: "OTP", city: "Bucharest", name: "Henri Coandă", country: "RO" },
  { code: "CLJ", city: "Cluj-Napoca", name: "Avram Iancu", country: "RO" },
  // Hungary
  { code: "BUD", city: "Budapest", name: "Budapest Liszt Ferenc", country: "HU" },
  // Czech Republic
  { code: "PRG", city: "Prague", name: "Václav Havel", country: "CZ" },
  // Poland
  { code: "WAW", city: "Warsaw", name: "Chopin Airport", country: "PL" },
  { code: "KRK", city: "Krakow", name: "John Paul II", country: "PL" },
  // Scandinavia
  { code: "CPH", city: "Copenhagen", name: "Kastrup", country: "DK" },
  { code: "OSL", city: "Oslo", name: "Gardermoen", country: "NO" },
  { code: "ARN", city: "Stockholm", name: "Arlanda", country: "SE" },
  { code: "HEL", city: "Helsinki", name: "Vantaa", country: "FI" },
  // UAE & Middle East
  { code: "DXB", city: "Dubai", name: "Dubai International", country: "AE" },
  { code: "AUH", city: "Abu Dhabi", name: "Zayed International", country: "AE" },
  { code: "DOH", city: "Doha", name: "Hamad International", country: "QA" },
  // USA
  { code: "JFK", city: "New York", name: "John F. Kennedy", country: "US" },
  { code: "EWR", city: "New York/Newark", name: "Newark Liberty", country: "US" },
  // Canada
  { code: "YYZ", city: "Toronto", name: "Pearson International", country: "CA" },
  // Malta
  { code: "MLA", city: "Malta", name: "Malta International", country: "MT" },
  // Cyprus
  { code: "LCA", city: "Larnaca", name: "Larnaca International", country: "CY" },
  { code: "PFO", city: "Paphos", name: "Paphos International", country: "CY" },
  // Portugal
  { code: "LIS", city: "Lisbon", name: "Humberto Delgado", country: "PT" },
  { code: "OPO", city: "Porto", name: "Francisco Sá Carneiro", country: "PT" },
  // Sweden
  { code: "GOT", city: "Gothenburg", name: "Landvetter", country: "SE" },
  // Norway
  { code: "BGO", city: "Bergen", name: "Flesland", country: "NO" },
  // Ireland
  { code: "DUB", city: "Dublin", name: "Dublin Airport", country: "IE" },
  // Luxembourg
  { code: "LUX", city: "Luxembourg", name: "Findel", country: "LU" },
  // Russia
  { code: "SVO", city: "Moscow", name: "Sheremetyevo", country: "RU" },
  { code: "DME", city: "Moscow", name: "Domodedovo", country: "RU" },
  // Ukraine
  { code: "KBP", city: "Kyiv", name: "Boryspil International", country: "UA" },
  // Egypt
  { code: "CAI", city: "Cairo", name: "Cairo International", country: "EG" },
  { code: "HRG", city: "Hurghada", name: "Hurghada International", country: "EG" },
  { code: "SSH", city: "Sharm el-Sheikh", name: "Sharm el-Sheikh Intl", country: "EG" },
  // Tunisia
  { code: "TUN", city: "Tunis", name: "Carthage International", country: "TN" },
  // Morocco
  { code: "CMN", city: "Casablanca", name: "Mohammed V International", country: "MA" },
  // Israel
  { code: "TLV", city: "Tel Aviv", name: "Ben Gurion International", country: "IL" },
];

const AIRPORT_MAP = new Map<string, Airport>(AIRPORTS.map(a => [a.code.toUpperCase(), a]));

export function normalizeAirportCode(code: string): string {
  return code.trim().toUpperCase();
}

export function lookupAirport(code: string): Airport | undefined {
  return AIRPORT_MAP.get(normalizeAirportCode(code));
}

export function airportCity(code: string): string {
  return lookupAirport(code)?.city ?? code;
}

export function airportLabel(code: string): string {
  const a = lookupAirport(code);
  if (!a) return code;
  return `${code} – ${a.city}`;
}

export { AIRPORTS };
