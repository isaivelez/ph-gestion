import test from "node:test";
import assert from "node:assert/strict";
import { calcularInteresMora } from "../src/lib/finance.js";

test("prorratea la tasa mensual por días", () => {
  assert.equal(calcularInteresMora(250000, 92, 0.02, 5), 15333);
});
test("dentro de gracia es 0", () => {
  assert.equal(calcularInteresMora(250000, 3, 0.02, 5), 0);
  assert.equal(calcularInteresMora(250000, 5, 0.02, 5), 0);
});
test("pasada la gracia cobra", () => {
  assert.equal(calcularInteresMora(250000, 6, 0.02, 5), 1000);
});
test("saldo 0 es 0", () => {
  assert.equal(calcularInteresMora(0, 50, 0.02, 5), 0);
});

import { estadoPorSaldo } from "../src/lib/finance.js";
test("estadoPorSaldo compara numéricamente valores en texto", () => {
  assert.equal(estadoPorSaldo("250000.00", "0.00", "Pendiente"), "Pagada");
  assert.equal(estadoPorSaldo("250000.00", "50000.00", "Pendiente"), "Parcialmente pagada");
  assert.equal(estadoPorSaldo("250000.00", "250000.00", "Pendiente"), "Pendiente");
  assert.equal(estadoPorSaldo("250000.00", "0.00", "Anulada"), "Anulada");
});

import { diasEntre, estaEnMora } from "../src/lib/finance.js";
test("estadoPorSaldo: pago total exacto y saldo negativo es Pagada", () => {
  assert.equal(estadoPorSaldo("250000.00", "0", "Pendiente"), "Pagada");
  assert.equal(estadoPorSaldo(250000, 0, "Parcialmente pagada"), "Pagada");
});
test("calcularInteresMora acepta tasa y saldo como texto (pg NUMERIC)", () => {
  assert.equal(calcularInteresMora("250000.00", 92, "0.0200", 5), 15333);
});
test("calcularInteresMora sin gracia prorratea 30 días = 1 mes", () => {
  assert.equal(calcularInteresMora(100000, 30, 0.02), 2000);
});
test("diasEntre cuenta días calendario", () => {
  assert.equal(diasEntre("2026-08-10", "2026-08-13"), 3);
});
test("estaEnMora compara contra la fecha dada", () => {
  assert.equal(estaEnMora("2026-08-10", new Date("2026-08-11")), true);
  assert.equal(estaEnMora("2026-08-10", new Date("2026-08-09")), false);
});
