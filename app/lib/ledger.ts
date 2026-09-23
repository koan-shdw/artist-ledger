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
  automatic: z.boolean().optional(),
  vendor: z.string().max(255).optional(),
  agreementConfigured: z.boolean().optional(),
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
export const adjustmentSchema = z.object({
  net: cents.optional(),
  cost: cents.optional(),
  galleryBps: z.number().int().min(0).max(10000).optional(),
  note: z.string().max(1000).optional(),
});
export type SaleAdjustment = z.infer<typeof adjustmentSchema>;
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
export function importVendorArtists(data: Ledger): Ledger {
  const artists = data.artists.map((a) => ({ ...a }));
  for (const vendor of new Set(
    data.products.map((p) => p.vendor).filter((v): v is string => !!v),
  )) {
    if (artists.some((a) => a.vendor === vendor)) continue;
    const matches = artists.filter((a) => !a.vendor && a.name === vendor);
    if (matches.length === 1) matches[0].vendor = vendor;
    else
      artists.push({
        id: "vendor:" + vendor,
        name: vendor.slice(0, 120),
        vendor,
        email: "",
        galleryBps: 0,
        enabled: false,
        agreementConfigured: false,
      });
  }
  return {
    ...data,
    artists,
    products: linkVendorProducts(data.products, artists),
  };
}
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
      adjustments?: Record<string, SaleAdjustment>;
    }
  >;
  settings: Settings;
};
export type Report = {
  hasPdf?: boolean;
  artist: Artist;
  month: string;
  lines: (SaleLine & {
    cost: number;
    galleryBps?: number;
    originalNet?: number;
    originalCost?: number;
    note?: string;
    adjusted?: boolean;
  })[];
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
  hasPdf?: boolean;
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
      adjustments: z.record(adjustmentSchema).optional(),
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
      const edit = period?.adjustments?.[l.id];
      if (p.unitCost === null && edit?.cost === undefined)
        errors.push(`Set product cost for ${p.title}`);
      if (
        artist.agreementConfigured === false &&
        edit?.galleryBps === undefined
      )
        errors.push("Set the gallery percentage for this artist");
      return {
        ...l,
        net: edit?.net ?? l.net,
        cost: edit?.cost ?? (p.unitCost ?? 0) * l.quantity,
        galleryBps: edit?.galleryBps ?? artist.galleryBps,
        originalNet: l.net,
        originalCost: (p.unitCost ?? 0) * l.quantity,
        note: edit?.note,
        adjusted:
          !!edit &&
          (edit.net !== undefined ||
            edit.cost !== undefined ||
            edit.galleryBps !== undefined ||
            !!edit.note),
      };
    });
  const net = lines.reduce((n, l) => n + l.net, 0),
    cost = lines.reduce((n, l) => n + l.cost, 0);
  if (
    !Number.isSafeInteger(net) ||
    !Number.isSafeInteger(cost) ||
    lines.some((l) => !Number.isSafeInteger(l.cost))
  )
    throw Error("Amount exceeds the supported range");
  const groups = new Map<number, { net: number; cost: number }>();
  for (const line of lines) {
    const rate = line.galleryBps;
    const group = groups.get(rate) ?? { net: 0, cost: 0 };
    group.net += line.net;
    group.cost += line.cost;
    groups.set(rate, group);
  }
  const gallery = [...groups].reduce((sum, [rate, group]) => {
    const base =
      data.settings.basis === "after_costs"
        ? Math.max(0, group.net - group.cost)
        : group.net;
    return sum + Number((BigInt(base) * BigInt(rate) + 5000n) / 10000n);
  }, 0);
  const payout = net - cost - gallery;
  if (!artist.email) errors.push("Add an artist email address");
  if (!period) errors.push("Sync sales for this month");
  if (period?.warnings.length) errors.push(...period.warnings);
  if (!lines.length) errors.push("No included sales items");
  return {
    artist: {
      ...artist,
      agreementConfigured:
        artist.agreementConfigured === false &&
        lines.length > 0 &&
        lines.every(
          (l) => period?.adjustments?.[l.id]?.galleryBps !== undefined,
        )
          ? true
          : artist.agreementConfigured,
    },
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
export function monthLabel(month: string): string {
  if (month.includes(".."))
    return month.split("..").map(monthLabel).join(" – ");
  return new Date(month + "-01T12:00:00Z").toLocaleDateString("en", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
export function monthsBetween(from: string, to: string): string[] {
  const valid = /^\d{4}-(0[1-9]|1[0-2])$/;
  if (!valid.test(from) || !valid.test(to) || from > to)
    throw Error("Choose a valid From / To month range");
  const result: string[] = [];
  let current = from;
  while (current <= to) {
    result.push(current);
    const [year, month] = current.split("-").map(Number);
    current =
      month === 12
        ? `${year + 1}-01`
        : `${year}-${String(month + 1).padStart(2, "0")}`;
    if (result.length > 120) throw Error("Choose a range of up to 120 months");
  }
  return result;
}
export function rangeReport(
  data: Ledger,
  from: string,
  to: string,
  artistId: string,
): Report {
  const months = monthsBetween(from, to);
  const reports = months.map((month) => reportFor(data, month, artistId));
  const first = reports[0];
  const lines = reports.flatMap((r) =>
    r.lines.map((l) => ({
      ...l,
      order: `${l.order} · ${monthLabel(r.month)}`,
    })),
  );
  const net = reports.reduce((n, r) => n + r.net, 0);
  const cost = reports.reduce((n, r) => n + r.cost, 0);
  const gallery = reports.reduce((n, r) => n + r.gallery, 0);
  const errors = reports.flatMap((r) =>
    r.errors
      .filter((e) => e !== "No included sales items")
      .map((e) => `${monthLabel(r.month)}: ${e}`),
  );
  if (!lines.length) errors.push("No included sales items");
  return {
    ...first,
    month: from === to ? from : `${from}..${to}`,
    lines,
    net,
    cost,
    gallery,
    payout: net - cost - gallery,
    invoice: Math.max(0, net - cost - gallery),
    units: reports.reduce((n, r) => n + r.units, 0),
    errors: [...new Set(errors)],
  };
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
  const adjustments = r.lines
    .filter((l) => l.adjusted)
    .map(
      (l) =>
        `${l.order} | ${l.title} | gallery ${(l.galleryBps ?? r.artist.galleryBps) / 100}% | original sale ${money(l.originalNet ?? l.net, r.currency)} | original cost ${money(l.originalCost ?? l.cost, r.currency)}${l.note ? " | Note: " + l.note : ""}`,
    )
    .join("\n");
  return `${adjustments ? "Sale adjustments\n" + adjustments + "\n\n" : ""}${r.galleryName}\nArtist sales statement — ${monthLabel(r.month)}\n${r.artist.name}\n\n${r.lines.map((l) => `${l.title} | ${l.quantity} units | sales ${money(l.net, r.currency)} | costs ${money(l.cost, r.currency)}`).join("\n")}\n\nNet product sales: ${money(r.net, r.currency)}\nProduct costs: ${money(r.cost, r.currency)}\nGallery share (${r.lines.some((l) => l.galleryBps !== undefined && l.galleryBps !== r.artist.galleryBps) ? "sale-specific rates" : r.artist.galleryBps / 100 + "%"}, ${r.basis === "after_costs" ? "after product costs" : "of net sales"}): ${money(r.gallery, r.currency)}\nArtist balance: ${money(r.payout, r.currency)}\n\n${r.payout >= 0 ? `Please invoice ${r.galleryName} for ${money(r.invoice, r.currency)}.` : `No invoice is due. Negative balance ${money(r.payout, r.currency)} requires gallery review; it has not been carried forward.`}\n\nIncludes selected products from orders placed in ${monthLabel(r.month)}, net of refunds and removed quantities at sync. Tax and shipping excluded. Costs apply to remaining units.\n`;
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
