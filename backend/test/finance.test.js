import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  calcularInteresMora,
  diasEntre,
  estadoPorSaldo,
  estaEnMora,
} from "../src/lib/finance.js";

describe("estadoPorSaldo", () => {
  // Regresión: PostgreSQL devuelve NUMERIC como string ("0.00");
  // una factura sin saldo debe quedar "Pagada", no "Parcialmente pagada".
  test("marca Pagada cuando el saldo es un NUMERIC en texto", () => {
    assert.equal(estadoPorSaldo("250000.00", "0.00", "Vencida"), "Pagada");
  });

  test("marca Pagada cuando el saldo es el número 0", () => {
    assert.equal(estadoPorSaldo(250000, 0, "Pendiente"), "Pagada");
  });

  test("marca Parcialmente pagada cuando el saldo es menor al total", () => {
    assert.equal(estadoPorSaldo("310000.00", "150000.00", "Pendiente"), "Parcialmente pagada");
  });

  test("marca Pendiente cuando no se ha abonado nada", () => {
    assert.equal(estadoPorSaldo("250000.00", "250000.00", "Pendiente"), "Pendiente");
  });

  test("conserva el estado Anulada", () => {
    assert.equal(estadoPorSaldo("60000.00", "60000.00", "Anulada"), "Anulada");
  });
});

describe("calcularInteresMora", () => {
  test("prorratea la tasa mensual por días", () => {
    assert.equal(calcularInteresMora(250000, 92, 0.02, 5), 15333);
  });

  test("calcula el interés de un mes completo con la tasa mensual", () => {
    // 100000 * 0.02 * (30 / 30) = 2000
    assert.equal(calcularInteresMora("100000.00", 30, 0.02), 2000);
  });

  test("dentro de los días de gracia no genera interés", () => {
    assert.equal(calcularInteresMora(250000, 3, 0.02, 5), 0);
    assert.equal(calcularInteresMora(250000, 5, 0.02, 5), 0);
  });

  test("pasada la gracia cobra", () => {
    assert.equal(calcularInteresMora(250000, 6, 0.02, 5), 1000);
  });

  test("no genera interés si no hay días de mora", () => {
    assert.equal(calcularInteresMora("100000.00", 0, 0.02), 0);
    assert.equal(calcularInteresMora("100000.00", -5, 0.02), 0);
  });

  test("no genera interés si el saldo es cero", () => {
    assert.equal(calcularInteresMora("0.00", 50, 0.02, 5), 0);
  });
});

describe("diasEntre", () => {
  test("cuenta los días calendario entre dos fechas", () => {
    assert.equal(diasEntre("2026-08-10", "2026-09-09"), 30);
  });

  test("devuelve negativo si la fecha final es anterior", () => {
    assert.equal(diasEntre("2026-09-10", "2026-08-10"), -31);
  });
});

describe("estaEnMora", () => {
  test("considera en mora una factura vencida antes de hoy", () => {
    assert.equal(estaEnMora("2026-08-10", new Date("2026-11-10")), true);
  });

  test("no considera en mora una factura que vence hoy o después", () => {
    assert.equal(estaEnMora("2026-11-10", new Date("2026-11-10")), false);
    assert.equal(estaEnMora("2026-12-10", new Date("2026-11-10")), false);
  });
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
