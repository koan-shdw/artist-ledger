import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  Layers,
  FileText,
  Users,
  Package,
  Settings as SettingsIcon,
  Download,
  Mail,
  Plus,
  ArrowUpRight,
  RefreshCw,
  ChevronRight,
  Check,
  Info,
  Search,
  Save,
} from "lucide-react";
import {
  Artist,
  Ledger,
  Sent,
  demoLedger,
  emptyLedger,
  reportFor,
  money,
  monthLabel,
  previousMonth,
  reportText,
  reportsCsv,
  minorUnits,
  linkVendorProducts,
} from "@/lib/ledger";
const nav = [
  { label: "Monthly reports", icon: FileText },
  { label: "Artists", icon: Users },
  { label: "Products & costs", icon: Package },
  { label: "Settings", icon: SettingsIcon },
];
function download(name: string, text: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function LedgerApp({
  endpoint = "/api/ledger",
  embedded = false,
  onRequestHistory,
}: {
  endpoint?: string;
  embedded?: boolean;
  onRequestHistory?: () => Promise<void>;
}) {
  const [data, setData] = useState<Ledger>(
      embedded ? emptyLedger() : demoLedger(),
    ),
    [version, setVersion] = useState(0),
    [sent, setSent] = useState<Sent[]>([]),
    [demo, setDemo] = useState(!embedded),
    [loaded, setLoaded] = useState(false),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [error, setError] = useState("");
  const [page, setPage] = useState("Monthly reports"),
    [month, setMonth] = useState(embedded ? previousMonth() : "2026-08"),
    [query, setQuery] = useState(""),
    [status, setStatus] = useState("all"),
    [detail, setDetail] = useState<string | null>(null),
    [editing, setEditing] = useState<Artist | null>(null),
    [sendOpen, setSendOpen] = useState(false),
    [sendTargets, setSendTargets] = useState<string[] | null>(null),
    [setupOpen, setSetupOpen] = useState(false),
    [emailReady, setEmailReady] = useState(false),
    [shop, setShop] = useState(""),
    [latestRun, setLatestRun] = useState<{
      status: string;
      result: string;
      month: string;
    } | null>(null);
  async function refresh() {
    const r = await fetch(endpoint);
    const v = (await r.json()) as {
      error?: string;
      data: Ledger;
      version: number;
      sent: Sent[];
      demo: boolean;
      emailReady: boolean;
      shop: string;
      latestRun?: { status: string; result: string; month: string };
    };
    if (!r.ok) throw Error(v.error || "Could not load workspace");
    setData(v.data);
    setVersion(v.version);
    setSent(v.sent || []);
    setDemo(!!v.demo);
    setEmailReady(!!v.emailReady);
    setShop(v.shop || "");
    setLatestRun(v.latestRun ?? null);
    setLoaded(true);
    setDirty(false);
  }
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
  }, [endpoint]);
  function change(next: Ledger) {
    setData(next);
    setDirty(true);
    setNotice("");
  }
  async function call(action: string, payload: Record<string, unknown> = {}) {
    setBusy(true);
    setError("");
    try {
      let continuation: string | undefined;
      const recipients =
        action === "send" ? [...(payload.artistIds as string[])] : [];
      let recipientIndex = 0;
      const messages: string[] = [];
      while (true) {
        const r = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            version,
            ...payload,
            ...(action === "send"
              ? {
                  artistIds: recipients.slice(
                    recipientIndex,
                    recipientIndex + 1,
                  ),
                }
              : {}),
            ...(continuation ? { jobId: continuation } : {}),
          }),
        });
        const result = (await r.json()) as {
          error?: string;
          version: number;
          message: string;
          pending?: boolean;
          jobId?: string;
        };
        if (!r.ok) throw Error(result.error || "Request failed");
        if (result.pending && result.jobId) {
          continuation = result.jobId;
          setNotice(result.message);
          continue;
        }
        if (action === "send") {
          messages.push(result.message);
          recipientIndex++;
          setNotice(
            "Processed " +
              recipientIndex +
              " of " +
              recipients.length +
              " artist reports",
          );
          if (recipientIndex < recipients.length) continue;
          result.message = messages.join(" ");
        }
        return result;
      }
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    try {
      const result = await call("save", { data });
      setVersion(result.version);
      setDirty(false);
      setNotice("Changes saved");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function sync() {
    if (demo) {
      setSetupOpen(true);
      return;
    }
    try {
      await call("sync", { month });
      await refresh();
      setNotice("Shopify sales and products synced");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const period = data.months[month];
  const reports = data.artists.map((a) => {
    const saved = sent.find((s) => s.month === month && s.artistId === a.id);
    return saved
      ? {
          ...saved.snapshot,
          artist: { ...saved.snapshot.artist, enabled: a.enabled },
        }
      : reportFor(data, month, a.id);
  });
  const selected = reports.filter((r) => r.artist.enabled);
  const totals = selected.reduce(
    (s, r) => ({
      net: s.net + r.net,
      cost: s.cost + r.cost,
      gallery: s.gallery + r.gallery,
      payout: s.payout + r.payout,
    }),
    { net: 0, cost: 0, gallery: 0, payout: 0 },
  );
  const fmt = (n: number) => money(n, data.settings.currency);
  const getSent = (id: string) =>
    sent.find((s) => s.month === month && s.artistId === id);
  const shown = reports.filter(
    (r) =>
      r.artist.name.toLowerCase().includes(query.toLowerCase()) &&
      (status === "all" ||
        (status === "selected" && r.artist.enabled) ||
        (status === "sent" && getSent(r.artist.id)?.status === "sent")),
  );
  const current = detail ? reports.find((r) => r.artist.id === detail) : null;
  const savedReport = detail ? getSent(detail) : null;
  const viewed = savedReport?.snapshot ?? current;
  const delivery = sendTargets
    ? reports.filter((r) => sendTargets.includes(r.artist.id))
    : selected;
  const pending = delivery.filter(
    (r) => getSent(r.artist.id)?.status !== "sent",
  );
  useEffect(() => {
    const ctx = (
      document as Document & {
        modelContext?: {
          registerTool: (tool: unknown, options: unknown) => unknown;
        };
      }
    ).modelContext;
    if (!ctx) return;
    const abort = new AbortController();
    try {
      Promise.resolve(
        ctx.registerTool(
          {
            name: "view_monthly_artist_reports",
            description:
              "Select a report month and show the artist payout breakdown. Does not send reports.",
            inputSchema: {
              type: "object",
              properties: {
                month: { type: "string", pattern: "^\\d{4}-(0[1-9]|1[0-2])$" },
              },
              required: ["month"],
              additionalProperties: false,
            },
            annotations: { readOnlyHint: false },
            execute: (input: { month: string }) => {
              if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.month))
                throw Error("Use YYYY-MM");
              setMonth(input.month);
              setPage("Monthly reports");
              return {
                month: input.month,
                reports: data.artists
                  .map((a) => reportFor(data, input.month, a.id))
                  .map((r) => ({
                    artist: r.artist.name,
                    invoice: r.invoice,
                    currency: r.currency,
                    selected: r.artist.enabled,
                  })),
              };
            },
          },
          { signal: abort.signal },
        ),
      ).catch(() => {});
    } catch {}
    return () => abort.abort();
  }, [data]);
  return (
    <SidebarProvider
      style={{ "--sidebar-width": "238px" } as React.CSSProperties}
    >
      <Sidebar className="ledger-sidebar">
        <SidebarHeader className="brand-header">
          <div className="brand">
            <Layers /> Artist Ledger
          </div>
        </SidebarHeader>
        <SidebarContent>
          <div className="workspace">GALLERY WORKSPACE</div>
          <SidebarMenu className="nav-menu">
            {nav.map((n) => (
              <SidebarMenuItem key={n.label}>
                <SidebarMenuButton
                  isActive={page === n.label}
                  onClick={() => {
                    setPage(n.label);
                    setQuery("");
                  }}
                  className="nav-button"
                >
                  <n.icon />
                  <span>{n.label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter className="rail-bottom">
          <div className="store-icon">
            <Layers size={17} />
            <div>
              {data.settings.galleryName}
              <span>{demo ? "Demo workspace" : shop}</span>
            </div>
          </div>
        </SidebarFooter>
      </Sidebar>
      <section className="main">
        <header className="topline">
          <div className="breadcrumb">
            <SidebarTrigger />
            <span>Workspace</span>
            <span>/</span>
            <b>{page}</b>
          </div>
          <span className="demo-pill">
            {demo ? "Sample data" : "Shopify app"}
          </span>
        </header>
        <div className="content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {page === "Monthly reports"
                  ? "SALES & SETTLEMENTS"
                  : "GALLERY WORKSPACE"}
              </div>
              <h1>{page}</h1>
              <p>
                {page === "Monthly reports"
                  ? "A clear picture of what your artists have earned."
                  : page === "Artists"
                    ? "Manage each artist’s email, gallery split, and report selection."
                    : page === "Products & costs"
                      ? "Assign items to artists and set the costs deducted from sales."
                      : "Choose how your gallery prepares and sends artist statements."}
              </p>
            </div>
            <div className="actions">
              {page === "Monthly reports" && (
                <div className="month-control">
                  <Label htmlFor="report-month">Report month</Label>
                  <div className="month-selectors">
                    <Select
                      value={month.slice(5)}
                      onValueChange={(v) =>
                        setMonth(month.slice(0, 4) + "-" + v)
                      }
                    >
                      <SelectTrigger
                        id="report-month"
                        aria-label="Report month"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 12 }, (_, i) =>
                          String(i + 1).padStart(2, "0"),
                        ).map((m) => (
                          <SelectItem value={m} key={m}>
                            {new Date(
                              "2020-" + m + "-01T12:00:00Z",
                            ).toLocaleDateString("en", {
                              month: "long",
                              timeZone: "UTC",
                            })}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={month.slice(0, 4)}
                      onValueChange={(v) => setMonth(v + month.slice(4))}
                    >
                      <SelectTrigger aria-label="Report year">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from(
                          { length: new Date().getFullYear() - 1999 },
                          (_, i) => String(new Date().getFullYear() - i),
                        ).map((y) => (
                          <SelectItem key={y} value={y}>
                            {y}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
              {dirty && (
                <Button onClick={save} disabled={busy || !loaded}>
                  <Save /> Save changes
                </Button>
              )}
            </div>
          </div>
          {!loaded && (
            <div className="message">
              {error ? (
                <>
                  {" "}
                  {error}{" "}
                  <Button
                    onClick={() => refresh().catch((e) => setError(e.message))}
                  >
                    Retry
                  </Button>
                </>
              ) : (
                "Loading saved workspace…"
              )}
            </div>
          )}
          {loaded && error && (
            <div role="alert" className="message error">
              {error}
            </div>
          )}
          {notice && (
            <div role="status" className="message success">
              <Check size={16} />
              {notice}
            </div>
          )}
          {demo && (
            <div className="demo-banner">
              <Info size={16} />
              <strong>Explore with sample data</strong>
              <span>
                Try the workflow. Real sales and email are available in the
                Shopify app.
              </span>
              <Button variant="link" onClick={() => setSetupOpen(true)}>
                Installation <ArrowUpRight />
              </Button>
            </div>
          )}
          {page === "Monthly reports" && (
            <>
              <div className="stats">
                {[
                  [
                    "Net product sales",
                    totals.net,
                    "After discounts and refunds",
                  ],
                  ["Product costs", totals.cost, "Costs of remaining units"],
                  [
                    "Gallery share",
                    totals.gallery,
                    "Individual artist agreements",
                  ],
                  [
                    "Artist earnings",
                    totals.payout,
                    `${selected.length} selected artists`,
                  ],
                ].map(([title, value, sub], i) => (
                  <div
                    key={title}
                    className={i === 3 ? "stat highlighted" : "stat"}
                  >
                    <span>{title}</span>
                    <strong>{fmt(value as number)}</strong>
                    <small>{sub}</small>
                  </div>
                ))}
              </div>
              <div className="report-heading">
                <div>
                  <h2>
                    Artist statements{" "}
                    <span className="count">{reports.length}</span>
                  </h2>
                  <p>
                    Select the artists to report to, then review their included
                    items.
                  </p>
                </div>
                <div className="actions">
                  <Button
                    variant="outline"
                    disabled={!selected.length}
                    onClick={() =>
                      download(
                        `artist-summary-${month}.csv`,
                        reportsCsv(selected),
                        "text/csv;charset=utf-8",
                      )
                    }
                  >
                    <Download /> Export
                  </Button>
                  <Button
                    disabled={busy || !loaded || !selected.length || dirty}
                    onClick={() => {
                      setSendTargets(null);
                      setSendOpen(true);
                    }}
                  >
                    <Mail /> Review & send{" "}
                    <span className="button-count">{selected.length}</span>
                  </Button>
                </div>
              </div>
              <div className="table-toolbar">
                <Tabs value={status} onValueChange={setStatus}>
                  <TabsList variant="line">
                    <TabsTrigger value="all">All artists</TabsTrigger>
                    <TabsTrigger value="selected">Selected</TabsTrigger>
                    <TabsTrigger value="sent">Sent</TabsTrigger>
                  </TabsList>
                </Tabs>
                <div className="actions">
                  <div className="searchbox">
                    <Search size={15} />
                    <Input
                      aria-label="Search artists"
                      placeholder="Search artists"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </div>
                  <Button
                    variant="ghost"
                    disabled={busy || dirty || !loaded}
                    onClick={sync}
                    aria-label="Sync Shopify sales"
                  >
                    <RefreshCw size={16} />
                  </Button>
                </div>
              </div>
              <div className="tablewrap">
                <table>
                  <thead>
                    <tr>
                      <th>
                        <Checkbox
                          aria-label="Select all artists"
                          checked={
                            data.artists.length > 0 &&
                            data.artists.every((a) => a.enabled)
                          }
                          onCheckedChange={(v) =>
                            change({
                              ...data,
                              artists: data.artists.map((a) => ({
                                ...a,
                                enabled: v === true,
                              })),
                            })
                          }
                        />
                      </th>
                      {[
                        "Artist",
                        "Units",
                        "Net sales",
                        "Product costs",
                        "Gallery split",
                        "Artist earnings",
                        "Statement",
                      ].map((x) => (
                        <th key={x}>{x}</th>
                      ))}
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((r, i) => (
                      <tr key={r.artist.id}>
                        <td>
                          <Checkbox
                            aria-label={`Include ${r.artist.name} in reports`}
                            checked={r.artist.enabled}
                            onCheckedChange={(v) =>
                              change({
                                ...data,
                                artists: data.artists.map((a) =>
                                  a.id === r.artist.id
                                    ? { ...a, enabled: v === true }
                                    : a,
                                ),
                              })
                            }
                          />
                        </td>
                        <td>
                          <button
                            className="artist-cell"
                            onClick={() => setDetail(r.artist.id)}
                          >
                            <span className={`avatar a${i % 6}`}>
                              {r.artist.name
                                .split(" ")
                                .slice(0, 2)
                                .map((x) => x[0])
                                .join("")}
                            </span>
                            <span>
                              <strong>{r.artist.name}</strong>
                              <small>{r.artist.email || "Email needed"}</small>
                            </span>
                          </button>
                        </td>
                        <td>{r.units}</td>
                        <td>{fmt(r.net)}</td>
                        <td>{fmt(r.cost)}</td>
                        <td>
                          <span className="split-label">
                            {r.artist.agreementConfigured === false ? "Set percentage" : `${r.artist.galleryBps / 100}%`}
                          </span>
                        </td>
                        <td className="earnings">{r.artist.agreementConfigured === false ? "Set percentage" : fmt(r.payout)}</td>
                        <td>
                          <span
                            className={`status ${getSent(r.artist.id)?.status === "sent" ? "sent" : ""}`}
                          >
                            {getSent(r.artist.id)?.status === "sent"
                              ? "Sent"
                              : getSent(r.artist.id)
                                ? "Check delivery"
                                : r.errors.length
                                  ? "Needs review"
                                  : "Draft"}
                          </span>
                        </td>
                        <td>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label={`Review ${r.artist.name} statement`}
                            onClick={() => setDetail(r.artist.id)}
                          >
                            <ChevronRight />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!shown.length && (
                  <div className="empty">
                    <FileText />
                    <h2>
                      {reports.length
                        ? "No matching statements"
                        : "Your first artist report starts here"}
                    </h2>
                    <p>
                      {reports.length
                        ? "Change the search or filter to see more artists."
                        : "Sync Shopify sales, then select your artists from the Shopify vendor list."}
                    </p>
                    <Button
                      variant="outline"
                      onClick={() => setPage("Artists")}
                    >
                      Manage artists
                    </Button>
                  </div>
                )}
              </div>
              <div className="table-foot">
                <span>
                  {selected.length} of {reports.length} artists selected ·{" "}
                  {monthLabel(month)}
                </span>
                <span>
                  {period
                    ? `Synced ${new Date(period.syncedAt).toLocaleDateString("en")}`
                    : "Sales have not been synced"}
                </span>
              </div>
              <div className="formula">
                <span className="formula-icon">÷</span>
                <div>
                  <strong>A transparent split, every month</strong>
                  <p>
                    {data.settings.basis === "after_costs"
                      ? "(Net product sales − product costs) × artist share = artist balance"
                      : "Net product sales − product costs − gallery % of net sales = artist balance"}
                  </p>
                </div>
                <Button variant="link" onClick={() => setPage("Settings")}>
                  Calculation settings <ArrowUpRight />
                </Button>
              </div>
              {period?.warnings.map((w) => (
                <div className="message error" key={w}>
                  {w}
                </div>
              ))}
            </>
          )}
          {page === "Artists" && (
            <>
              <div className="report-heading section-top">
                <h2>{data.artists.length} artists</h2>
                <Button
                  onClick={() =>
                    setEditing({
                      id: crypto.randomUUID(),
                      name: "",
                      email: "",
                      galleryBps: 4000,
                      enabled: true,
                    })
                  }
                >
                  <Plus /> Add artist
                </Button>
              </div>
              <div className="tablewrap">
                <table>
                  <thead>
                    <tr>
                      {[
                        "Artist",
                        "Email address",
                        "Gallery share",
                        "Receive reports",
                        "",
                      ].map((x, i) => (
                        <th key={i}>{x}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.artists.map((a, i) => (
                      <tr key={a.id}>
                        <td>
                          <div className="artist-cell">
                            <span className={`avatar a${i % 6}`}>
                              {a.name
                                .split(" ")
                                .slice(0, 2)
                                .map((x) => x[0])
                                .join("")}
                            </span>
                            <strong>{a.name}</strong>
                          </div>
                        </td>
                        <td>{a.email || "Add an email"}</td>
                        <td>
                          {a.agreementConfigured === false
                            ? "Set gallery percentage"
                            : `${a.galleryBps / 100}%`}{" "}
                          <span className="muted">
                            {a.agreementConfigured === false
                              ? ""
                              : `gallery / ${(10000 - a.galleryBps) / 100}% artist`}
                          </span>
                        </td>
                        <td>
                          <Switch
                            aria-label={`Reports for ${a.name}`}
                            checked={a.enabled}
                            onCheckedChange={(v) =>
                              change({
                                ...data,
                                artists: data.artists.map((x) =>
                                  x.id === a.id ? { ...x, enabled: v } : x,
                                ),
                              })
                            }
                          />
                        </td>
                        <td>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setEditing({ ...a })}
                          >
                            Edit
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!data.artists.length && (
                  <div className="empty">
                    Add your first artist to set their email and gallery
                    percentage.
                  </div>
                )}
              </div>
              <p className="section-note">
                Artist selection is saved for future months. Individual item
                selections are saved per reporting month.
              </p>
            </>
          )}
          {page === "Products & costs" && (
            <>
              <div className="report-heading section-top">
                <h2>{data.products.length} product variants</h2>
                <Button
                  variant="outline"
                  disabled={busy || dirty || !loaded}
                  onClick={sync}
                >
                  <RefreshCw /> Sync Shopify
                </Button>
              </div>
              <div className="tablewrap">
                <table>
                  <thead>
                    <tr>
                      {[
                        "Include",
                        "Product / variant",
                        "Artist",
                        "Unit cost",
                        "",
                      ].map((x, i) => (
                        <th key={i}>{x}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.products.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <Checkbox
                            aria-label={`Include ${p.title}`}
                            checked={p.included}
                            onCheckedChange={(v) =>
                              change({
                                ...data,
                                products: data.products.map((x) =>
                                  x.id === p.id
                                    ? { ...x, included: v === true }
                                    : x,
                                ),
                              })
                            }
                          />
                        </td>
                        <td>
                          <strong>{p.title}</strong>
                          <small className="subtext">{p.sku || "No SKU"}</small>
                        </td>
                        <td>
                          <Select
                            value={p.artistId || "unassigned"}
                            onValueChange={(v) =>
                              change({
                                ...data,
                                products: data.products.map((x) =>
                                  x.id === p.id
                                    ? {
                                        ...x,
                                        artistId: v === "unassigned" ? "" : v,
                                      }
                                    : x,
                                ),
                              })
                            }
                          >
                            <SelectTrigger className="artist-select">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="unassigned">
                                Unassigned
                              </SelectItem>
                              {data.artists.map((a) => (
                                <SelectItem key={a.id} value={a.id}>
                                  {a.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td>
                          <div className="cost-input">
                            <span>{data.settings.currency}</span>
                            <Input
                              aria-label={`Unit cost for ${p.title}`}
                              type="number"
                              min="0"
                              step={1 / minorUnits(data.settings.currency)}
                              placeholder="Required"
                              value={
                                p.unitCost === null
                                  ? ""
                                  : p.unitCost /
                                    minorUnits(data.settings.currency)
                              }
                              onChange={(e) =>
                                change({
                                  ...data,
                                  products: data.products.map((x) =>
                                    x.id === p.id
                                      ? {
                                          ...x,
                                          unitCost:
                                            e.target.value === ""
                                              ? null
                                              : Math.round(
                                                  Number(e.target.value) *
                                                    minorUnits(
                                                      data.settings.currency,
                                                    ),
                                                ),
                                        }
                                      : x,
                                  ),
                                })
                              }
                            />
                          </div>
                        </td>
                        <td>
                          {!p.artistId && (
                            <span className="status">Assign an artist</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!data.products.length && (
                  <div className="empty">
                    Sync Shopify to load your product variants.
                  </div>
                )}
              </div>
              <p className="section-note">
                Unchecked and unassigned products are excluded. Unit costs are
                editable and apply to unsent statements; sent statements keep
                their original figures.
              </p>
            </>
          )}
          {page === "Settings" && (
            <div className="settings-grid">
              <section className="settings-card">
                <h2>Gallery & calculation</h2>
                <Label htmlFor="gallery">Gallery name</Label>
                <Input
                  id="gallery"
                  value={data.settings.galleryName}
                  onChange={(e) =>
                    change({
                      ...data,
                      settings: {
                        ...data.settings,
                        galleryName: e.target.value,
                      },
                    })
                  }
                />
                <Label htmlFor="currency">Reporting currency</Label>
                <Select
                  value={data.settings.currency}
                  disabled={!demo && Object.keys(data.months).length > 0}
                  onValueChange={(v) =>
                    change({
                      ...data,
                      settings: {
                        ...data.settings,
                        currency: v as Ledger["settings"]["currency"],
                      },
                    })
                  }
                >
                  <SelectTrigger id="currency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["USD", "GBP", "EUR", "AUD", "CAD", "NZD", "JPY"].map(
                      (v) => (
                        <SelectItem value={v} key={v}>
                          {v}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
                <Label htmlFor="basis">Gallery percentage applies to</Label>
                <Select
                  value={data.settings.basis}
                  onValueChange={(v) =>
                    change({
                      ...data,
                      settings: {
                        ...data.settings,
                        basis: v as Ledger["settings"]["basis"],
                      },
                    })
                  }
                >
                  <SelectTrigger id="basis">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="after_costs">
                      Net sales after product costs
                    </SelectItem>
                    <SelectItem value="sales">
                      Net sales before product costs
                    </SelectItem>
                  </SelectContent>
                </Select>
                <div className="calculation-example">
                  <strong>Example · 40% gallery share</strong>
                  <p>
                    {fmt(100000)} sales − {fmt(20000)} costs
                  </p>
                  <b>
                    Artist invoices{" "}
                    {fmt(data.settings.basis === "after_costs" ? 48000 : 40000)}
                  </b>
                </div>
                <p>
                  Each artist’s percentage is set in Artists. Reports exclude
                  tax and shipping and use orders placed in the selected month,
                  net of refunds at the latest sync. Product costs are deducted
                  for remaining units. Negative balances require manual review.
                </p>
              </section>
              <section className="settings-card">
                <h2>Email & monthly reporting</h2>
                <Label htmlFor="reply">Gallery reply-to email</Label>
                <Input
                  id="reply"
                  type="email"
                  placeholder="accounts@yourgallery.com"
                  value={data.settings.replyTo}
                  onChange={(e) =>
                    change({
                      ...data,
                      settings: { ...data.settings, replyTo: e.target.value },
                    })
                  }
                />
                <div className="switch-row">
                  <div>
                    <strong>Automatic monthly reports</strong>
                    <p>
                      Send last month’s reports to selected artists on the first
                      day, after a fresh Shopify sync.
                    </p>
                  </div>
                  <Switch
                    aria-label="Enable automatic monthly reports"
                    checked={data.settings.automatic}
                    onCheckedChange={(v) =>
                      change({
                        ...data,
                        settings: { ...data.settings, automatic: v },
                      })
                    }
                  />
                </div>
                <div className="message">
                  <Info size={16} />
                  {demo
                    ? "Automatic sending is disabled in the demo."
                    : emailReady
                      ? "Email provider is configured. The hosting scheduler must run the monthly job."
                      : "Email delivery requires the email provider and verified sender to be configured on your app server."}
                </div>
                <p>
                  Automatic reports use saved artist and item selections.
                  Missing emails, missing costs, negative balances, and refund
                  exceptions stop that artist’s report for review.
                </p>
                {latestRun && (
                  <div className="message">
                    <div>
                      <strong>
                        Latest monthly run · {monthLabel(latestRun.month)}
                      </strong>
                      <p>
                        {latestRun.status}: {latestRun.result || "In progress"}
                      </p>
                    </div>
                  </div>
                )}
                <h2 className="section-top">Past-month reports</h2>
                <p>
                  Choose any previous month in Monthly reports, sync its sales,
                  then review and send it. Orders older than 60 days require
                  historical-order access approved by Shopify.
                </p>
                {!demo && onRequestHistory && (
                  <Button
                    variant="outline"
                    onClick={async () => {
                      try {
                        await onRequestHistory();
                        setNotice(
                          "Historical-order access granted. Sync your chosen month.",
                        );
                      } catch (e) {
                        setError((e as Error).message);
                      }
                    }}
                  >
                    Enable historical-order access
                  </Button>
                )}
                <h2 className="section-top">Shopify installation</h2>
                <p>
                  {demo
                    ? "This is the workflow preview. The source package contains the embedded Shopify app, store authentication, saved records, and reporting jobs."
                    : `Installed on ${shop}. Shopify manages installation and access through your store admin.`}
                </p>
                {demo && (
                  <Button variant="outline" onClick={() => setSetupOpen(true)}>
                    View installation steps <ArrowUpRight />
                  </Button>
                )}
              </section>
            </div>
          )}
        </div>
      </section>
      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent>
          <DialogTitle>
            {data.artists.some((a) => a.id === editing?.id)
              ? "Edit artist"
              : "Add artist"}
          </DialogTitle>
          <DialogDescription>
            Set the artist’s contact details and their individual gallery
            agreement.
          </DialogDescription>
          {editing && (
            <form
              className="form-grid"
              onSubmit={(e) => {
                e.preventDefault();
                const artist = { ...editing, agreementConfigured: true };
                const artists = data.artists.some((a) => a.id === artist.id)
                  ? data.artists.map((a) => (a.id === artist.id ? artist : a))
                  : [...data.artists, artist];
                change({
                  ...data,
                  artists,
                  products: linkVendorProducts(data.products, artists),
                });
                setEditing(null);
              }}
            >
              <Label htmlFor="artist-vendor">Shopify vendor / supplier</Label>
              <Select
                value={editing.vendor || "__manual__"}
                onValueChange={(vendor) =>
                  setEditing({
                    ...editing,
                    vendor: vendor === "__manual__" ? undefined : vendor,
                    name:
                      vendor === "__manual__"
                        ? editing.name
                        : vendor.slice(0, 120),
                  })
                }
              >
                <SelectTrigger id="artist-vendor">
                  <SelectValue placeholder="Select a Shopify vendor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__manual__">
                    Select a vendor or enter manually
                  </SelectItem>
                  {[
                    ...new Set([
                      ...data.products
                        .map((p) => p.vendor)
                        .filter((v): v is string => !!v),
                      ...(editing.vendor ? [editing.vendor] : []),
                    ]),
                  ]
                    .sort((a, b) => a.localeCompare(b))
                    .map((vendor) => (
                      <SelectItem
                        key={vendor}
                        value={vendor}
                        disabled={data.artists.some(
                          (a) => a.id !== editing.id && a.vendor === vendor,
                        )}
                      >
                        {vendor}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <p>
                {editing.vendor
                  ? data.products.filter((p) => p.vendor === editing.vendor)
                      .length +
                    " product variants linked automatically. Future products from this vendor link when you sync."
                  : "Choose from your Shopify product vendors. Sync Shopify sales to refresh this list."}
              </p>
              <Label htmlFor="artist-name">Artist name</Label>
              <Input
                id="artist-name"
                required
                maxLength={120}
                value={editing.name}
                onChange={(e) =>
                  setEditing({ ...editing, name: e.target.value })
                }
              />
              <Label htmlFor="artist-email">Email address</Label>
              <Input
                id="artist-email"
                type="email"
                required
                value={editing.email}
                onChange={(e) =>
                  setEditing({ ...editing, email: e.target.value })
                }
              />
              <Label htmlFor="artist-split">Gallery share (%)</Label>
              <Input
                id="artist-split"
                type="number"
                min="0"
                max="100"
                step="0.01"
                required
                value={
                  editing.agreementConfigured === false
                    ? ""
                    : editing.galleryBps / 100
                }
                placeholder="Enter gallery percentage"
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    agreementConfigured: true,
                    galleryBps: Math.round(Number(e.target.value) * 100),
                  })
                }
              />
              <p>
                Artist receives {(10000 - editing.galleryBps) / 100}%{" "}
                {data.settings.basis === "after_costs"
                  ? "after product costs"
                  : "of net sales, less product costs"}
                .
              </p>
              <div className="switch-row">
                <Label htmlFor="artist-enabled">
                  Include in monthly reports
                </Label>
                <Switch
                  id="artist-enabled"
                  checked={editing.enabled}
                  onCheckedChange={(v) =>
                    setEditing({ ...editing, enabled: v })
                  }
                />
              </div>
              <Button type="submit">Apply artist details</Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <Sheet open={!!detail} onOpenChange={(v) => !v && setDetail(null)}>
        <SheetContent className="statement-sheet">
          {viewed && (
            <>
              <div className="sheet-heading">
                <div className="eyebrow">ARTIST STATEMENT</div>
                <SheetTitle>{viewed.artist.name}</SheetTitle>
                <SheetDescription>
                  {monthLabel(month)} · {viewed.artist.email || "Email needed"}
                  {savedReport ? " · Saved statement" : " · Draft"}
                </SheetDescription>
              </div>
              <div className="invoice-card">
                <span>Amount to invoice</span>
                <strong>{money(viewed.invoice, viewed.currency)}</strong>
                <p>
                  {viewed.galleryName} · {viewed.currency}
                </p>
              </div>
              <div className="breakdown">
                <div>
                  <span>Net product sales</span>
                  <b>{money(viewed.net, viewed.currency)}</b>
                </div>
                <div>
                  <span>Product costs</span>
                  <b>− {money(viewed.cost, viewed.currency)}</b>
                </div>
                <div>
                  <span>Gallery share · {viewed.artist.galleryBps / 100}%</span>
                  <b>− {money(viewed.gallery, viewed.currency)}</b>
                </div>
                <div className="total">
                  <span>Artist balance</span>
                  <b>{money(viewed.payout, viewed.currency)}</b>
                </div>
              </div>
              <h3>Included items</h3>
              <p className="small-note">
                {savedReport
                  ? "This saved statement keeps its original items and amounts."
                  : "Choose which sales items appear on this month’s report."}
              </p>
              {(savedReport
                ? viewed.lines
                : (period?.lines ?? []).filter(
                    (l) =>
                      data.products.find((p) => p.id === l.productId)
                        ?.artistId === detail,
                  )
              ).map((l) => {
                const p = data.products.find((p) => p.id === l.productId);
                return (
                  <label className="item-choice" key={l.id}>
                    <Checkbox
                      disabled={!!savedReport || !p?.included}
                      checked={
                        !!savedReport ||
                        (!!p?.included && !period?.excluded.includes(l.id))
                      }
                      onCheckedChange={(v) => {
                        if (!period) return;
                        change({
                          ...data,
                          months: {
                            ...data.months,
                            [month]: {
                              ...period,
                              excluded:
                                v === true
                                  ? period.excluded.filter((id) => id !== l.id)
                                  : [...new Set([...period.excluded, l.id])],
                            },
                          },
                        });
                      }}
                    />
                    <div>
                      <strong>{l.title}</strong>
                      <span>
                        {l.quantity} units · {l.order}
                        {!p?.included && !savedReport
                          ? " · Product excluded"
                          : ""}
                      </span>
                    </div>
                    <b>{money(l.net, viewed.currency)}</b>
                  </label>
                );
              })}
              {viewed.errors.length > 0 && !savedReport && (
                <div className="message error">{viewed.errors.join(". ")}</div>
              )}
              {viewed.payout < 0 && (
                <div className="message error">
                  Negative balance: review the costs and agreement before
                  reporting. No invoice is due.
                </div>
              )}
              <div className="sheet-actions">
                <Button
                  disabled={
                    busy ||
                    dirty ||
                    !viewed.artist.enabled ||
                    (!!savedReport && savedReport.status === "sent")
                  }
                  onClick={() => {
                    setSendTargets([viewed.artist.id]);
                    setDetail(null);
                    setSendOpen(true);
                  }}
                >
                  <Mail /> Review & send to artist
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    download(
                      `${viewed.artist.name}-${month}.txt`,
                      reportText(viewed),
                    )
                  }
                >
                  <Download /> Download statement
                </Button>
                {dirty && (
                  <Button onClick={save} disabled={busy || !loaded}>
                    Save selections
                  </Button>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
      <Dialog open={sendOpen} onOpenChange={setSendOpen}>
        <DialogContent className="send-dialog">
          <DialogTitle>Review monthly reports</DialogTitle>
          <DialogDescription>
            {monthLabel(month)} · {pending.length} selected{" "}
            {pending.length === 1 ? "artist" : "artists"} awaiting a report
          </DialogDescription>
          <div className="send-list">
            {delivery.map((r) => (
              <div key={r.artist.id}>
                <span>
                  <strong>{r.artist.name}</strong>
                  <small>{r.artist.email || "Email needed"}</small>
                </span>
                <span>
                  {fmt(r.invoice)}
                  <small>
                    {getSent(r.artist.id)?.status === "sent"
                      ? "Already sent"
                      : r.errors.length
                        ? r.errors.join(" · ")
                        : r.payout < 0
                          ? "Negative balance — review required"
                          : "Ready to send"}
                  </small>
                </span>
              </div>
            ))}
          </div>
          {demo && (
            <div className="message">
              Demo emails are disabled. Download the summary to review the
              sample calculations.
            </div>
          )}
          {!demo && !emailReady && (
            <div className="message error">
              Configure your email provider before sending.
            </div>
          )}
          <Button
            disabled={
              demo ||
              !emailReady ||
              !pending.length ||
              pending.some((r) => r.errors.length || r.payout < 0) ||
              busy ||
              dirty
            }
            onClick={async () => {
              try {
                const result = await call("send", {
                  month,
                  artistIds: pending.map((r) => r.artist.id),
                });
                await refresh();
                setSendOpen(false);
                setNotice(result.message);
              } catch (e) {
                setError((e as Error).message);
                setSendOpen(false);
              }
            }}
          >
            <Mail /> Send {pending.length}{" "}
            {pending.length === 1 ? "report" : "reports"}
          </Button>
          <p className="small-note">
            Each artist receives their own itemised statement and the amount to
            invoice. Already sent reports are skipped.
          </p>
        </DialogContent>
      </Dialog>
      <Dialog open={setupOpen} onOpenChange={setSetupOpen}>
        <DialogContent>
          <DialogTitle>Install Artist Ledger in Shopify</DialogTitle>
          <DialogDescription>
            The preview lets you edit sample artist agreements and reports. The
            source package runs inside Shopify Admin.
          </DialogDescription>
          <ol className="install-steps">
            <li>
              Create an app in Shopify’s Dev Dashboard and link the included app
              configuration.
            </li>
            <li>
              Deploy the app server with its database, email provider, and
              monthly scheduler.
            </li>
            <li>
              Install it on a development store to test sales imports and artist
              statements.
            </li>
            <li>
              Choose public distribution and submit for Shopify review to share
              it with unrelated stores.
            </li>
          </ol>
          <p>
            Store installation and automatic email delivery are not active in
            this preview.
          </p>
          <Button
            variant="outline"
            onClick={() => {
              setSetupOpen(false);
              setPage("Artists");
            }}
          >
            Explore artist settings <ChevronRight />
          </Button>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}
