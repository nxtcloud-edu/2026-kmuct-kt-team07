import { DatabaseSync } from "node:sqlite";
import { mkdirSync, chmodSync } from "node:fs";
import { dirname } from "node:path";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import type { AnalysisResult, ObservationRequest } from "../src/analysis.js";
import type { Category } from "../shared/domain.js";

export interface StoredRequest {
  id: string;
  owner: string;
  createdAt: number;
  state: "queued" | "processing" | "ready";
  query: string;
  category: Category;
  selectedVariantId: string | null;
  analysis: AnalysisResult | null;
  answers: Record<string, string>;
  feedback: unknown[];
  revision: number;
}
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export class Store {
  db: DatabaseSync;
  constructor(path: string) {
    if (path !== ":memory:")
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    if (path !== ":memory:") chmodSync(path, 0o600);
    this.db
      .exec(`PRAGMA journal_mode=WAL; PRAGMA secure_delete=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, csrf TEXT NOT NULL, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS requests (id TEXT PRIMARY KEY, owner TEXT NOT NULL, created INTEGER NOT NULL, state TEXT NOT NULL, data TEXT NOT NULL, payload TEXT);
      CREATE INDEX IF NOT EXISTS request_owner ON requests(owner,created);
      CREATE TABLE IF NOT EXISTS quota (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);`);
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS idempotency (owner TEXT NOT NULL, key TEXT NOT NULL, hash TEXT NOT NULL, request_id TEXT NOT NULL, expires INTEGER NOT NULL, PRIMARY KEY(owner,key))",
    );
    // Do not silently repeat an inference whose provider-side completion is unknown after a crash.
    const interrupted = this.db
      .prepare("SELECT data FROM requests WHERE state='processing'")
      .all();
    for (const row of interrupted) {
      const request = JSON.parse(String(row.data)) as StoredRequest;
      request.analysis = {
        status: "needs_information",
        reason: "provider_error",
        attempts: 1,
        nextAction: { kind: "model_search", label: "모델명으로 찾기" },
      };
      request.state = "ready";
      this.save(request);
      this.clearPayload(request.id);
    }
    this.cleanup();
  }
  session(token?: string) {
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return;
    return this.db
      .prepare("SELECT id,csrf FROM sessions WHERE id=? AND expires>?")
      .get(hash(token), Date.now()) as { id: string; csrf: string } | undefined;
  }
  newSession() {
    const token = randomBytes(32).toString("hex"),
      csrf = randomBytes(32).toString("hex"),
      id = hash(token);
    this.db
      .prepare("INSERT INTO sessions VALUES(?,?,?)")
      .run(id, csrf, Date.now() + 86400000);
    return { token, id, csrf };
  }
  quota(keys: { key: string; max: number }[], ttl: number) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const now = Date.now();
      for (const { key, max } of keys) {
        const row = this.db
          .prepare("SELECT count,expires FROM quota WHERE key=?")
          .get(key) as { count: number; expires: number } | undefined;
        if (row && row.expires > now && row.count >= max) {
          this.db.exec("ROLLBACK");
          return false;
        }
      }
      for (const { key } of keys)
        this.db
          .prepare(
            `INSERT INTO quota VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET
        count=CASE WHEN expires<=? THEN 1 ELSE count+1 END, expires=CASE WHEN expires<=? THEN excluded.expires ELSE expires END`,
          )
          .run(key, now + ttl, now, now);
      this.db.exec("COMMIT");
      return true;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  create(
    owner: string,
    query: string,
    category: Category,
    payload?: ObservationRequest,
    identity?: { key: string; hash: string },
  ) {
    const record: StoredRequest = {
      id: randomUUID(),
      owner,
      query,
      category,
      createdAt: Date.now(),
      state: payload ? "queued" : "ready",
      selectedVariantId: null,
      analysis: null,
      answers: {},
      feedback: [],
      revision: 1,
    };
    const serialized = payload
      ? JSON.stringify({
          ...payload,
          images: payload.images.map((i) => ({
            ...i,
            bytes: Buffer.from(i.bytes).toString("base64"),
          })),
        })
      : null;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare("INSERT INTO requests VALUES(?,?,?,?,?,?)")
        .run(
          record.id,
          owner,
          record.createdAt,
          record.state,
          JSON.stringify(record),
          serialized,
        );
      if (identity)
        this.db
          .prepare("INSERT INTO idempotency VALUES(?,?,?,?,?)")
          .run(
            owner,
            identity.key,
            identity.hash,
            record.id,
            Date.now() + 86400000,
          );
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return record;
  }
  duplicate(owner: string, key: string) {
    return this.db
      .prepare(
        "SELECT hash,request_id FROM idempotency WHERE owner=? AND key=? AND expires>?",
      )
      .get(owner, key, Date.now()) as
      { hash: string; request_id: string } | undefined;
  }
  get(id: string, owner?: string) {
    const row = owner
      ? this.db
          .prepare("SELECT data FROM requests WHERE id=? AND owner=?")
          .get(id, owner)
      : this.db.prepare("SELECT data FROM requests WHERE id=?").get(id);
    return row
      ? ({ revision: 1, ...JSON.parse(String(row.data)) } as StoredRequest)
      : undefined;
  }
  list(owner: string) {
    return this.db
      .prepare(
        "SELECT data FROM requests WHERE owner=? ORDER BY created DESC LIMIT 30",
      )
      .all(owner)
      .map((r) => JSON.parse(String(r.data)) as StoredRequest);
  }
  save(record: StoredRequest) {
    record.revision = (record.revision ?? 1) + 1;
    this.db
      .prepare("UPDATE requests SET data=?,state=? WHERE id=? AND owner=?")
      .run(JSON.stringify(record), record.state, record.id, record.owner);
  }
  delete(id: string, owner: string) {
    this.db
      .prepare("DELETE FROM requests WHERE id=? AND owner=?")
      .run(id, owner);
  }
  pendingCount() {
    return Number(
      this.db
        .prepare(
          "SELECT COUNT(*) AS n FROM requests WHERE state IN ('queued','processing')",
        )
        .get()!.n,
    );
  }
  next() {
    const row = this.db
      .prepare(
        "SELECT id,payload FROM requests WHERE state='queued' ORDER BY created LIMIT 1",
      )
      .get();
    if (!row) return;
    const record = this.get(String(row.id))!;
    record.state = "processing";
    this.save(record);
    const raw = JSON.parse(String(row.payload));
    const payload: ObservationRequest = {
      ...raw,
      images: raw.images.map((i: { bytes: string }) => ({
        ...i,
        bytes: Buffer.from(i.bytes, "base64"),
      })),
    };
    return { record, payload };
  }
  clearPayload(id: string) {
    this.db.prepare("UPDATE requests SET payload=NULL WHERE id=?").run(id);
  }
  cleanup() {
    const now = Date.now();
    this.db.prepare("DELETE FROM sessions WHERE expires<=?").run(now);
    this.db
      .prepare(
        "DELETE FROM requests WHERE created<=? OR owner NOT IN (SELECT id FROM sessions)",
      )
      .run(now - 86400000);
    this.db.prepare("DELETE FROM quota WHERE expires<=?").run(now);
    this.db
      .prepare(
        "DELETE FROM idempotency WHERE expires<=? OR owner NOT IN (SELECT id FROM sessions)",
      )
      .run(now);
    this.db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  }
  close() {
    this.db.close();
  }
}
