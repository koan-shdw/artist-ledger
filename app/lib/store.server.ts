import db from "../db.server";
import { emptyLedger, ledgerSchema, type Ledger } from "./ledger";
export async function getWorkspace(shop: string) {
  return db.galleryWorkspace.upsert({
    where: { shop },
    create: { shop, payload: JSON.stringify(emptyLedger()) },
    update: {},
  });
}
export async function saveWorkspace(
  shop: string,
  version: number,
  value: Ledger,
) {
  const result = await db.galleryWorkspace.updateMany({
    where: { shop, version },
    data: { payload: JSON.stringify(value), version: { increment: 1 } },
  });
  if (!result.count)
    throw Error(
      "This workspace changed in another session. Reload before saving.",
    );
  return version + 1;
}
export function parseEdits(incoming: unknown, current: Ledger): Ledger {
  const value = ledgerSchema.parse(incoming);
  if (new Set(value.artists.map((a) => a.id)).size !== value.artists.length)
    throw Error("Duplicate artist IDs");
  if (
    value.products.some(
      (p) => p.artistId && !value.artists.some((a) => a.id === p.artistId),
    )
  )
    throw Error("Select an existing artist for each product");
  if (
    Object.keys(current.months).length &&
    value.settings.currency !== current.settings.currency
  )
    throw Error("Currency is set by Shopify");
  if (
    new Set(value.products.map((p) => p.id)).size !== value.products.length ||
    value.products.length !== current.products.length ||
    value.products.some((p) => !current.products.some((c) => c.id === p.id))
  )
    throw Error("Sync Shopify to add products");
  return {
    ...current,
    settings: value.settings,
    artists: value.artists,
    products: current.products.map((p) => {
      const v = value.products.find((v) => v.id === p.id)!;
      return {
        ...p,
        artistId: v.artistId,
        unitCost: v.unitCost,
        included: v.included,
      };
    }),
    months: Object.fromEntries(
      Object.entries(current.months).map(([key, m]) => [
        key,
        {
          ...m,
          excluded: (value.months[key]?.excluded ?? m.excluded).filter((id) =>
            m.lines.some((l) => l.id === id),
          ),
        },
      ]),
    ),
  };
}
