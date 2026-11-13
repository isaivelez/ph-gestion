// Utilidades para las pruebas de integración.
// Crean una base de datos temporal con el esquema y el seed del proyecto,
// de modo que las pruebas puedan escribir sin afectar la base de desarrollo.
import pg from "pg";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_CONFIG = {
  host: process.env.PGHOST || "localhost",
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || "ph_user",
  password: process.env.PGPASSWORD || "ph_pass",
  database: process.env.PGDATABASE || "ph_gestion",
};

// URL de conexión de una base de datos concreta, partiendo de DATABASE_URL
// (Docker) o de los valores por defecto del docker-compose.
export function connectionStringFor(database) {
  const url = process.env.DATABASE_URL;
  if (url) {
    const parsed = new URL(url);
    parsed.pathname = `/${database}`;
    return parsed.toString();
  }
  const { host, port, user, password } = DEFAULT_CONFIG;
  return `postgres://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
}

// Las pruebas pueden correr desde el repo o dentro del contenedor `api`,
// donde solo se montan backend/src y backend/test.
function findSqlDir() {
  const candidates = [
    process.env.DB_SQL_DIR,
    fileURLToPath(new URL("../../../db", import.meta.url)),
    path.resolve(process.cwd(), "../db"),
    path.resolve(process.cwd(), "db"),
    "/app/db",
  ].filter(Boolean);

  const found = candidates.find((dir) => existsSync(path.join(dir, "schema.sql")));
  if (!found) {
    throw new Error(
      `No se encontró db/schema.sql. Rutas probadas: ${candidates.join(", ")}. ` +
        "Define DB_SQL_DIR con la carpeta que contiene schema.sql y seed.sql.",
    );
  }
  return found;
}

// ¿Hay un PostgreSQL accesible? Si no, las pruebas de integración se omiten.
export async function databaseAvailable() {
  const client = new pg.Client({ connectionString: connectionStringFor("postgres") });
  try {
    await client.connect();
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => {});
  }
}

export async function createTestDatabase(prefix = "ph_test") {
  const name = `${prefix}_${process.pid}_${Date.now().toString(36)}`.toLowerCase();

  const admin = new pg.Client({ connectionString: connectionStringFor("postgres") });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
  } finally {
    await admin.end();
  }

  const sqlDir = findSqlDir();
  const client = new pg.Client({ connectionString: connectionStringFor(name) });
  await client.connect();
  try {
    await client.query(await readFile(path.join(sqlDir, "schema.sql"), "utf8"));
    await client.query(await readFile(path.join(sqlDir, "seed.sql"), "utf8"));
  } catch (error) {
    await client.end().catch(() => {});
    await dropTestDatabase(name);
    throw error;
  }
  await client.end();

  return name;
}

export async function dropTestDatabase(name) {
  const admin = new pg.Client({ connectionString: connectionStringFor("postgres") });
  await admin.connect();
  try {
    await admin.query(
      `SELECT pg_terminate_backend(pid)
         FROM pg_stat_activity
        WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [name],
    );
    await admin.query(`DROP DATABASE IF EXISTS "${name}"`);
  } finally {
    await admin.end();
  }
}
