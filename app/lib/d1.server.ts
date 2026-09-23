export interface WorkspaceRow {
  shop: string;
  payload: string;
  version: number;
}
export interface ReportRow {
  id: string;
  shop: string;
  month: string;
  artistId: string;
  snapshot: string;
  status: string;
  providerId: string | null;
  error: string | null;
  createdAt: Date;
}
export interface RunRow {
  id: string;
  shop: string;
  month: string;
  status: string;
  result: string | null;
  createdAt: Date;
}
type Stored<T> = Omit<T, "createdAt"> & { createdAt: string };
function dated<T extends { createdAt: Date }>(row: Stored<T>): T {
  return { ...row, createdAt: new Date(row.createdAt) } as unknown as T;
}
export function createDatabase(binding: () => D1Database) {
  const sql = (query: string, ...values: unknown[]) =>
    binding()
      .prepare(query)
      .bind(...values);
  return {
    galleryWorkspace: {
      async upsert({
        where,
        create,
      }: {
        where: { shop: string };
        create: { shop: string; payload: string };
        update: object;
      }) {
        await sql(
          "INSERT OR IGNORE INTO GalleryWorkspace (shop,payload) VALUES (?,?)",
          create.shop,
          create.payload,
        ).run();
        return (await sql(
          "SELECT * FROM GalleryWorkspace WHERE shop=?",
          where.shop,
        ).first<WorkspaceRow>())!;
      },
      async updateMany({
        where,
        data,
      }: {
        where: { shop: string; version: number };
        data: { payload: string; version: { increment: number } };
      }) {
        const result = await sql(
          "UPDATE GalleryWorkspace SET payload=?,version=version+1 WHERE shop=? AND version=?",
          data.payload,
          where.shop,
          where.version,
        ).run();
        return { count: result.meta.changes };
      },
      async findMany() {
        return (
          await sql(
            "SELECT * FROM GalleryWorkspace ORDER BY shop",
          ).all<WorkspaceRow>()
        ).results;
      },
    },
    artistReport: {
      async pdf(id: string, shop: string) {
        const rows = await sql(
          "SELECT p.content FROM ReportPdf p JOIN ArtistReport r ON r.id=p.reportId WHERE r.id=? AND r.shop=? ORDER BY p.part",
          id,
          shop,
        ).all<{ content: string }>();
        return rows.results.map((r) => r.content).join("");
      },
      async findUnique({
        where,
      }: {
        where: {
          shop_month_artistId: {
            shop: string;
            month: string;
            artistId: string;
          };
        };
      }) {
        const k = where.shop_month_artistId;
        const row = await sql(
          "SELECT * FROM ArtistReport WHERE shop=? AND month=? AND artistId=?",
          k.shop,
          k.month,
          k.artistId,
        ).first<Stored<ReportRow>>();
        return row ? dated<ReportRow>(row) : null;
      },
      async create({
        data,
      }: {
        data: Pick<
          ReportRow,
          "id" | "shop" | "month" | "artistId" | "snapshot" | "status"
        > & { pdf?: string };
      }) {
        const statements = [
          sql(
            "INSERT INTO ArtistReport (id,shop,month,artistId,snapshot,status) VALUES (?,?,?,?,?,?)",
            data.id,
            data.shop,
            data.month,
            data.artistId,
            data.snapshot,
            data.status,
          ),
        ];
        // Keep each attachment chunk below D1's per-value limit; the batch is atomic.
        if (data.pdf)
          for (
            let part = 0, offset = 0;
            offset < data.pdf.length;
            part++, offset += 500000
          )
            statements.push(
              sql(
                "INSERT INTO ReportPdf (reportId,part,content) VALUES (?,?,?)",
                data.id,
                part,
                data.pdf.slice(offset, offset + 500000),
              ),
            );
        await binding().batch(statements);
        return dated<ReportRow>(
          (await sql("SELECT * FROM ArtistReport WHERE id=?", data.id).first<
            Stored<ReportRow>
          >())!,
        );
      },
      async update({
        where,
        data,
      }: {
        where: { id: string };
        data: { status: string; providerId?: string; error: string | null };
      }) {
        await sql(
          "UPDATE ArtistReport SET status=?,providerId=COALESCE(?,providerId),error=? WHERE id=?",
          data.status,
          data.providerId ?? null,
          data.error,
          where.id,
        ).run();
      },
      async findMany({
        where,
        take,
      }: {
        where: { shop: string };
        orderBy: object;
        take: number;
      }) {
        const rows = await sql(
          "SELECT * FROM ArtistReport WHERE shop=? ORDER BY createdAt DESC LIMIT ?",
          where.shop,
          take,
        ).all<Stored<ReportRow>>();
        return rows.results.map((row) => dated<ReportRow>(row));
      },
    },
    monthlyRun: {
      async create({
        data,
      }: {
        data: Pick<RunRow, "id" | "shop" | "month" | "status">;
      }) {
        await sql(
          "INSERT INTO MonthlyRun (id,shop,month,status) VALUES (?,?,?,?)",
          data.id,
          data.shop,
          data.month,
          data.status,
        ).run();
      },
      async update({
        where,
        data,
      }: {
        where: { id: string };
        data: { status: string; result: string };
      }) {
        await sql(
          "UPDATE MonthlyRun SET status=?,result=? WHERE id=?",
          data.status,
          data.result,
          where.id,
        ).run();
      },
      async findFirst({ where }: { where: { shop: string }; orderBy: object }) {
        const row = await sql(
          "SELECT * FROM MonthlyRun WHERE shop=? ORDER BY createdAt DESC LIMIT 1",
          where.shop,
        ).first<Stored<RunRow>>();
        return row ? dated<RunRow>(row) : null;
      },
    },
    async deleteShop(shop: string) {
      await binding().batch(
        [
          "Session",
          "ArtistReport",
          "MonthlyRun",
          "SyncJob",
          "GalleryWorkspace",
        ].map((table) => sql("DELETE FROM " + table + " WHERE shop=?", shop)),
      );
    },
    async updateSessionScope(id: string, scope: string) {
      await sql(
        "UPDATE Session SET payload=json_set(payload,'$.scope',?) WHERE id=?",
        scope,
        id,
      ).run();
    },
  };
}
