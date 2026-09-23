import { useState, useEffect } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  minorUnits,
  money,
  otherLineAmount,
  otherLineSchema,
  type OtherLine,
  type Report,
} from "../lib/ledger";
export default function OtherReportItems({
  report,
  busy,
  saved,
  onChange,
  onEditingChange,
}: {
  report: Report;
  busy: boolean;
  saved: boolean;
  onChange: (lines: OtherLine[]) => void;
  onEditingChange: (editing: boolean) => void;
}) {
  const [editing, setEditing] = useState<OtherLine | null>(null),
    [kind, setKind] = useState<OtherLine["kind"]>("deduction"),
    [error, setError] = useState("");
  const unit = minorUnits(report.currency),
    lines = report.otherLines ?? [];
  useEffect(() => {
    onEditingChange(!!editing);
    return () => onEditingChange(false);
  }, [!!editing, onEditingChange]);
  function edit(line?: OtherLine) {
    const next = line ?? {
      id: crypto.randomUUID(),
      artistId: report.artist.id,
      description: "",
      kind: "deduction" as const,
      quantity: 1,
      unitAmount: 0,
      unitCost: 0,
      artistBps: 10000 - report.artist.galleryBps,
    };
    setEditing(next);
    setKind(next.kind);
    setError("");
  }
  return (
    <section className="other-report-items">
      <div className="report-heading">
        <div>
          <h2>Other report items</h2>
          <p>
            Deduct artist purchases or add earnings from sales outside Shopify.
          </p>
        </div>
        {!saved && (
          <Button
            variant="outline"
            disabled={busy || !!editing}
            onClick={() => edit()}
          >
            Add item
          </Button>
        )}
      </div>
      {lines.length > 0 && (
        <div className="statement-table-scroll">
          <table className="other-items-table">
            <thead>
              <tr>
                <th>Description</th>
                <th>Terms</th>
                <th>Artist adjustment</th>
                {!saved && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.id}>
                  <td>{line.description}</td>
                  <td>
                    {line.quantity} × {money(line.unitAmount, report.currency)}
                    {line.kind === "sale" ? (
                      <small>
                        Cost/unit {money(line.unitCost, report.currency)} ·
                        Artist {line.artistBps / 100}% of profit
                      </small>
                    ) : (
                      <small>
                        {line.kind === "deduction"
                          ? "Deduct from artist"
                          : "Add to artist"}
                      </small>
                    )}
                  </td>
                  <td>{money(otherLineAmount(line), report.currency)}</td>
                  {!saved && (
                    <td>
                      <Button
                        variant="ghost"
                        disabled={busy || !!editing}
                        onClick={() => edit(line)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={busy || !!editing}
                        onClick={() =>
                          onChange(lines.filter((item) => item.id !== line.id))
                        }
                      >
                        Remove
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <form
          className="other-item-form"
          onSubmit={(e) => {
            e.preventDefault();
            setError("");
            try {
              const form = new FormData(e.currentTarget);
              const line = otherLineSchema.parse({
                id: editing.id,
                artistId: report.artist.id,
                description: form.get("description"),
                kind,
                quantity: Number(form.get("quantity")),
                unitAmount: Math.round(Number(form.get("unitAmount")) * unit),
                unitCost:
                  kind === "sale"
                    ? Math.round(Number(form.get("unitCost")) * unit)
                    : 0,
                artistBps:
                  kind === "sale"
                    ? Math.round(Number(form.get("artistPercent")) * 100)
                    : 10000,
              });
              otherLineAmount(line);
              onChange(
                lines.some((item) => item.id === line.id)
                  ? lines.map((item) => (item.id === line.id ? line : item))
                  : [...lines, line],
              );
              setEditing(null);
            } catch {
              setError(
                "Enter a description, whole-number quantity, valid amounts and a percentage from 0 to 100.",
              );
            }
          }}
        >
          <label className="other-description">
            Description
            <Input
              name="description"
              required
              maxLength={300}
              defaultValue={editing.description}
              disabled={busy}
            />
          </label>
          <label>
            Type
            <select
              name="kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as OtherLine["kind"])}
              disabled={busy}
            >
              <option value="deduction">Deduct from artist</option>
              <option value="credit">Add to artist</option>
              <option value="sale">Additional sale · profit split</option>
            </select>
          </label>
          <label>
            Quantity
            <Input
              name="quantity"
              type="number"
              required
              min="1"
              step="1"
              max="1000000"
              defaultValue={editing.quantity}
              disabled={busy}
            />
          </label>
          <label>
            {kind === "sale" ? "Sale price / unit" : "Amount / unit"}
            <Input
              name="unitAmount"
              type="number"
              required
              min="0"
              step={1 / unit}
              defaultValue={editing.unitAmount ? editing.unitAmount / unit : ""}
              disabled={busy}
            />
          </label>
          {kind === "sale" && (
            <>
              <label>
                Cost / unit
                <Input
                  name="unitCost"
                  type="number"
                  min="0"
                  required
                  step={1 / unit}
                  defaultValue={editing.unitCost / unit}
                  disabled={busy}
                />
              </label>
              <label>
                Artist % of profit
                <Input
                  name="artistPercent"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  required
                  defaultValue={
                    report.artist.agreementConfigured === false &&
                    !lines.some((line) => line.id === editing.id)
                      ? ""
                      : editing.artistBps / 100
                  }
                  disabled={busy}
                />
              </label>
            </>
          )}
          {error && <p role="alert">{error}</p>}
          <div className="other-form-actions">
            <Button type="submit" disabled={busy}>
              Apply item
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => setEditing(null)}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
      <div className="other-report-total">
        <span>Other items total</span>
        <strong>{money(report.otherTotal ?? 0, report.currency)}</strong>
      </div>
      <div className="other-report-total final">
        <span>Final artist balance</span>
        <strong>
          {report.artist.agreementConfigured === false
            ? "—"
            : money(report.payout, report.currency)}
        </strong>
      </div>
    </section>
  );
}
