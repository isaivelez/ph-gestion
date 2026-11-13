import test from "node:test";
import assert from "node:assert/strict";
import { estadoPorSaldo } from "../src/lib/finance.js";

test("estadoPorSaldo devuelve Pagada cuando el saldo es cero", () => {
  assert.equal(estadoPorSaldo(250000, 0, "Pendiente"), "Pagada");
});

test("estadoPorSaldo acepta valores NUMERIC de PostgreSQL como texto", () => {
  assert.equal(estadoPorSaldo("250000.00", "0.00", "Pendiente"), "Pagada");
});

test("estadoPorSaldo devuelve Parcialmente pagada cuando el saldo es menor al total", () => {
  assert.equal(estadoPorSaldo(250000, 150000, "Pendiente"), "Parcialmente pagada");
});

test("estadoPorSaldo devuelve Pendiente cuando el saldo es igual al total", () => {
  assert.equal(estadoPorSaldo(250000, 250000, "Parcialmente pagada"), "Pendiente");
});

test("estadoPorSaldo conserva el estado Anulada", () => {
  assert.equal(estadoPorSaldo(250000, 250000, "Anulada"), "Anulada");
});
