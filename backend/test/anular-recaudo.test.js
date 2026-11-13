// Test de integración del endpoint POST /api/recaudos/:id/anular.
// Requiere una base PostgreSQL con el esquema cargado. Usa DATABASE_URL
// (por defecto postgres://ph_user:ph_pass@localhost:5432/ph_gestion).
// Crea datos temporales y los elimina al finalizar cada caso.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { pool } from "../src/lib/db.js";
import { signToken } from "../src/lib/auth.js";
import recaudoRoutes from "../src/routes/recaudos.js";

let server;
let baseUrl;

before(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/recaudos", recaudoRoutes);

  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

// Crea un condominio, un inmueble, sus facturas, un pago y sus aplicaciones.
// `facturas` recibe el saldo posterior al pago y el valor aplicado.
async function crearEscenario(facturas) {
  const condominio = await pool.query(
    "INSERT INTO condominio (nombre) VALUES ($1) RETURNING id",
    [`Test anulación ${Date.now()}-${Math.random()}`]
  );
  const condominioId = condominio.rows[0].id;

  const inmueble = await pool.query(
    `INSERT INTO inmueble (condominio_id, identificacion, coeficiente)
     VALUES ($1, 'T-01', 1) RETURNING id`,
    [condominioId]
  );
  const inmuebleId = inmueble.rows[0].id;

  const facturasCreadas = [];
  for (const f of facturas) {
    const res = await pool.query(
      `INSERT INTO factura
         (condominio_id, inmueble_id, periodo, fecha_emision, fecha_vencimiento,
          subtotal, total, saldo, estado)
       VALUES ($1, $2, '2026-08', '2026-08-01', '2026-09-10', $3, $3, $4, $5)
       RETURNING id`,
      [condominioId, inmuebleId, f.total, f.saldo, f.estado || "Parcialmente pagada"]
    );
    facturasCreadas.push({ id: res.rows[0].id, ...f });
  }

  const valor = facturasCreadas.reduce((suma, f) => suma + f.aplicado, 0);
  const pago = await pool.query(
    `INSERT INTO pago (condominio_id, inmueble_id, fecha, valor)
     VALUES ($1, $2, CURRENT_DATE, $3) RETURNING id`,
    [condominioId, inmuebleId, valor]
  );
  const pagoId = pago.rows[0].id;

  for (const f of facturasCreadas) {
    await pool.query(
      "INSERT INTO pago_aplicacion (pago_id, factura_id, valor_aplicado) VALUES ($1, $2, $3)",
      [pagoId, f.id, f.aplicado]
    );
  }

  return { condominioId, inmuebleId, pagoId, facturas: facturasCreadas };
}

async function eliminarEscenario(escenario) {
  await pool.query("DELETE FROM pago WHERE id = $1", [escenario.pagoId]);
  for (const f of escenario.facturas) {
    await pool.query("DELETE FROM factura WHERE id = $1", [f.id]);
  }
  await pool.query("DELETE FROM inmueble WHERE id = $1", [escenario.inmuebleId]);
  await pool.query("DELETE FROM condominio WHERE id = $1", [escenario.condominioId]);
}

async function anular(escenario) {
  const token = signToken({
    id: 1,
    rol: "admin_copropiedad",
    condominio_id: escenario.condominioId,
    nombres: "Usuario de prueba",
  });
  const res = await fetch(`${baseUrl}/api/recaudos/${escenario.pagoId}/anular`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  return res;
}

async function saldoYEstado(facturaId) {
  const { rows } = await pool.query(
    "SELECT total, saldo, estado FROM factura WHERE id = $1",
    [facturaId]
  );
  return { total: Number(rows[0].total), saldo: Number(rows[0].saldo), estado: rows[0].estado };
}

test("al anular un recaudo restaura el saldo y el estado de la factura", async () => {
  const escenario = await crearEscenario([
    { total: 250000, saldo: 150000, aplicado: 100000, estado: "Parcialmente pagada" },
  ]);

  try {
    const res = await anular(escenario);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { pago_id: escenario.pagoId, anulado: true });

    const f = await saldoYEstado(escenario.facturas[0].id);
    assert.equal(f.saldo, 250000);
    assert.equal(f.estado, "Pendiente");

    const pago = await pool.query("SELECT anulado FROM pago WHERE id = $1", [escenario.pagoId]);
    assert.equal(pago.rows[0].anulado, true);

    const aplicaciones = await pool.query(
      "SELECT COUNT(*)::int AS n FROM pago_aplicacion WHERE pago_id = $1",
      [escenario.pagoId]
    );
    assert.equal(aplicaciones.rows[0].n, 0);
  } finally {
    await eliminarEscenario(escenario);
  }
});

test("al anular un recaudo restaura todas las facturas del derrame", async () => {
  const escenario = await crearEscenario([
    { total: 250000, saldo: 0, aplicado: 250000, estado: "Pagada" },
    { total: 250000, saldo: 150000, aplicado: 100000, estado: "Parcialmente pagada" },
  ]);

  try {
    const res = await anular(escenario);
    assert.equal(res.status, 200);

    const primera = await saldoYEstado(escenario.facturas[0].id);
    assert.equal(primera.saldo, 250000);
    assert.equal(primera.estado, "Pendiente");

    const segunda = await saldoYEstado(escenario.facturas[1].id);
    assert.equal(segunda.saldo, 250000);
    assert.equal(segunda.estado, "Pendiente");
  } finally {
    await eliminarEscenario(escenario);
  }
});

test("al anular un recaudo mantiene el estado Parcialmente pagada si aún queda saldo", async () => {
  const escenario = await crearEscenario([
    { total: 310000, saldo: 200000, aplicado: 50000, estado: "Parcialmente pagada" },
  ]);

  try {
    const res = await anular(escenario);
    assert.equal(res.status, 200);

    const f = await saldoYEstado(escenario.facturas[0].id);
    assert.equal(f.saldo, 250000);
    assert.equal(f.estado, "Parcialmente pagada");
  } finally {
    await eliminarEscenario(escenario);
  }
});

test("no revierte dos veces el saldo al intentar anular un recaudo ya anulado", async () => {
  const escenario = await crearEscenario([
    { total: 250000, saldo: 150000, aplicado: 100000, estado: "Parcialmente pagada" },
  ]);

  try {
    assert.equal((await anular(escenario)).status, 200);

    const segunda = await anular(escenario);
    assert.equal(segunda.status, 404);

    const f = await saldoYEstado(escenario.facturas[0].id);
    assert.equal(f.saldo, 250000);
  } finally {
    await eliminarEscenario(escenario);
  }
});
