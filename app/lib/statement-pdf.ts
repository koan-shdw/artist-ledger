import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { money, monthLabel, type Report } from "./ledger";

export type PdfStatement = { report: Report; saved?: boolean };

/** Runs in the browser. Sales data never leaves the app to generate a PDF. */
export async function statementPdf(
  statements: PdfStatement[],
  fontBytes: Uint8Array,
) {
  if (!statements.length) throw Error("Select at least one artist");
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(fontBytes, { subset: false });
  const latin = await doc.embedFont(StandardFonts.Helvetica);
  const latinSet = new Set(latin.getCharacterSet());
  const chooseFont = (value: string) =>
    [...value].every((c) => latinSet.has(c.codePointAt(0)!)) ? latin : font;
  const supported = new Set(font.getCharacterSet());
  doc.setTitle("Monthly artist sales statements");
  doc.setCreator("Artist Ledger");
  const ink = rgb(0.12, 0.16, 0.2),
    muted = rgb(0.38, 0.42, 0.46),
    rule = rgb(0.85, 0.88, 0.9);
  const left = 42,
    right = 553;
  let page!: PDFPage,
    y = 0;
  const clean = (value: string) => value.replace(/[\u0000-\u001f\u007f]/g, " ");
  const text = (value: string, x: number, size = 10, color = ink) => {
    const safe = clean(value);
    // Fail visibly instead of silently dropping unsupported characters.
    if ([...safe].some((c) => !supported.has(c.codePointAt(0)!)))
      throw Error(
        "A statement contains characters unsupported by the PDF font. Please contact the app operator.",
      );
    page.drawText(safe, { x, y, size, font: chooseFont(safe), color });
  };
  const aligned = (value: string, end: number, size = 10) =>
    text(value, end - chooseFont(value).widthOfTextAtSize(value, size), size);
  const wrap = (value: string, width: number, size: number) =>
    wrapText(clean(value), width, size, chooseFont(clean(value)));
  let current: Report;
  const newPage = () => {
    page = doc.addPage([595.28, 841.89]);
    y = 791;
    text("ARTIST LEDGER / MONTHLY STATEMENT", left, 9, muted);
    y -= 24;
    for (const line of wrap(current.galleryName, 510, 17)) {
      text(line, left, 17);
      y -= 23;
    }
    for (const line of wrap(
      `${current.artist.name} | ${monthLabel(current.month)} | ${current.currency}`,
      510,
      11,
    )) {
      text(line, left, 11);
      y -= 16;
    }
    y -= 12;
  };
  const ensure = (height: number) => {
    if (y - height < 58) newPage();
  };
  const paragraph = (value: string, size = 9) => {
    for (const line of wrap(value, right - left, size)) {
      ensure(size + 5);
      text(line, left, size, muted);
      y -= size + 5;
    }
    y -= 8;
  };
  const tableHead = () => {
    ensure(40);
    page.drawRectangle({
      x: left,
      y: y - 8,
      width: right - left,
      height: 24,
      color: rgb(0.94, 0.96, 0.96),
    });
    text("Product / variant", left + 7, 9);
    aligned("Units", 330, 9);
    aligned("Net sales", 406, 9);
    aligned("Costs", 477, 9);
    aligned(
      current.lines.every((line) => line.payout !== undefined)
        ? "Artist earns"
        : "After costs",
      right - 7,
      9,
    );
    y -= 27;
  };
  for (const statement of statements) {
    current = statement.report;
    const review = current.errors.filter(
      (e) => e !== "Add an artist email address",
    );
    const draft = !statement.saved && (review.length > 0 || current.payout < 0);
    newPage();
    paragraph(
      statement.saved
        ? "Saved statement - original items, agreement and amounts."
        : draft
          ? "DRAFT - review required before issuing this statement."
          : "Statement prepared from the selected products and saved agreement.",
    );
    if (current.artist.email)
      paragraph(`Artist email: ${current.artist.email}`);
    const groups = new Map<
      string,
      {
        title: string;
        units: number;
        net: number;
        cost: number;
        payout: number;
      }
    >();
    for (const line of current.lines) {
      const key = line.id;
      const item = groups.get(key) ?? {
        title: `${line.order} · ${line.title} · Gallery ${(line.galleryBps ?? current.artist.galleryBps) / 100}%${line.payout === undefined ? "" : ` · Artist/unit ${money(line.payout / (line.quantity || 1), current.currency)}`}`,
        units: 0,
        net: 0,
        cost: 0,
        payout: 0,
      };
      item.units += line.quantity;
      item.net += line.net;
      item.cost += line.cost;
      item.payout += line.payout ?? line.net - line.cost;
      groups.set(key, item);
    }
    tableHead();
    if (!groups.size) paragraph("No included sales items for this month.");
    for (const item of groups.values()) {
      const title = wrap(item.title, 252, 9);
      for (let start = 0; start < title.length; start += 34) {
        const chunk = title.slice(start, start + 34),
          height = Math.max(30, chunk.length * 13 + 12);
        if (y - height < 62) {
          newPage();
          tableHead();
        }
        const top = y;
        for (const line of chunk) {
          text(line, left + 7, 9);
          y -= 13;
        }
        y = top;
        if (start === 0) {
          aligned(String(item.units), 330, 9);
          aligned(money(item.net, current.currency), 406, 9);
          aligned(money(item.cost, current.currency), 477, 9);
          aligned(money(item.payout, current.currency), right - 7, 9);
        }
        y = top - height;
        page.drawLine({
          start: { x: left, y: y + 9 },
          end: { x: right, y: y + 9 },
          thickness: 0.5,
          color: rule,
        });
      }
    }
    for (const line of current.lines.filter((l) => l.adjusted)) {
      paragraph(
        `Adjustment - ${line.order}: ${line.title}. Sale ${money(line.originalNet ?? line.net, current.currency)} to ${money(line.net, current.currency)}; cost ${money(line.originalCost ?? line.cost, current.currency)} to ${money(line.cost, current.currency)}; gallery ${(line.galleryBps ?? current.artist.galleryBps) ? (line.galleryBps ?? current.artist.galleryBps) / 100 : 0}%.${line.note ? " Note: " + line.note : ""}`,
      );
    }
    const varyingRates = current.lines.some(
      (l) =>
        l.galleryBps !== undefined &&
        l.galleryBps !== current.artist.galleryBps,
    );
    ensure(155);
    y -= 8;
    const summary = (label: string, value: string, size = 11) => {
      text(label, left, size);
      aligned(value, right, size);
      y -= 24;
    };
    summary("Net product sales", money(current.net, current.currency));
    summary("Product costs", money(current.cost, current.currency));
    summary(
      current.artist.agreementConfigured === false
        ? "Gallery share"
        : varyingRates
          ? "Gallery share (sale-specific rates)"
          : `Gallery share (${current.artist.galleryBps / 100}%)`,
      current.artist.agreementConfigured === false
        ? "Not set"
        : money(current.gallery, current.currency),
    );
    summary(
      "Artist balance",
      current.artist.agreementConfigured === false
        ? "Set agreement"
        : money(current.payout, current.currency),
    );
    summary(
      draft
        ? "Invoice amount - pending review"
        : "Amount artist should invoice",
      draft ? "Not issued" : money(current.invoice, current.currency),
      12,
    );
    paragraph(
      current.basis === "after_costs"
        ? "Gallery share is calculated after deducting product costs from net product sales."
        : "Gallery share is calculated on net product sales; product costs are deducted separately.",
    );
    if (draft)
      for (const issue of [
        ...review,
        ...(current.payout < 0
          ? ["Negative balance requires gallery review. No invoice is due."]
          : []),
      ])
        paragraph(`Review: ${issue}`);
    paragraph(
      "Orders placed in the selected month, net of discounts and refunded or removed quantities at the latest sync. Tax and shipping are excluded. Product costs apply to remaining units. Later adjustments may require reconciliation.",
    );
    if (current.replyTo) paragraph(`Questions or invoices: ${current.replyTo}`);
  }
  doc.getPages().forEach((p, i) => {
    p.drawLine({
      start: { x: left, y: 43 },
      end: { x: right, y: 43 },
      thickness: 0.5,
      color: rule,
    });
    p.drawText(`Artist Ledger | Page ${i + 1} of ${doc.getPageCount()}`, {
      x: left,
      y: 27,
      size: 8,
      font: latin,
      color: muted,
    });
  });
  return doc.save();
}

function wrapText(value: string, width: number, size: number, font: PDFFont) {
  const lines: string[] = [];
  let line = "";
  for (const char of value) {
    if (line && font.widthOfTextAtSize(line + char, size) > width) {
      const space = line.lastIndexOf(" ");
      if (space > line.length / 2) {
        lines.push(line.slice(0, space));
        line = line.slice(space + 1);
      } else {
        lines.push(line.trimEnd());
        line = "";
      }
    }
    line += char;
  }
  if (line) lines.push(line.trimEnd());
  return lines.length ? lines : [""];
}
