import { z } from "zod";
const cents = z.number().int().min(0).max(1_000_000_000_000);
export const artistSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  email: z
    .string()
    .trim()
    .max(254)
    .refine(
      (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
      "Enter a valid email",
    ),
  galleryBps: z.number().int().min(0).max(10000),
  enabled: z.boolean(),
  vendor: z.string().max(255).optional(),
});
export const productSchema = z.object({
  id: z.string(),
  title: z.string().max(300),
  sku: z.string().max(150),
  vendor: z.string().max(255).optional(),
  artistId: z.string(),
  unitCost: cents.nullable(),
  included: z.boolean(),
});
export const lineSchema = z.object({
  id: z.string(),
  productId: z.string(),
  title: z.string(),
  quantity: z.number().int().min(0).max(1000000),
  net: cents,
  order: z.string(),
});
export const settingsSchema = z.object({
  galleryName: z.string().trim().min(1).max(150),
  currency: z.enum(["USD", "GBP", "EUR", "AUD", "CAD", "NZD", "JPY"]),
  basis: z.enum(["after_costs", "sales"]),
  automatic: z.boolean(),
  replyTo: z
    .string()
    .trim()
    .refine(
      (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
      "Enter a valid reply-to email",
    ),
});
export type Artist = z.infer<typeof artistSchema>;
export type Product = z.infer<typeof productSchema>;
export function linkVendorProducts(
  products: Product[],
  artists: Artist[],
): Product[] {
  const vendors = new Map<string, string>();
  for (const artist of artists) {
    if (!artist.vendor) continue;
    if (vendors.has(artist.vendor))
      throw Error("Each Shopify vendor can be linked to only one artist.");
    vendors.set(artist.vendor, artist.id);
  }
  return products.map((product) => {
    const linked = product.vendor ? vendors.get(product.vendor) : undefined;
    const previous = artists.find((artist) => artist.id === product.artistId);
    return {
      ...product,
      artistId:
        linked ??
        (previous?.vendor && product.vendor !== undefined
          ? ""
          : product.artistId),
    };
  });
}
export type SaleLine = z.infer<typeof lineSchema>;
export type Settings = z.infer<typeof settingsSchema>;
export type Ledger = {
  artists: Artist[];
  products: Product[];
  months: Record<
    string,
    {
      lines: SaleLine[];
      excluded: string[];
      syncedAt: string;
      warnings: string[];
    }
  >;
  settings: Settings;
};
export type Report = {
  artist: Artist;
  month: string;
  lines: (SaleLine & { cost: number })[];
  net: number;
  cost: number;
  gallery: number;
  payout: number;
  invoice: number;
  units: number;
  errors: string[];
  currency: Settings["currency"];
  basis: Settings["basis"];
  galleryName: string;
  replyTo: string;
};
export type Sent = {
  id: string;
  artistId: string;
  month: string;
  status: string;
  createdAt: string;
  snapshot: Report;
  error?: string;
};
export const ledgerSchema = z.object({
  artists: z.array(artistSchema).max(2000),
  products: z.array(productSchema).max(50000),
  months: z.record(
    z.object({
      lines: z.array(lineSchema).max(100000),
      excluded: z.array(z.string()),
      syncedAt: z.string(),
      warnings: z.array(z.string()),
    }),
  ),
  settings: settingsSchema,
});
export function emptyLedger(): Ledger {
  return {
    artists: [],
    products: [],
    months: {},
    settings: {
      galleryName: "Your gallery",
      currency: "USD",
      basis: "after_costs",
      automatic: false,
      replyTo: "",
    },
  };
}
export function reportFor(
  data: Ledger,
  month: string,
  artistId: string,
): Report {
  const artist = data.artists.find((a) => a.id === artistId);
  if (!artist) throw Error("Artist not found");
  const period = data.months[month];
  const errors: string[] = [];
  const lines = (period?.lines ?? [])
    .filter((l) => {
      const p = data.products.find((p) => p.id === l.productId);
      return (
        p?.artistId === artistId &&
        p.included &&
        !period?.excluded.includes(l.id)
      );
    })
    .map((l) => {
      const p = data.products.find((p) => p.id === l.productId)!;
      if (p.unitCost === null) errors.push(`Set product cost for ${p.title}`);
      return { ...l, cost: (p.unitCost ?? 0) * l.quantity };
    });
  const net = lines.reduce((n, l) => n + l.net, 0),
    cost = lines.reduce((n, l) => n + l.cost, 0);
  const base =
    data.settings.basis === "after_costs" ? Math.max(0, net - cost) : net;
  if (
    !Number.isSafeInteger(net) ||
    !Number.isSafeInteger(cost) ||
    lines.some((l) => !Number.isSafeInteger(l.cost))
  )
    throw Error("Amount exceeds the supported range");
  const gallery = Number(
    (BigInt(base) * BigInt(artist.galleryBps) + BigInt(5000)) / BigInt(10000),
  );
  const payout = net - cost - gallery;
  if (!artist.email) errors.push("Add an artist email address");
  if (!period) errors.push("Sync sales for this month");
  if (period?.warnings.length) errors.push(...period.warnings);
  if (!lines.length) errors.push("No included sales items");
  return {
    artist: { ...artist },
    month,
    lines,
    net,
    cost,
    gallery,
    payout,
    invoice: Math.max(0, payout),
    units: lines.reduce((n, l) => n + l.quantity, 0),
    errors: [...new Set(errors)],
    currency: data.settings.currency,
    basis: data.settings.basis,
    galleryName: data.settings.galleryName,
    replyTo: data.settings.replyTo,
  };
}
export function minorUnits(currency: string) {
  return currency === "JPY" ? 1 : 100;
}
export function money(amount: number, currency = "USD") {
  return new Intl.NumberFormat("en", { style: "currency", currency }).format(
    amount / minorUnits(currency),
  );
}
export function monthLabel(month: string) {
  return new Date(month + "-01T12:00:00Z").toLocaleDateString("en", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
export function previousMonth(now = new Date()) {
  const d = new Date(now);
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7);
}
export function demoLedger(): Ledger {
  const d = emptyLedger();
  d.settings.galleryName = "The Gallery";
  const names = [
    "Alex Morgan",
    "Yuki Tanaka",
    "Sofia Rivera",
    "Oliver Chen",
    "Isabel Reed",
    "James Wilson",
  ];
  d.artists = names.map((name, i) => ({
    id: `a${i}`,
    name,
    email: name.toLowerCase().replace(" ", ".") + "@example.com",
    galleryBps: [4000, 4000, 3500, 4000, 3000, 4000][i],
    enabled: i !== 5,
  }));
  const titles = [
    "Coastal study · Print",
    "Blue hour · Art print",
    "Morning light · Framed print",
    "Still life No. 4 · Canvas",
    "Soft forms · Ceramic",
    "Botanical series · Print",
  ];
  d.products = titles.flatMap((title, i) => [
    {
      id: `p${i}`,
      title,
      sku: `ART-0${i + 1}`,
      artistId: `a${i}`,
      unitCost: [4000, 4000, 3600, 4000, 4000, 3000][i],
      included: true,
    },
    {
      id: `p${i}b`,
      title: title.split(" · ")[0] + " · Postcard set",
      sku: `ART-0${i + 1}-PC`,
      artistId: `a${i}`,
      unitCost: 500,
      included: true,
    },
  ]);
  for (const [month, factor] of [
    ["2026-08", 1],
    ["2026-07", 0.8],
    ["2026-06", 0.65],
  ] as const)
    d.months[month] = {
      syncedAt: "2026-09-01T09:00:00.000Z",
      excluded: [],
      warnings: [],
      lines: titles.flatMap((title, i) => [
        {
          id: `${month}-l${i}`,
          productId: `p${i}`,
          title,
          quantity: Math.round([40, 34, 26, 22, 16, 14][i] * factor),
          net: Math.round(
            [660000, 508000, 400000, 341000, 262000, 166000][i] * factor,
          ),
          order: `#${1080 + i}`,
        },
        {
          id: `${month}-l${i}b`,
          productId: `p${i}b`,
          title: d.products[i * 2 + 1].title,
          quantity: Math.round(4 * factor),
          net: Math.round(24000 * factor),
          order: `#${1110 + i}`,
        },
      ]),
    };
  return d;
}
export function reportText(r: Report) {
  return `${r.galleryName}\nArtist sales statement — ${monthLabel(r.month)}\n${r.artist.name}\n\n${r.lines.map((l) => `${l.title} | ${l.quantity} units | sales ${money(l.net, r.currency)} | costs ${money(l.cost, r.currency)}`).join("\n")}\n\nNet product sales: ${money(r.net, r.currency)}\nProduct costs: ${money(r.cost, r.currency)}\nGallery share (${r.artist.galleryBps / 100}%, ${r.basis === "after_costs" ? "after product costs" : "of net sales"}): ${money(r.gallery, r.currency)}\nArtist balance: ${money(r.payout, r.currency)}\n\n${r.payout >= 0 ? `Please invoice ${r.galleryName} for ${money(r.invoice, r.currency)}.` : `No invoice is due. Negative balance ${money(r.payout, r.currency)} requires gallery review; it has not been carried forward.`}\n\nIncludes selected products from orders placed in ${monthLabel(r.month)}, net of refunds and removed quantities at sync. Tax and shipping excluded. Costs apply to remaining units.\n`;
}
export function csvCell(value: unknown) {
  let s = String(value ?? "");
  if (/^[=+@\-\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
}
export function reportsCsv(reports: Report[]) {
  return [
    [
      "Month",
      "Artist",
      "Email",
      "Currency",
      "Net sales",
      "Product costs",
      "Gallery %",
      "Gallery share",
      "Artist balance",
      "Invoice amount",
    ],
    ...reports.map((r) => [
      r.month,
      r.artist.name,
      r.artist.email,
      r.currency,
      r.net / minorUnits(r.currency),
      r.cost / minorUnits(r.currency),
      r.artist.galleryBps / 100,
      r.gallery / minorUnits(r.currency),
      r.payout / minorUnits(r.currency),
      r.invoice / minorUnits(r.currency),
    ]),
  ]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n");
}
