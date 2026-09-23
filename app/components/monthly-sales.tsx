import { useEffect, useState } from "react";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "./ui/select";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { Search, RefreshCw, FileText, Download, Mail } from "lucide-react";
import { Input } from "./ui/input";
import {
  type Ledger,
  type Report,
  monthsBetween,
  rangeReport,
  type Sent,
  type SaleAdjustment,
  minorUnits,
  money,
  monthLabel,
} from "../lib/ledger";

export function NumberEdit({
  value,
  onChange,
  label,
  disabled,
  percentage = false,
  defaultValue,
}: {
  value: number | undefined;
  defaultValue?: number;
  onChange: (v: number | undefined) => void;
  label: string;
  disabled: boolean;
  percentage?: boolean;
}) {
  const display = value ?? defaultValue;
  const [raw, setRaw] = useState(display === undefined ? "" : String(display));
  useEffect(
    () => setRaw(display === undefined ? "" : String(display)),
    [display],
  );
  return (
    <Input
      aria-label={label}
      type="number"
      min="0"
      max={percentage ? 100 : undefined}
      step="0.01"
      disabled={disabled}
      value={raw}
      className={
        value === undefined && raw === String(defaultValue ?? "")
          ? "sale-default"
          : ""
      }
      placeholder="Not set"
      onChange={(e) => setRaw(e.target.value)}
      onBlur={(e) => {
        if (raw === String(display ?? "")) return;
        const n = Number(raw);
        if (raw === "") {
          onChange(undefined);
          setRaw(defaultValue === undefined ? "" : String(defaultValue));
        } else if (Number.isFinite(n) && n >= 0 && (!percentage || n <= 100))
          onChange(n);
        else {
          e.currentTarget.setCustomValidity(
            "Enter a valid non-negative amount",
          );
          e.currentTarget.reportValidity();
          setRaw(display === undefined ? "" : String(display));
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
  dirty,
  onSync,
  onPdf,
  onSend,
  emailReady,
}: {
  dirty: boolean;
  emailReady: boolean;
  onSync: (months: string[]) => Promise<void>;
  onPdf: (reports: Report[]) => Promise<void>;
  onSend: (from: string, to: string, ids: string[]) => Promise<void>;
  data: Ledger;
  month: string;
  sent: Sent[];
  busy: boolean;
  onChange: (d: Ledger) => void;
}) {
  const [search, setSearch] = useState("");
  const [artistFilter, setArtistFilter] = useState("all");
  const [from, setFrom] = useState(month);
  const [to, setTo] = useState(month);
  const [range, setRange] = useState(false);
  const [preview, setPreview] = useState(false);
  const [recipients, setRecipients] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [deliveryError, setDeliveryError] = useState("");
  const unit = minorUnits(data.settings.currency);
  let months: string[] = [],
    rangeError = "";
  try {
    months = monthsBetween(from, range ? to : from);
  } catch (e) {
    rangeError = (e as Error).message;
  }
  const missing = months.filter((m) => !data.months[m]);
  const allRows = months.flatMap((m) =>
    (data.months[m]?.lines ?? []).map((line) => ({ ...line, sourceMonth: m })),
  );
  const rows = allRows.filter((l) => {
    const product = data.products.find((p) => p.id === l.productId);
    const artist = data.artists.find((a) => a.id === product?.artistId);
    return (
      (artistFilter === "all" || artistFilter === artist?.id) &&
      (l.order + " " + l.title).toLowerCase().includes(search.toLowerCase())
    );
  });
  const reports = months.length
    ? data.artists
        .filter((a) => artistFilter === "all" || a.id === artistFilter)
        .map((a) => rangeReport(data, from, range ? to : from, a.id))
        .filter((r) => r.lines.length)
    : [];
  const chosen = reports.filter((r) => recipients.includes(r.artist.id));
  function update(month: string, id: string, edit: SaleAdjustment | undefined) {
    const period = data.months[month];
    const adjustments = { ...period.adjustments };
    if (edit) adjustments[id] = edit;
    else delete adjustments[id];
    onChange({
      ...data,
      months: { ...data.months, [month]: { ...period, adjustments } },
    });
  }
  return (
    <section className="monthly-sales">
      <div className="sales-filters">
        <label className="sales-filter">
          Artist
          <Select value={artistFilter} onValueChange={setArtistFilter}>
            <SelectTrigger aria-label="Filter by artist">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All artists</SelectItem>
              {[...data.artists]
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </label>
        <label className="sales-filter">
          Period
          <Select
            value={range ? "range" : "month"}
            onValueChange={(v) => {
              setRange(v === "range");
              setTo(from);
            }}
          >
            <SelectTrigger aria-label="Period type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="month">Single month</SelectItem>
              <SelectItem value="range">From / To</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <label className="sales-filter">
          {range ? "From" : "Month"}
          <Input
            type="month"
            aria-label="From month"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        {range && (
          <label className="sales-filter">
            To
            <Input
              type="month"
              aria-label="To month"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
        )}
      </div>
      <div className="report-heading">
        <div>
          <h2>
            Sales review <span className="count">{rows.length}</span>
          </h2>
          <p>
            Default amounts are blue. Edit a sale to override its amount, cost
            or gallery share.
          </p>
        </div>
        <div className="actions">
          <Button
            variant="outline"
            disabled={busy || dirty || !months.length}
            onClick={() => onSync(months)}
          >
            <RefreshCw /> Sync sales
          </Button>
          <Button
            disabled={
              busy ||
              dirty ||
              !reports.length ||
              !!missing.length ||
              !!rangeError
            }
            onClick={() => {
              setRecipients(reports.map((r) => r.artist.id));
              setDeliveryError("");
              setPreview(true);
            }}
          >
            <FileText /> Create manual report
          </Button>
        </div>
      </div>
      {rangeError && <div className="message error">{rangeError}</div>}
      {!!missing.length && (
        <div className="message">
          Sync sales for: {missing.map(monthLabel).join(", ")}. Reports require
          all months in the selected period.
        </div>
      )}
      {dirty && (
        <p className="small-note">Save changes before creating your report.</p>
      )}
      <div className="table-toolbar">
        <span className="small-note">
          {rows.length} of {allRows.length} sales items ·{" "}
          {data.settings.currency}
        </span>
        <div className="searchbox">
          <Search size={16} />
          <Input
            aria-label="Search monthly sales"
            placeholder="Search product or order"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>
      <div className="tablewrap">
        <table className="sales-table">
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
              const month = line.sourceMonth,
                period = data.months[month];
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
                <tr key={month + line.id}>
                  <td>
                    <Checkbox
                      aria-label={`Include ${line.order} ${line.title}`}
                      disabled={disabled || !product?.included}
                      checked={
                        !!product?.included &&
                        !period.excluded.includes(line.id)
                      }
                      onCheckedChange={(checked) =>
                        onChange({
                          ...data,
                          months: {
                            ...data.months,
                            [month]: {
                              ...period,
                              excluded:
                                checked === true
                                  ? period.excluded.filter(
                                      (id) => id !== line.id,
                                    )
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
                    {range && (
                      <small className="subtext">{monthLabel(month)}</small>
                    )}
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
                      defaultValue={line.net / unit}
                      label={`Sale amount for ${line.order} ${line.title}`}
                      value={
                        edit?.net === undefined ? undefined : edit.net / unit
                      }
                      disabled={disabled}
                      onChange={(v) =>
                        update(month, line.id, {
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
                      defaultValue={
                        originalCost === undefined
                          ? undefined
                          : originalCost / unit
                      }
                      label={`Total cost for ${line.order} ${line.title}`}
                      value={
                        edit?.cost === undefined ? undefined : edit.cost / unit
                      }
                      disabled={disabled}
                      onChange={(v) =>
                        update(month, line.id, {
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
                      defaultValue={
                        !artist || artist.agreementConfigured === false
                          ? undefined
                          : artist.galleryBps / 100
                      }
                      label={`Gallery percentage for ${line.order} ${line.title}`}
                      percentage
                      value={
                        edit?.galleryBps === undefined
                          ? undefined
                          : edit.galleryBps / 100
                      }
                      disabled={disabled}
                      onChange={(v) =>
                        update(month, line.id, {
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
                        update(month, line.id, {
                          ...edit,
                          note: e.target.value,
                        })
                      }
                    />
                  </td>
                  <td>
                    <Button
                      variant="ghost"
                      disabled={disabled || !edit}
                      onClick={() => update(month, line.id, undefined)}
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
      <div className="report-heading sales-totals-heading">
        <div>
          <h2>Artist totals</h2>
          <p>
            Included sales across the selected period. Totals update after you
            finish editing a field.
          </p>
        </div>
      </div>
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
            {reports.map((r) => {
              const a = r.artist;
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
      <Dialog open={preview} onOpenChange={setPreview}>
        <DialogContent className="manual-report-dialog">
          <DialogTitle>Manual artist reports</DialogTitle>
          <DialogDescription>
            {months.length
              ? monthLabel(
                  from === (range ? to : from) ? from : from + ".." + to,
                )
              : ""}{" "}
            · Select recipients and review their amounts.
          </DialogDescription>
          <div className="manual-report-list">
            {reports.map((r) => (
              <div key={r.artist.id} className="manual-report-row">
                <Checkbox
                  aria-label={"Send manual report to " + r.artist.name}
                  checked={recipients.includes(r.artist.id)}
                  onCheckedChange={(v) =>
                    setRecipients(
                      v
                        ? [...recipients, r.artist.id]
                        : recipients.filter((id) => id !== r.artist.id),
                    )
                  }
                />
                <div>
                  <strong>{r.artist.name}</strong>
                  <small>{r.artist.email || "Add artist email"}</small>
                  <small>
                    {r.lines.length} sales items · Sales{" "}
                    {money(r.net, r.currency)} · Costs{" "}
                    {money(r.cost, r.currency)} · Gallery{" "}
                    {money(r.gallery, r.currency)}
                  </small>
                  {r.errors.length > 0 && (
                    <small className="manual-error">
                      {r.errors.join(". ")}
                    </small>
                  )}
                </div>
                <strong>{money(r.invoice, r.currency)}</strong>
              </div>
            ))}
          </div>
          <p className="small-note">
            Each artist receives a separate statement of the included sales and
            adjustments. Manual reports are independent of automatic monthly
            reports.
          </p>
          {!emailReady && (
            <div className="message">
              Email sender setup is required before sending. PDF export is
              available.
            </div>
          )}
          {deliveryError && (
            <div role="alert" className="message error">
              {deliveryError}
            </div>
          )}
          <div className="actions">
            <Button
              variant="outline"
              disabled={busy || sending || !chosen.length}
              onClick={() => onPdf(chosen)}
            >
              <Download /> Export PDF
            </Button>
            <Button
              disabled={
                busy ||
                sending ||
                !emailReady ||
                !chosen.length ||
                chosen.some((r) => r.errors.length || r.payout < 0)
              }
              onClick={async () => {
                setSending(true);
                setDeliveryError("");
                try {
                  await onSend(from, range ? to : from, recipients);
                  setPreview(false);
                } catch (e) {
                  setDeliveryError((e as Error).message);
                } finally {
                  setSending(false);
                }
              }}
            >
              <Mail /> {sending ? "Sending…" : "Send to artists"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
