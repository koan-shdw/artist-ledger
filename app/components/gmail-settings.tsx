import { useState } from "react";
import { Button } from "./ui/button";
export type EmailStatus = {
  gmailEmail: string | null;
  gmailConfigured: boolean;
  emailReady: boolean;
};
export default function GmailSettings({
  endpoint,
  status,
  onStatus,
  disabled,
}: {
  endpoint: string;
  status: EmailStatus;
  onStatus: (v: EmailStatus) => void;
  disabled: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [url, setUrl] = useState("");
  async function refresh() {
    const response = await fetch(endpoint + "?emailStatus=1");
    if (!response.ok) throw Error("Could not check Gmail connection");
    onStatus(await response.json());
  }
  async function action(name: string) {
    const popup =
      name === "connectGmail" ? window.open("about:blank", "_blank") : null;
    if (popup) popup.opener = null;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: name }),
      });
      const result = (await response.json()) as {
        url?: string;
        error?: string;
      };
      if (!response.ok) throw Error(result.error || "Gmail connection failed");
      if (result.url) {
        setUrl(result.url);
        if (popup) popup.location.href = result.url;
      } else {
        setUrl("");
        await refresh();
      }
    } catch (e) {
      popup?.close();
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="gmail-settings">
      <h3>Send reports with Gmail</h3>
      <p>
        {status.gmailEmail
          ? `Connected: ${status.gmailEmail}`
          : "Connect the Google account you use for gallery email."}
      </p>
      <p className="small-note">
        Artist Ledger requests permission to send email and identify your
        account. It does not request access to read your inbox.
      </p>
      {!status.gmailConfigured && (
        <p className="message">
          Gmail connection setup is pending for this installation.
        </p>
      )}
      <div className="gmail-actions">
        <Button
          type="button"
          disabled={disabled || busy || !status.gmailConfigured}
          onClick={() => action("connectGmail")}
        >
          {status.gmailEmail ? "Reconnect Gmail" : "Connect Gmail"}
        </Button>
        {status.gmailEmail && (
          <Button
            type="button"
            variant="outline"
            disabled={disabled || busy}
            onClick={() => action("disconnectGmail")}
          >
            Disconnect Gmail
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          disabled={disabled || busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await refresh();
              setUrl("");
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Check connection
        </Button>
      </div>
      {url && (
        <p>
          <a href={url} target="_blank" rel="noopener noreferrer">
            Continue to Google
          </a>
        </p>
      )}
      {error && (
        <p role="alert" className="message error">
          {error}
        </p>
      )}
    </div>
  );
}
