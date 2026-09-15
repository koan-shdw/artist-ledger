import { Session } from "@shopify/shopify-api";
export class D1SessionStorage {
  constructor(private binding: () => D1Database) {}
  async storeSession(session: Session) {
    const payload = JSON.stringify(session.toObject(), (_key, value) =>
      typeof value === "bigint" ? value.toString() : value,
    );
    await this.binding()
      .prepare(
        "INSERT INTO Session (id,shop,payload) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET shop=excluded.shop,payload=excluded.payload",
      )
      .bind(session.id, session.shop, payload)
      .run();
    return true;
  }
  private hydrate(payload: string) {
    const data = JSON.parse(payload);
    if (data.expires) data.expires = new Date(data.expires);
    if (data.refreshTokenExpires)
      data.refreshTokenExpires = new Date(data.refreshTokenExpires);
    return new Session(data);
  }
  async loadSession(id: string) {
    const row = await this.binding()
      .prepare("SELECT payload FROM Session WHERE id=?")
      .bind(id)
      .first<{ payload: string }>();
    return row ? this.hydrate(row.payload) : undefined;
  }
  async deleteSession(id: string) {
    await this.binding()
      .prepare("DELETE FROM Session WHERE id=?")
      .bind(id)
      .run();
    return true;
  }
  async deleteSessions(ids: string[]) {
    for (let i = 0; i < ids.length; i += 50) {
      await this.binding().batch(
        ids
          .slice(i, i + 50)
          .map((id) =>
            this.binding().prepare("DELETE FROM Session WHERE id=?").bind(id),
          ),
      );
    }
    return true;
  }
  async findSessionsByShop(shop: string) {
    const rows = await this.binding()
      .prepare("SELECT payload FROM Session WHERE shop=?")
      .bind(shop)
      .all<{ payload: string }>();
    return rows.results.map((row) => this.hydrate(row.payload));
  }
}
