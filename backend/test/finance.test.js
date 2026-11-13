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
