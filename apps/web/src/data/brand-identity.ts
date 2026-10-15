// Published, unchanged brand assets; provenance is in public/brands/README.md.
export const brands = {
  bca: { name: "BCA", asset: "bca.svg" },
  mandiri: { name: "Bank Mandiri", asset: "mandiri.png" },
  jago: { name: "Bank Jago", asset: "jago.svg" },
  gopay: { name: "GoPay", asset: "gopay.svg" },
  pln: { name: "PLN", asset: "pln.png" },
  spotify: { name: "Spotify", asset: "spotify.svg" },
  netflix: { name: "Netflix", asset: "netflix.png" },
  grab: { name: "Grab", asset: "grab.png" },
  gojek: { name: "Gojek", asset: "gojek.png" },
  "lotte-mart": { name: "Lotte Mart", asset: "lotte-mart.png" },
  alfamart: { name: "Alfamart", asset: "alfamart.png" },
  indomaret: { name: "Indomaret", asset: "indomaret.png" },
  "kopi-kenangan": { name: "Kopi Kenangan", asset: "kopi-kenangan.webp" },
  telkomsel: { name: "Telkomsel", asset: "telkomsel.png" },
  pertamina: { name: "Pertamina", asset: "pertamina.svg" },
} as const;

export type BrandIdentity = keyof typeof brands;

function normalized(value: string | null | undefined) {
  return value?.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase() ?? "";
}

const institutions: Readonly<Record<string, BrandIdentity>> = {
  bca: "bca",
  "bank bca": "bca",
  "bank central asia": "bca",
  "pt bank central asia tbk": "bca",
  mandiri: "mandiri",
  "bank mandiri": "mandiri",
  "pt bank mandiri (persero) tbk": "mandiri",
  jago: "jago",
  "bank jago": "jago",
  "pt bank jago tbk": "jago",
  gopay: "gopay",
  "go pay": "gopay",
};

const merchants: Readonly<Record<string, BrandIdentity>> = {
  spotify: "spotify",
  "spotify premium": "spotify",
  netflix: "netflix",
  grab: "grab",
  grabcar: "grab",
  "grab · grabcar": "grab",
  gojek: "gojek",
  goride: "gojek",
  "gojek · goride": "gojek",
  "lotte mart": "lotte-mart",
  lottemart: "lotte-mart",
  alfamart: "alfamart",
  indomaret: "indomaret",
  "kopi kenangan": "kopi-kenangan",
  telkomsel: "telkomsel",
  "telkomsel data plan": "telkomsel",
  pertamina: "pertamina",
  pln: "pln",
  "pln listrik": "pln",
};

// Exact known labels only. Free-form notes, category names and account nicknames
// cannot establish a merchant or a bank's identity.
export function institutionBrand(institution: string | null | undefined) {
  const key = normalized(institution);
  return Object.hasOwn(institutions, key) ? institutions[key] : undefined;
}

export function merchantBrand(merchant: string | null | undefined) {
  const key = normalized(merchant);
  return Object.hasOwn(merchants, key) ? merchants[key] : undefined;
}
