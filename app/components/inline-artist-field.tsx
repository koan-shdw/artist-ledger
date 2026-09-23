import { useState } from "react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
export default function InlineArtistField({
  value,
  label,
  placeholder,
  percentage = false,
  disabled,
  onSave,
}: {
  value: string;
  label: string;
  placeholder: string;
  percentage?: boolean;
  disabled: boolean;
  onSave: (value: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false),
    [draft, setDraft] = useState(value),
    [error, setError] = useState("");
  return editing ? (
    <form
      className={
        "inline-artist-field " +
        (percentage ? "inline-percentage" : "inline-email")
      }
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        try {
          await onSave(draft.trim());
          setEditing(false);
        } catch (e) {
          setError((e as Error).message);
        }
      }}
    >
      <Input
        autoFocus
        aria-label={label}
        type={percentage ? "number" : "email"}
        required
        min={percentage ? 0 : undefined}
        max={percentage ? 100 : undefined}
        step={percentage ? "0.01" : undefined}
        value={draft}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setEditing(false);
        }}
      />
      <Button size="sm" type="submit" disabled={disabled}>
        Save
      </Button>
      <Button
        size="sm"
        type="button"
        variant="ghost"
        disabled={disabled}
        onClick={() => setEditing(false)}
      >
        Cancel
      </Button>
      {error && <small role="alert">{error}</small>}
    </form>
  ) : (
    <button
      type="button"
      className={
        "inline-edit-control " +
        (value ? "has-value" : "needs-value") +
        (percentage ? " percentage-control" : " email-control")
      }
      disabled={disabled}
      aria-label={label}
      onClick={() => {
        setDraft(value);
        setError("");
        setEditing(true);
      }}
    >
      {value ? value + (percentage ? "%" : "") : placeholder}
    </button>
  );
}
