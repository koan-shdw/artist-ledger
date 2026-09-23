import { useEffect, useState, type ReactNode } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Checkbox } from "./ui/checkbox";
import { NumberEdit } from "./monthly-sales";
import OtherReportItems from "./other-report-items";
import type { OtherLine } from "../lib/ledger";
import {
  money,
  minorUnits,
  monthLabel,
  type Ledger,
  type Report,
  type SaleAdjustment,
} from "../lib/ledger";

export default function StatementReview({
  report,
  data,
  saved,
  busy,
  artistFields,
  onBack,
  onAdjust,
  onInclude,
  actions,
  messages,
  onOtherLines,
}: {
  report: Report;
  data: Ledger;
  saved: boolean;
  busy: boolean;
  artistFields: ReactNode;
  actions: ReactNode;
  messages: ReactNode;
  onBack: () => void;
  onAdjust: (id: string, patch: SaleAdjustment | null) => void;
  onInclude: (id: string, included: boolean) => void;
  onOtherLines: (lines: OtherLine[]) => void;
}) {
  const [editingOther, setEditingOther] = useState(false);
  useEffect(() => {
    document
      .querySelector(".statement-page")
      ?.scrollIntoView({ block: "start" });
  }, [report.artist.id]);
  const period = data.months[report.month];
  const currencyUnit = minorUnits(report.currency);
  const missingRate = report.artist.agreementConfigured === false;
  const lines = saved
    ? report.lines
    : (period?.lines ?? []).filter(
        (l) =>
          data.products.find((p) => p.id === l.productId)?.artistId ===
          report.artist.id,
      );
  return (
    <section className="main statement-page">
      <div className="content">
        <Button variant="ghost" onClick={onBack} disabled={editingOther}>
          ← Monthly reports
        </Button>
        <div className="page-heading">
          <div>
            <div className="eyebrow">ARTIST STATEMENT</div>
            <h1>{report.artist.name}</h1>
            <p>
              {monthLabel(report.month)} · {saved ? "Saved statement" : "Draft"}{" "}
              · {report.currency}
            </p>
          </div>
          <span>{report.units} units</span>
        </div>
        <div className="statement-agreement">{artistFields}</div>
        <div className="stats report-stats">
          {[
            ["Net product sales", report.net],
            ["Product costs", report.cost],
            ["Gallery share", report.gallery],
            ["Artist earnings", report.payout],
          ].map(([label, value], i) => (
            <div className={i === 3 ? "stat highlighted" : "stat"} key={label}>
              <span>{label}</span>
              <strong>
                {missingRate && i > 1
                  ? "—"
                  : money(value as number, report.currency)}
              </strong>
            </div>
          ))}
        </div>
        <div className="report-heading">
          <div>
            <h2>Review sales</h2>
            <p>
              {saved
                ? "This statement keeps the figures saved for delivery."
                : "Ready for review. Adjust only sales with special terms."}
            </p>
          </div>
          <span className="default-legend">Blue amounts use the defaults</span>
        </div>
        <div className="statement-table-scroll">
          <table className="statement-table">
            <thead>
              <tr>
                <th>Include</th>
                <th>Product / order / buyer</th>
                <th>Sale / unit</th>
                <th>Cost / unit</th>
                <th>Gallery %</th>
                <th>Artist / unit</th>
                <th>Artist total</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const product = data.products.find((p) => p.id === l.productId);
                const effective = report.lines.find((row) => row.id === l.id);
                const edit = period?.adjustments?.[l.id];
                const quantity = l.quantity || 1;
                const included =
                  saved ||
                  (!!product?.included && !period?.excluded.includes(l.id));
                const rate =
                  effective?.galleryBps ??
                  edit?.galleryBps ??
                  report.artist.galleryBps;
                const payout = effective?.payout;
                const ready =
                  included &&
                  (edit?.galleryBps !== undefined || !missingRate) &&
                  payout !== undefined;
                return (
                  <tr key={l.id} className={!included ? "excluded-sale" : ""}>
                    <td>
                      <Checkbox
                        aria-label={`Include ${l.title} ${l.order}`}
                        disabled={saved || busy || !product?.included}
                        checked={included}
                        onCheckedChange={(v) => onInclude(l.id, v === true)}
                      />
                    </td>
                    <td>
                      <strong>{l.title}</strong>
                      <small>
                        {l.quantity} {l.quantity === 1 ? "unit" : "units"} ·{" "}
                        {l.order} · {l.buyerName || "Buyer unavailable"}
                      </small>
                      {!saved && (
                        <Input
                          className="sale-note"
                          aria-label={`Adjustment note for ${l.order} ${l.title}`}
                          placeholder="Add adjustment note"
                          value={edit?.note ?? ""}
                          maxLength={1000}
                          disabled={busy}
                          onChange={(e) =>
                            onAdjust(l.id, { note: e.target.value })
                          }
                        />
                      )}
                      {saved && effective?.note && (
                        <small>{effective.note}</small>
                      )}
                    </td>
                    {(["net", "cost"] as const).map((field) => (
                      <td key={field}>
                        {saved ? (
                          money(
                            (field === "net" ? l.net : (effective?.cost ?? 0)) /
                              quantity,
                            report.currency,
                          )
                        ) : (
                          <NumberEdit
                            label={`${field === "net" ? "Sale" : "Cost"} per unit for ${l.order} ${l.title}`}
                            disabled={busy || !included}
                            value={
                              edit?.[field] === undefined
                                ? undefined
                                : edit[field]! / quantity / currencyUnit
                            }
                            defaultValue={
                              field === "net"
                                ? l.net / quantity / currencyUnit
                                : product?.unitCost == null
                                  ? undefined
                                  : product.unitCost / currencyUnit
                            }
                            onChange={(v) =>
                              onAdjust(l.id, {
                                [field]:
                                  v === undefined
                                    ? undefined
                                    : Math.round(v * quantity * currencyUnit),
                              })
                            }
                          />
                        )}
                      </td>
                    ))}
                    <td>
                      {saved ? (
                        `${rate / 100}%`
                      ) : (
                        <NumberEdit
                          label={`Gallery percentage for ${l.order} ${l.title}`}
                          percentage
                          disabled={busy || !included}
                          value={
                            edit?.galleryBps === undefined
                              ? undefined
                              : edit.galleryBps / 100
                          }
                          defaultValue={
                            missingRate
                              ? undefined
                              : report.artist.galleryBps / 100
                          }
                          onChange={(v) =>
                            onAdjust(l.id, {
                              galleryBps:
                                v === undefined
                                  ? undefined
                                  : Math.round(v * 100),
                            })
                          }
                        />
                      )}
                      <small>
                        {edit?.galleryBps !== undefined
                          ? "Adjusted"
                          : "Artist agreement"}
                      </small>
                    </td>
                    <td>
                      {ready ? money(payout / quantity, report.currency) : "—"}
                      <small>
                        {ready
                          ? `${(10000 - rate) / 100}% after ${report.basis === "after_costs" ? "costs" : "sales split"}`
                          : ""}
                      </small>
                    </td>
                    <td>
                      <strong>
                        {ready ? money(payout, report.currency) : "—"}
                      </strong>
                      {!saved && (
                        <Button
                          variant="ghost"
                          disabled={busy || !edit}
                          onClick={() => onAdjust(l.id, null)}
                        >
                          Reset
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="small-note">
          Buyer names are for internal review only and are excluded from artist
          PDFs and emails. Per-unit earnings are rounded for display; the sale
          total is authoritative.
        </p>
        <OtherReportItems
          key={report.artist.id + report.month}
          report={report}
          busy={busy || !period}
          saved={saved}
          onChange={onOtherLines}
          onEditingChange={setEditingOther}
        />
        {messages}
        {editingOther && (
          <p className="small-note">
            Apply or cancel this item before saving or sending the report.
          </p>
        )}
        <fieldset
          className="statement-footer"
          style={{ border: 0, padding: 0, margin: 0 }}
          disabled={editingOther}
        >
          {actions}
        </fieldset>
      </div>
    </section>
  );
}
