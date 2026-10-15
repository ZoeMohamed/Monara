// Local artwork has provenance in public/brands/README.md. Entries with `simple` render
// the CC0 Simple Icons mark of that slug from this app's own /brand-icons route.
type BrandEntry = {
  name: string;
  kind: "bank" | "wallet" | "merchant";
  asset?: string;
  simple?: string;
  aliases?: readonly string[];
};

export const brands = {
  // Banks
  bca: {
    name: "BCA",
    kind: "bank",
    asset: "bca.svg",
    aliases: [
      "bank bca",
      "bank central asia",
      "pt bank central asia tbk",
      "klikbca",
      "bca mobile",
      "mybca",
    ],
  },
  mandiri: {
    name: "Bank Mandiri",
    kind: "bank",
    asset: "mandiri.png",
    aliases: ["mandiri", "pt bank mandiri (persero) tbk", "livin by mandiri", "livin"],
  },
  bri: {
    name: "BRI",
    kind: "bank",
    asset: "bri.svg",
    aliases: ["bank bri", "bank rakyat indonesia", "brimo"],
  },
  bni: {
    name: "BNI",
    kind: "bank",
    asset: "bni.svg",
    aliases: ["bank bni", "bank negara indonesia", "bni mobile", "wondr", "wondr by bni"],
  },
  bsi: {
    name: "BSI",
    kind: "bank",
    asset: "bsi.svg",
    aliases: ["bank bsi", "bank syariah indonesia", "bsi mobile"],
  },
  jago: {
    name: "Bank Jago",
    kind: "bank",
    asset: "jago.svg",
    aliases: ["jago", "pt bank jago tbk"],
  },
  blu: {
    name: "blu",
    kind: "bank",
    asset: "blu.png",
    aliases: ["blu by bca digital", "bca digital"],
  },
  seabank: { name: "SeaBank", kind: "bank", asset: "seabank.png", aliases: ["sea bank"] },
  jenius: { name: "Jenius", kind: "bank", asset: "jenius.svg" },
  danamon: { name: "Danamon", kind: "bank", asset: "danamon.svg", aliases: ["bank danamon"] },
  permata: {
    name: "PermataBank",
    kind: "bank",
    asset: "permata.png",
    aliases: ["permata", "bank permata"],
  },
  ocbc: {
    name: "OCBC",
    kind: "bank",
    asset: "ocbc.png",
    aliases: ["bank ocbc", "ocbc nisp", "bank ocbc nisp"],
  },
  dbs: {
    name: "DBS",
    kind: "bank",
    asset: "dbs.ico",
    aliases: ["bank dbs", "digibank", "digibank by dbs"],
  },
  maybank: { name: "Maybank", kind: "bank", asset: "maybank.svg", aliases: ["maybank indonesia"] },
  mega: { name: "Bank Mega", kind: "bank", asset: "mega.png" },
  allo: { name: "Allo Bank", kind: "bank", asset: "allo.png", aliases: ["allo"] },
  revolut: { name: "Revolut", kind: "bank", simple: "revolut" },
  wise: { name: "Wise", kind: "bank", simple: "wise" },
  // E-wallets
  gopay: { name: "GoPay", kind: "wallet", asset: "gopay.svg", aliases: ["go pay"] },
  ovo: { name: "OVO", kind: "wallet", asset: "ovo.png", aliases: ["ovo cash"] },
  dana: { name: "DANA", kind: "wallet", asset: "dana.ico" },
  shopeepay: { name: "ShopeePay", kind: "wallet", asset: "shopeepay.svg", aliases: ["shopee pay"] },
  paypal: { name: "PayPal", kind: "wallet", simple: "paypal" },
  // Merchants and services
  pln: {
    name: "PLN",
    kind: "merchant",
    asset: "pln.png",
    aliases: ["pln listrik", "token listrik", "pln mobile"],
  },
  pertamina: {
    name: "Pertamina",
    kind: "merchant",
    asset: "pertamina.svg",
    aliases: ["spbu pertamina", "mypertamina"],
  },
  shell: { name: "Shell", kind: "merchant", simple: "shell", aliases: ["spbu shell"] },
  telkomsel: {
    name: "Telkomsel",
    kind: "merchant",
    asset: "telkomsel.png",
    aliases: ["telkomsel data plan", "pulsa telkomsel", "mytelkomsel"],
  },
  indihome: { name: "IndiHome", kind: "merchant", asset: "indihome.png", aliases: ["indi home"] },
  xl: { name: "XL Axiata", kind: "merchant", asset: "xl.png", aliases: ["xl", "myxl"] },
  smartfren: { name: "Smartfren", kind: "merchant", asset: "smartfren.png" },
  biznet: { name: "Biznet", kind: "merchant", asset: "biznet.png", aliases: ["biznet home"] },
  bpjs: { name: "BPJS Kesehatan", kind: "merchant", asset: "bpjs.png", aliases: ["bpjs"] },
  grab: {
    name: "Grab",
    kind: "merchant",
    asset: "grab.png",
    aliases: [
      "grabcar",
      "grab · grabcar",
      "grabfood",
      "grab · grabfood",
      "grabbike",
      "grab · grabbike",
      "grabmart",
      "grab · grabmart",
    ],
  },
  gojek: {
    name: "Gojek",
    kind: "merchant",
    asset: "gojek.png",
    aliases: [
      "goride",
      "gojek · goride",
      "gocar",
      "gojek · gocar",
      "gofood",
      "gojek · gofood",
      "gomart",
      "gojek · gomart",
      "gosend",
      "gojek · gosend",
    ],
  },
  maxim: { name: "Maxim", kind: "merchant", asset: "maxim.png" },
  indrive: { name: "inDrive", kind: "merchant", asset: "indrive.ico" },
  bluebird: {
    name: "Bluebird",
    kind: "merchant",
    asset: "bluebird.png",
    aliases: ["blue bird", "taksi bluebird"],
  },
  uber: { name: "Uber", kind: "merchant", simple: "uber" },
  kai: {
    name: "KAI",
    kind: "merchant",
    asset: "kai.png",
    aliases: ["kai access", "kereta api indonesia", "kereta api"],
  },
  "lion-air": { name: "Lion Air", kind: "merchant", asset: "lion-air.ico" },
  airasia: { name: "AirAsia", kind: "merchant", simple: "airasia", aliases: ["air asia"] },
  traveloka: { name: "Traveloka", kind: "merchant", asset: "traveloka.ico" },
  agoda: { name: "Agoda", kind: "merchant", asset: "agoda.png" },
  booking: { name: "Booking.com", kind: "merchant", simple: "bookingdotcom", aliases: ["booking"] },
  airbnb: { name: "Airbnb", kind: "merchant", simple: "airbnb" },
  alfamart: { name: "Alfamart", kind: "merchant", asset: "alfamart.png" },
  indomaret: { name: "Indomaret", kind: "merchant", asset: "indomaret.png" },
  "lotte-mart": {
    name: "Lotte Mart",
    kind: "merchant",
    asset: "lotte-mart.png",
    aliases: ["lottemart"],
  },
  "circle-k": { name: "Circle K", kind: "merchant", asset: "circle-k.svg" },
  superindo: {
    name: "Superindo",
    kind: "merchant",
    asset: "superindo.png",
    aliases: ["super indo"],
  },
  hypermart: { name: "Hypermart", kind: "merchant", asset: "hypermart.png" },
  transmart: { name: "Transmart", kind: "merchant", asset: "transmart.png" },
  guardian: { name: "Guardian", kind: "merchant", asset: "guardian.png" },
  watsons: { name: "Watsons", kind: "merchant", asset: "watsons.png" },
  "kimia-farma": {
    name: "Kimia Farma",
    kind: "merchant",
    asset: "kimia-farma.jpg",
    aliases: ["apotek kimia farma"],
  },
  "ace-hardware": {
    name: "ACE Hardware",
    kind: "merchant",
    asset: "ace-hardware.svg",
    aliases: ["ace", "azko"],
  },
  ikea: { name: "IKEA", kind: "merchant", asset: "ikea.svg" },
  gramedia: { name: "Gramedia", kind: "merchant", asset: "gramedia.png" },
  uniqlo: { name: "Uniqlo", kind: "merchant", simple: "uniqlo" },
  zara: { name: "Zara", kind: "merchant", simple: "zara" },
  hm: { name: "H&M", kind: "merchant", simple: "handm", aliases: ["h & m", "h and m"] },
  nike: { name: "Nike", kind: "merchant", asset: "nike.png" },
  adidas: { name: "adidas", kind: "merchant", simple: "adidas" },
  tokopedia: { name: "Tokopedia", kind: "merchant", asset: "tokopedia.png" },
  shopee: { name: "Shopee", kind: "merchant", asset: "shopee.png" },
  lazada: { name: "Lazada", kind: "merchant", asset: "lazada.ico" },
  blibli: { name: "Blibli", kind: "merchant", asset: "blibli.png" },
  bukalapak: { name: "Bukalapak", kind: "merchant", asset: "bukalapak.ico" },
  zalora: { name: "Zalora", kind: "merchant", asset: "zalora.svg" },
  aliexpress: { name: "AliExpress", kind: "merchant", simple: "aliexpress" },
  amazon: { name: "Amazon", kind: "merchant", asset: "amazon.ico" },
  "kopi-kenangan": { name: "Kopi Kenangan", kind: "merchant", asset: "kopi-kenangan.webp" },
  "janji-jiwa": {
    name: "Janji Jiwa",
    kind: "merchant",
    asset: "janji-jiwa.png",
    aliases: ["kopi janji jiwa"],
  },
  fore: { name: "Fore Coffee", kind: "merchant", asset: "fore.png", aliases: ["fore"] },
  starbucks: { name: "Starbucks", kind: "merchant", asset: "starbucks.ico" },
  jco: {
    name: "J.CO",
    kind: "merchant",
    asset: "jco.png",
    aliases: ["jco", "j.co donuts", "j.co donuts & coffee"],
  },
  mcdonalds: {
    name: "McDonald's",
    kind: "merchant",
    asset: "mcdonalds.png",
    aliases: ["mcdonalds", "mcd"],
  },
  kfc: { name: "KFC", kind: "merchant", simple: "kfc" },
  "burger-king": { name: "Burger King", kind: "merchant", simple: "burgerking" },
  "pizza-hut": {
    name: "Pizza Hut",
    kind: "merchant",
    asset: "pizza-hut.png",
    aliases: ["pizzahut", "phd"],
  },
  dominos: {
    name: "Domino's Pizza",
    kind: "merchant",
    asset: "dominos.svg",
    aliases: ["domino's", "dominos"],
  },
  richeese: {
    name: "Richeese Factory",
    kind: "merchant",
    asset: "richeese.webp",
    aliases: ["richeese"],
  },
  cgv: { name: "CGV", kind: "merchant", asset: "cgv.png", aliases: ["cgv cinemas"] },
  netflix: { name: "Netflix", kind: "merchant", asset: "netflix.png" },
  spotify: {
    name: "Spotify",
    kind: "merchant",
    asset: "spotify.svg",
    aliases: ["spotify premium"],
  },
  "disney-plus": {
    name: "Disney+ Hotstar",
    kind: "merchant",
    asset: "disney-plus.svg",
    aliases: ["disney+", "disney plus", "disney+ hotstar"],
  },
  "prime-video": {
    name: "Prime Video",
    kind: "merchant",
    asset: "prime-video.png",
    aliases: ["amazon prime video"],
  },
  youtube: { name: "YouTube", kind: "merchant", simple: "youtube", aliases: ["youtube premium"] },
  "youtube-music": { name: "YouTube Music", kind: "merchant", simple: "youtubemusic" },
  "apple-music": { name: "Apple Music", kind: "merchant", simple: "applemusic" },
  "apple-tv": { name: "Apple TV+", kind: "merchant", simple: "appletv", aliases: ["apple tv"] },
  apple: {
    name: "Apple",
    kind: "merchant",
    simple: "apple",
    aliases: ["apple store", "apple.com/bill"],
  },
  icloud: { name: "iCloud+", kind: "merchant", simple: "icloud", aliases: ["icloud"] },
  "app-store": { name: "App Store", kind: "merchant", simple: "appstore" },
  "google-play": { name: "Google Play", kind: "merchant", simple: "googleplay" },
  google: {
    name: "Google",
    kind: "merchant",
    simple: "google",
    aliases: ["google one", "google workspace"],
  },
  microsoft: {
    name: "Microsoft",
    kind: "merchant",
    asset: "microsoft.ico",
    aliases: ["microsoft 365"],
  },
  adobe: { name: "Adobe", kind: "merchant", asset: "adobe.ico", aliases: ["adobe creative cloud"] },
  chatgpt: {
    name: "ChatGPT",
    kind: "merchant",
    asset: "chatgpt.svg",
    aliases: ["openai", "chatgpt plus"],
  },
  claude: {
    name: "Claude",
    kind: "merchant",
    simple: "claude",
    aliases: ["anthropic", "claude pro"],
  },
  notion: { name: "Notion", kind: "merchant", simple: "notion" },
  canva: { name: "Canva", kind: "merchant", asset: "canva.png", aliases: ["canva pro"] },
  vidio: { name: "Vidio", kind: "merchant", asset: "vidio.png", aliases: ["vidio premier"] },
  figma: { name: "Figma", kind: "merchant", simple: "figma" },
  github: { name: "GitHub", kind: "merchant", simple: "github", aliases: ["github copilot"] },
  dropbox: { name: "Dropbox", kind: "merchant", simple: "dropbox" },
  duolingo: { name: "Duolingo", kind: "merchant", simple: "duolingo", aliases: ["duolingo super"] },
  steam: { name: "Steam", kind: "merchant", simple: "steam" },
  playstation: {
    name: "PlayStation",
    kind: "merchant",
    simple: "playstation",
    aliases: ["playstation plus", "ps plus"],
  },
  xbox: { name: "Xbox", kind: "merchant", asset: "xbox.ico", aliases: ["xbox game pass"] },
  discord: { name: "Discord", kind: "merchant", simple: "discord", aliases: ["discord nitro"] },
  tiktok: { name: "TikTok", kind: "merchant", simple: "tiktok", aliases: ["tiktok shop"] },
} as const satisfies Record<string, BrandEntry>;

export type BrandIdentity = keyof typeof brands;
/** A registered brand, or any Simple Icons slug the user picked from the logo search. */
export type BrandLogo = BrandIdentity | `si:${string}`;

export function brandLabelKey(value: string | null | undefined) {
  return (
    value
      ?.normalize("NFKC")
      .trim()
      .replace(/\s+/g, " ")
      .replace(/\s*·\s*/g, " · ")
      .toLowerCase() ?? ""
  );
}

const lookup = new Map<string, BrandIdentity>();
for (const [id, entry] of Object.entries(brands) as [BrandIdentity, BrandEntry][]) {
  for (const label of [entry.name, id.replaceAll("-", " "), ...(entry.aliases ?? [])])
    lookup.set(brandLabelKey(label), id);
}

// Exact known labels only. Free-form notes, category names and account nicknames
// cannot establish a merchant or a bank's identity.
export function merchantBrand(merchant: string | null | undefined) {
  return lookup.get(brandLabelKey(merchant));
}

export function institutionBrand(institution: string | null | undefined) {
  const brand = merchantBrand(institution);
  return brand && brands[brand].kind !== "merchant" ? brand : undefined;
}

export function brandForName(name: string | null | undefined) {
  return merchantBrand(name);
}

export function isBrandIdentity(value: string): value is BrandIdentity {
  return Object.hasOwn(brands, value);
}

const simpleSlug = /^[a-z0-9]{1,60}$/;

export function brandLogoFromChoice(choice: string | null | undefined): BrandLogo | undefined {
  if (!choice) return undefined;
  if (choice.startsWith("brand:")) {
    const id = choice.slice(6);
    return isBrandIdentity(id) ? id : undefined;
  }
  if (choice.startsWith("si:") && simpleSlug.test(choice.slice(3))) return choice as BrandLogo;
  return undefined;
}

/** The value stored for a chosen logo, e.g. on a category's icon field. */
export function brandLogoChoice(logo: BrandLogo): string {
  return logo.startsWith("si:") ? logo : `brand:${logo}`;
}

/** The catalog slug behind a logo, so search results can skip duplicates. */
export function brandLogoSlug(logo: BrandLogo): string | undefined {
  if (logo.startsWith("si:")) return logo.slice(3);
  const entry: BrandEntry = brands[logo as BrandIdentity];
  return entry.simple;
}

export function brandLogoSource(logo: BrandLogo): string {
  if (logo.startsWith("si:")) return `/brand-icons/${logo.slice(3)}.svg`;
  const entry: BrandEntry = brands[logo as BrandIdentity];
  return entry.asset ? `/brands/${entry.asset}` : `/brand-icons/${entry.simple}.svg`;
}

/** Registered brands whose name or alias contains the query, best matches first. */
export function searchBrands(
  query: string,
  kinds: readonly BrandEntry["kind"][] = ["bank", "wallet", "merchant"],
  limit = 12,
): BrandIdentity[] {
  const text = brandLabelKey(query);
  if (text.length === 0) return [];
  const wanted = new Set(kinds);
  const scored: { id: BrandIdentity; score: number }[] = [];
  for (const [id, entry] of Object.entries(brands) as [BrandIdentity, BrandEntry][]) {
    if (!wanted.has(entry.kind)) continue;
    const labels = [entry.name, ...(entry.aliases ?? [])].map(brandLabelKey);
    const score = labels.some((label) => label === text)
      ? 0
      : labels.some((label) => label.startsWith(text))
        ? 1
        : labels.some((label) => label.includes(text))
          ? 2
          : -1;
    if (score >= 0) scored.push({ id, score });
  }
  return scored
    .sort(
      (left, right) =>
        left.score - right.score || brands[left.id].name.localeCompare(brands[right.id].name),
    )
    .slice(0, limit)
    .map(({ id }) => id);
}

export function brandsOfKind(kinds: readonly BrandEntry["kind"][]): BrandIdentity[] {
  const wanted = new Set(kinds);
  return (Object.keys(brands) as BrandIdentity[]).filter((id) => wanted.has(brands[id].kind));
}

export type BrandKind = BrandEntry["kind"];
