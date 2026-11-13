// Pruebas de integración del módulo de recaudos contra PostgreSQL real.
// Cada ejecución usa una base de datos temporal (esquema + seed) y la elimina al final.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";

import {
  connectionStringFor,
  createTestDatabase,
  databaseAvailable,
  dropTestDatabase,
} from "./helpers/test-db.js";

const dbAvailable = await databaseAvailable();
const skip = dbAvailable
  ? false
  : "PostgreSQL no disponible; inicia la base con `docker compose up -d db`";

let dbName = null;
let server = null;
let baseUrl = null;
let token = null;

before(async () => {
  if (!dbAvailable) return;

  dbName = await createTestDatabase("ph_test_recaudos");
  process.env.DATABASE_URL = connectionStringFor(dbName);
  process.env.JWT_SECRET = process.env.JWT_SECRET || "examen-pruebas-2026";

  // Se importa después de apuntar DATABASE_URL a la base temporal.
  const { default: app } = await import("../src/app.js");
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  token = await iniciarSesion();
});

after(async () => {
  if (!dbAvailable) return;

  server?.closeAllConnections?.();
  await new Promise((resolve) => server.close(resolve));

  const { pool } = await import("../src/lib/db.js");
  await pool.end();

  await dropTestDatabase(dbName);
});

function authHeaders() {
  return { Authorization: `Bearer ${token}` };
}

async function iniciarSesion(email = "admin1@laspalmas.co") {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "Examen2026*" }),
  });
  assert.equal(res.status, 200, "el login debe responder 200");
  const body = await res.json();
  return body.token;
}

async function registrarRecaudo({ inmueble_id, valor, medio = "Transferencia", fecha }) {
  const res = await fetch(`${baseUrl}/api/recaudos`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ inmueble_id, valor, medio, fecha }),
  });
  return { status: res.status, body: await res.json() };
}

async function estadoCuenta(inmuebleId) {
  const res = await fetch(`${baseUrl}/api/inmuebles/${inmuebleId}/estado-cuenta`, {
    headers: authHeaders(),
  });
  assert.equal(res.status, 200, "el estado de cuenta debe responder 200");
  const body = await res.json();
  return Object.fromEntries(body.facturas.map((f) => [f.periodo.trim(), f]));
}

test(
  "aplica el pago a la factura más antigua del inmueble (2026-07)",
  { skip },
  async () => {
    const { status, body } = await registrarRecaudo({ inmueble_id: 2, valor: 250000 });

    assert.equal(status, 201);
    assert.equal(body.no_aplicado, 0);
    assert.deepEqual(body.aplicaciones, [
      { factura_id: 4, valor_aplicado: 250000, estado: "Pagada" },
    ]);

    const facturas = await estadoCuenta(2);
    assert.equal(Number(facturas["2026-07"].saldo), 0, "la factura 2026-07 debe quedar saldada");
    assert.equal(facturas["2026-07"].estado, "Pagada");

    // La siguiente factura (2026-08) sigue pendiente: no se abonó a la más nueva.
    assert.equal(Number(facturas["2026-08"].saldo), 250000);
    assert.equal(facturas["2026-08"].estado, "Vencida");
  },
);

test(
  "derrama el excedente a la siguiente factura en orden de vencimiento",
  { skip },
  async () => {
    // Inmueble 4: facturas 11 (2026-08), 12 (2026-09) y 13 (2026-10) por 250000.
    const { status, body } = await registrarRecaudo({ inmueble_id: 4, valor: 300000 });

    assert.equal(status, 201);
    assert.equal(body.no_aplicado, 0);
    assert.deepEqual(body.aplicaciones, [
      { factura_id: 11, valor_aplicado: 250000, estado: "Pagada" },
      { factura_id: 12, valor_aplicado: 50000, estado: "Parcialmente pagada" },
    ]);

    const facturas = await estadoCuenta(4);
    assert.equal(Number(facturas["2026-08"].saldo), 0);
    assert.equal(facturas["2026-08"].estado, "Pagada");
    assert.equal(Number(facturas["2026-09"].saldo), 200000);
    assert.equal(facturas["2026-09"].estado, "Parcialmente pagada");
    assert.equal(Number(facturas["2026-10"].saldo), 250000);
    assert.equal(facturas["2026-10"].estado, "Pendiente");
  },
);

test(
  "deja como no aplicado el dinero que excede la deuda del inmueble",
  { skip },
  async () => {
    // Inmueble 1 no tiene facturas pendientes (todas están pagadas).
    const { status, body } = await registrarRecaudo({ inmueble_id: 1, valor: 100000 });

    assert.equal(status, 201);
    assert.deepEqual(body.aplicaciones, []);
    assert.equal(body.no_aplicado, 100000);
  },
);
