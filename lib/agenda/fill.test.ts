import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  defaultMonthFillOpen,
  fillDeniedMessage,
  isFillOpenForUser,
} from "./fill.ts";

describe("preenchimento da agenda", () => {
  const today = "2026-10-21";

  it("mês atual abre por padrão", () => {
    assert.equal(defaultMonthFillOpen("2026-10", today), true);
  });

  it("mês seguinte fecha até 10 dias antes do dia 1", () => {
    assert.equal(defaultMonthFillOpen("2026-11", today), false);
    assert.equal(defaultMonthFillOpen("2026-11", "2026-10-22"), true);
  });

  it("dezembro não entra na janela", () => {
    assert.equal(defaultMonthFillOpen("2026-12", today), false);
    assert.equal(
      isFillOpenForUser({ ym: "2026-12", todayISO: today, adminLocked: false, isAdmin: true }),
      false
    );
  });

  it("admin libera o próximo mês antes da data", () => {
    assert.equal(
      isFillOpenForUser({ ym: "2026-11", todayISO: today, adminLocked: false, isAdmin: false }),
      true
    );
  });

  it("admin bloqueia o mês atual para a equipe, mas ainda cadastra", () => {
    assert.equal(
      isFillOpenForUser({ ym: "2026-10", todayISO: today, adminLocked: true, isAdmin: false }),
      false
    );
    assert.equal(
      isFillOpenForUser({ ym: "2026-10", todayISO: today, adminLocked: true, isAdmin: true }),
      true
    );
    assert.match(fillDeniedMessage("2026-10", today, true), /bloqueado/i);
  });

  it("sem override, admin já cadastra o próximo mês", () => {
    assert.equal(
      isFillOpenForUser({ ym: "2026-11", todayISO: today, adminLocked: null, isAdmin: true }),
      true
    );
    assert.equal(
      isFillOpenForUser({ ym: "2026-11", todayISO: today, adminLocked: null, isAdmin: false }),
      false
    );
  });
});
