import { useEffect, useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  type Ledger,
  type Sent,
  type SaleAdjustment,
  minorUnits,
  money,
  monthLabel,
  reportFor,
} from "../lib/ledger";

function NumberEdit({
  value,
  onChange,
  label,
  disabled,
  percentage = false,
}: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  label: string;
  disabled: boolean;
  percentage?: boolean;
}) {
  const [raw, setRaw] = useState(value === undefined ? "" : String(value));
  useEffect(() => setRaw(value === undefined ? "" : String(value)), [value]);
  return (
    <Input
      aria-label={label}
      type="number"
      min="0"
      max={percentage ? 100 : undefined}
      step="0.01"
      disabled={disabled}
      value={raw}
      placeholder="Default"
      onChange={(e) => setRaw(e.target.value)}
      onBlur={(e) => {
        const n = Number(raw);
        if (raw === "") onChange(undefined);
        else if (Number.isFinite(n) && n >= 0 && (!percentage || n <= 100))
          onChange(n);
        else {
          e.currentTarget.setCustomValidity(
            "Enter a valid non-negative amount",
          );
          e.currentTarget.reportValidity();
          setRaw(value === undefined ? "" : String(value));
        }
      }}
      onInput={(e) => e.currentTarget.setCustomValidity("")}
    />
  );
}
export default function MonthlySales({
  data,
  month,
  sent,
  busy,
  onChange,
}: {
  data: Ledger;
  month: string;
  sent: Sent[];
  busy: boolean;
  onChange: (d: Ledger) => void;
}) {
  const [search, setSearch] = useState("");
  const period = data.months[month],
    unit = minorUnits(data.settings.currency);
  if (!period)
    return (
      <p>
        Sync Shopify sales for {monthLabel(month)} to open this month's sales.
      </p>
    );
  const rows = period.lines.filter((l) => {
    const p = data.products.find((p) => p.id === l.productId);
    const a = data.artists.find((a) => a.id === p?.artistId);
    return `${l.order} ${l.title} ${a?.name ?? ""}`
      .toLowerCase()
      .includes(search.toLowerCase());
  });
  function update(id: string, edit: SaleAdjustment | undefined) {
    const adjustments = { ...period.adjustments };
    if (edit) adjustments[id] = edit;
    else delete adjustments[id];
    onChange({
      ...data,
      months: { ...data.months, [month]: { ...period, adjustments } },
    });
  }
  return (
    <>
      <p>
        Edit the total sale amount, total product cost, or gallery percentage
        for any sale. Blank fields use the original amount or default agreement.
        Changes apply to this month only. Save before exporting or sending.
      </p>
      <Input
        aria-label="Search monthly sales"
        placeholder="Search artist, product or order"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <p>
        {rows.length} of {period.lines.length} sales items ·{" "}
        {data.settings.currency}
      </p>
      <div className="tablewrap">
        <table style={{ minWidth: 1320 }}>
          <thead>
            <tr>
              {[
                "Include",
                "Order / product",
                "Artist",
                "Units",
                "Sale amount",
                "Total cost",
                "Gallery %",
                "Adjustment note",
                "",
              ].map((t) => (
                <th key={t}>{t}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((line) => {
              const product = data.products.find(
                  (p) => p.id === line.productId,
                ),
                artist = data.artists.find((a) => a.id === product?.artistId),
                edit = period.adjustments?.[line.id];
              const frozen = sent.some(
                (s) =>
                  s.month === month &&
                  (s.artistId === artist?.id ||
                    s.snapshot.lines.some((l) => l.id === line.id)),
              );
              const disabled = busy || frozen,
                originalCost =
                  product?.unitCost === null || product?.unitCost === undefined
                    ? undefined
                    : product.unitCost * line.quantity;
              return (
                <tr key={line.id}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Include ${line.order} ${line.title}`}
                      disabled={disabled || !product?.included}
                      checked={
                        !!product?.included &&
                        !period.excluded.includes(line.id)
                      }
                      onChange={(e) =>
                        onChange({
                          ...data,
                          months: {
                            ...data.months,
                            [month]: {
                              ...period,
                              excluded: e.target.checked
                                ? period.excluded.filter((id) => id !== line.id)
                                : [...period.excluded, line.id],
                            },
                          },
                        })
                      }
                    />
                  </td>
                  <td style={{ maxWidth: 260 }}>
                    <strong>{line.order}</strong>
                    <br />
                    {line.title}
                    {frozen && (
                      <small style={{ display: "block" }}>
                        Saved statement - locked
                      </small>
                    )}
                  </td>
                  <td>{artist?.name ?? "Unassigned"}</td>
                  <td>{line.quantity}</td>
                  <td style={{ minWidth: 145 }}>
                    <NumberEdit
                      label={`Sale amount for ${line.order} ${line.title}`}
                      value={
                        edit?.net === undefined ? undefined : edit.net / unit
                      }
                      disabled={disabled}
                      onChange={(v) =>
                        update(line.id, {
                          ...edit,
                          net:
                            v === undefined ? undefined : Math.round(v * unit),
                        })
                      }
                    />
                    <small>
                      Original: {money(line.net, data.settings.currency)}
                    </small>
                  </td>
                  <td style={{ minWidth: 145 }}>
                    <NumberEdit
                      label={`Total cost for ${line.order} ${line.title}`}
                      value={
                        edit?.cost === undefined ? undefined : edit.cost / unit
                      }
                      disabled={disabled}
                      onChange={(v) =>
                        update(line.id, {
                          ...edit,
                          cost:
                            v === undefined ? undefined : Math.round(v * unit),
                        })
                      }
                    />
                    <small>
                      Default:{" "}
                      {originalCost === undefined
                        ? "Not set"
                        : money(originalCost, data.settings.currency)}
                    </small>
                  </td>
                  <td style={{ minWidth: 110 }}>
                    <NumberEdit
                      label={`Gallery percentage for ${line.order} ${line.title}`}
                      percentage
                      value={
                        edit?.galleryBps === undefined
                          ? undefined
                          : edit.galleryBps / 100
                      }
                      disabled={disabled}
                      onChange={(v) =>
                        update(line.id, {
                          ...edit,
                          galleryBps:
                            v === undefined ? undefined : Math.round(v * 100),
                        })
                      }
                    />
                    <small>
                      Default:{" "}
                      {!artist || artist.agreementConfigured === false
                        ? "Not set"
                        : `${artist.galleryBps / 100}%`}
                    </small>
                  </td>
                  <td style={{ minWidth: 210 }}>
                    <Input
                      aria-label={`Adjustment note for ${line.order} ${line.title}`}
                      maxLength={1000}
                      disabled={disabled}
                      value={edit?.note ?? ""}
                      onChange={(e) =>
                        update(line.id, { ...edit, note: e.target.value })
                      }
                    />
                  </td>
                  <td>
                    <Button
                      variant="ghost"
                      disabled={disabled || !edit}
                      onClick={() => update(line.id, undefined)}
                    >
                      Reset
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <h2>Artist totals after adjustments</h2>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>Artist</th>
              <th>Sales</th>
              <th>Costs</th>
              <th>Gallery share</th>
              <th>Artist balance</th>
            </tr>
          </thead>
          <tbody>
            {data.artists.map((a) => {
              const r =
                sent.find((s) => s.month === month && s.artistId === a.id)
                  ?.snapshot ?? reportFor(data, month, a.id);
              return (
                <tr key={a.id}>
                  <td>{a.name}</td>
                  {[r.net, r.cost, r.gallery, r.payout].map((n, i) => (
                    <td key={i}>
                      {i >= 2 &&
                      r.errors.some((e) => e.includes("gallery percentage"))
                        ? "Set percentage"
                        : money(n, data.settings.currency)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
