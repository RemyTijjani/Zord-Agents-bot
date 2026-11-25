import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required to run Neon migrations.");
}

const sql = neon(process.env.DATABASE_URL);
await sql`
  CREATE TABLE IF NOT EXISTS public.schema_migrations (
    version text PRIMARY KEY,
    checksum text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now()
  )
`;

const directory = resolve("db/migrations");
const files = (await readdir(directory)).filter((name) => name.endsWith(".sql")).sort();

for (const filename of files) {
  const version = filename.replace(/\.sql$/, "");
  const contents = await readFile(resolve(directory, filename), "utf8");
  const checksum = createHash("sha256").update(contents).digest("hex");
  const existing = await sql`
    SELECT checksum FROM public.schema_migrations WHERE version = ${version} LIMIT 1
  `;
  if (existing[0]) {
    if (existing[0].checksum !== checksum) {
      throw new Error(`Migration checksum changed after application: ${version}`);
    }
    continue;
  }

  const statements = contents.split(";").map((statement) => statement.trim()).filter(Boolean);
  for (const statement of statements) await sql.query(statement);
  await sql`
    INSERT INTO public.schema_migrations (version, checksum)
    VALUES (${version}, ${checksum})
  `;
  process.stdout.write(`Applied ${version}\n`);
}
