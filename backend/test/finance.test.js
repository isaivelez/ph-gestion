import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  calcularInteresMora,
  diasEntre,
  estadoPorSaldo,
  estaEnMora,
} from "../src/lib/finance.js";

describe("estadoPorSaldo", () => {
  test("marca Pagada con saldo numérico cero o negativo", () => {
    assert.equal(estadoPorSaldo(250000, 0, "Pendiente"), "Pagada");
    assert.equal(estadoPorSaldo("250000.00", "0.00", "Pendiente"), "Pagada");
  });

  test("marca Parcialmente pagada cuando el saldo es menor al total", () => {
    assert.equal(estadoPorSaldo("250000.00", "50000.00", "Pendiente"), "Parcialmente pagada");
  });

  test("marca Pendiente cuando el saldo es igual al total", () => {
    assert.equal(estadoPorSaldo("250000.00", "250000.00", "Parcialmente pagada"), "Pendiente");
  });

  test("conserva el estado Anulada", () => {
    assert.equal(estadoPorSaldo(250000, 250000, "Anulada"), "Anulada");
  });
});

describe("calcularInteresMora", () => {
  test("prorratea la tasa mensual por días", () => {
    assert.equal(calcularInteresMora("250000.00", 92, "0.0200", 5), 15333);
  });

  test("dentro de gracia no genera interés y pasada la gracia cobra", () => {
    assert.equal(calcularInteresMora(250000, 5, 0.02, 5), 0);
    assert.equal(calcularInteresMora(250000, 6, 0.02, 5), 1000);
  });

  test("un mes completo equivale a la tasa mensual", () => {
    assert.equal(calcularInteresMora(100000, 30, 0.02), 2000);
  });

  test("no genera interés sin mora o sin saldo", () => {
    assert.equal(calcularInteresMora(100000, 0, 0.02), 0);
    assert.equal(calcularInteresMora(0, 50, 0.02, 5), 0);
  });
});

describe("diasEntre y estaEnMora", () => {
  test("calcula días calendario", () => {
    assert.equal(diasEntre("2026-08-10", "2026-08-13"), 3);
  });

  test("compara mora contra la fecha indicada", () => {
    assert.equal(estaEnMora("2026-08-10", new Date("2026-08-11")), true);
    assert.equal(estaEnMora("2026-08-10", new Date("2026-08-09")), false);
  });
});
