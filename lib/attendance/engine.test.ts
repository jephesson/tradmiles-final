import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SESSION_IDLE_MS } from "../session-idle.ts";
import {
  attendancePeriodForMonth,
  attendanceRatio,
  attendanceScore,
  computeAttendance,
  sessionCountable,
  hoursFromMs,
} from "./engine.ts";

const period = attendancePeriodForMonth("2026-10");

function at(iso: string, hm: string) {
  return new Date(`${iso}T${hm}:00-03:00`);
}

describe("período", () => {
  it("13. começa em 15/10/2026 e ignora o que veio antes", () => {
    assert.equal(period.startISO, "2026-10-15");
    assert.equal(period.endISO, "2026-10-31");
    assert.equal(period.days, 17);
    assert.ok(Math.abs(period.minHours - (20 * 17) / 7) < 1e-12);
  });
});

describe("sessão", () => {
  it("15. 1h sem clique encerra a sessão; clique renovaria o last", () => {
    const start = Date.parse("2026-10-20T10:00:00-03:00");
    const last = start;
    const span = sessionCountable({ startedAt: start, lastActivityAt: last });
    assert.equal(span.end - span.start, SESSION_IDLE_MS);
    const afterClick = sessionCountable({
      startedAt: start,
      lastActivityAt: start + 20 * 60_000,
    });
    assert.equal(afterClick.end - afterClick.start, SESSION_IDLE_MS + 20 * 60_000);
  });
});

describe("regras de horas", () => {
  const users = [
    { id: "a", name: "Ana", login: "ana" },
    { id: "b", name: "Bia", login: "bia" },
  ];

  it("1. cumpre o turno próprio por inteiro", () => {
    const start = at("2026-10-20", "08:00");
    const last = at("2026-10-20", "09:00");
    const r = computeAttendance({
      period,
      users,
      shifts: [{ userId: "a", dateISO: "2026-10-20", startMin: 8 * 60, endMin: 10 * 60 }],
      sessions: [{ userId: "a", startedAt: start, lastActivityAt: last }],
      sales: [],
    });
    const p = r.people.find((x) => x.userId === "a")!;
    assert.equal(p.declaredHours, 2);
    assert.equal(p.fulfilledHours, 2);
  });

  it("2. declara 2h e cumpre 1h30", () => {
    const start = at("2026-10-20", "08:00");
    const last = at("2026-10-20", "08:30");
    const r = computeAttendance({
      period,
      users,
      shifts: [{ userId: "a", dateISO: "2026-10-20", startMin: 8 * 60, endMin: 10 * 60 }],
      sessions: [{ userId: "a", startedAt: start, lastActivityAt: last }],
      sales: [],
    });
    const p = r.people.find((x) => x.userId === "a")!;
    assert.equal(p.declaredHours, 2);
    assert.equal(p.fulfilledHours, 1.5);
  });

  it("3. cobre 1h30 de horário livre", () => {
    const start = at("2026-10-20", "08:00");
    const last = at("2026-10-20", "08:30");
    const r = computeAttendance({
      period,
      users,
      shifts: [],
      sessions: [{ userId: "a", startedAt: start, lastActivityAt: last }],
      sales: [],
    });
    const p = r.people.find((x) => x.userId === "a")!;
    assert.equal(p.voluntaryHours, 1.5);
    assert.equal(p.declaredHours, 1.5);
    assert.equal(p.fulfilledHours, 1.5);
  });

  it("4. entra no turno de outro sem emissão: não conta", () => {
    const start = at("2026-10-20", "08:00");
    const r = computeAttendance({
      period,
      users,
      shifts: [{ userId: "b", dateISO: "2026-10-20", startMin: 8 * 60, endMin: 13 * 60 }],
      sessions: [{ userId: "a", startedAt: start, lastActivityAt: start }],
      sales: [],
    });
    const p = r.people.find((x) => x.userId === "a")!;
    assert.equal(p.declaredHours, 0);
    assert.equal(p.fulfilledHours, 0);
    assert.equal(p.creditHours, 0);
  });

  it("5. entra no turno de outro e emite: 1h de crédito", () => {
    const start = at("2026-10-20", "08:00");
    const r = computeAttendance({
      period,
      users,
      shifts: [{ userId: "b", dateISO: "2026-10-20", startMin: 8 * 60, endMin: 13 * 60 }],
      sessions: [{ userId: "a", startedAt: start, lastActivityAt: start }],
      sales: [{ id: "s1", userId: "a", at: at("2026-10-20", "09:10") }],
    });
    const p = r.people.find((x) => x.userId === "a")!;
    assert.equal(p.fulfilledHours, 0);
    assert.equal(p.creditHours, 1);
  });

  it("6. duas emissões válidas geram 2h de crédito", () => {
    const r = computeAttendance({
      period,
      users,
      shifts: [{ userId: "b", dateISO: "2026-10-20", startMin: 8 * 60, endMin: 13 * 60 }],
      sessions: [],
      sales: [
        { id: "s1", userId: "a", at: at("2026-10-20", "09:10") },
        { id: "s2", userId: "a", at: at("2026-10-20", "10:10") },
      ],
    });
    assert.equal(r.people.find((x) => x.userId === "a")!.creditHours, 2);
  });

  it("7. a mesma emissão duas vezes gera 1h", () => {
    const r = computeAttendance({
      period,
      users,
      shifts: [{ userId: "b", dateISO: "2026-10-20", startMin: 8 * 60, endMin: 13 * 60 }],
      sessions: [],
      sales: [
        { id: "s1", userId: "a", at: at("2026-10-20", "09:10") },
        { id: "s1", userId: "a", at: at("2026-10-20", "09:10") },
      ],
    });
    assert.equal(r.people.find((x) => x.userId === "a")!.creditHours, 1);
  });

  it("8. fora da agenda, sem livre e sem emissão: nada", () => {
    const start = at("2026-10-20", "01:00");
    const r = computeAttendance({
      period,
      users,
      shifts: [{ userId: "b", dateISO: "2026-10-20", startMin: 8 * 60, endMin: 13 * 60 }],
      sessions: [{ userId: "a", startedAt: start, lastActivityAt: start }],
      sales: [],
    });
    const p = r.people.find((x) => x.userId === "a")!;
    assert.equal(p.declaredHours, 0);
    assert.equal(p.fulfilledHours, 0);
    assert.equal(p.creditHours, 0);
  });

  it("12. crédito não aumenta assiduidade nem horas cumpridas", () => {
    const start = at("2026-10-20", "08:00");
    const last = at("2026-10-20", "08:30");
    const r = computeAttendance({
      period,
      users,
      shifts: [
        { userId: "a", dateISO: "2026-10-20", startMin: 8 * 60, endMin: 10 * 60 },
        { userId: "b", dateISO: "2026-10-21", startMin: 8 * 60, endMin: 13 * 60 },
      ],
      sessions: [{ userId: "a", startedAt: start, lastActivityAt: last }],
      sales: [{ id: "sx", userId: "a", at: at("2026-10-21", "09:00") }],
    });
    const p = r.people.find((x) => x.userId === "a")!;
    assert.equal(p.declaredHours, 2);
    assert.equal(p.fulfilledHours, 1.5);
    assert.equal(p.creditHours, 1);
    assert.equal(p.attendance, 1.5 / 2);
    assert.equal(p.adjustedHours, 2.5);
    assert.equal(p.days.length, 1);
    assert.equal(p.days[0].attendance, 1.5 / 2);
  });

  it("18. a assiduidade é a média dos dias, não o total de horas", () => {
    const r = computeAttendance({
      period,
      users,
      nowMs: at("2026-10-21", "18:00").getTime(),
      shifts: [
        { userId: "a", dateISO: "2026-10-20", startMin: 8 * 60, endMin: 16 * 60 },
        { userId: "a", dateISO: "2026-10-21", startMin: 8 * 60, endMin: 10 * 60 },
      ],
      sessions: [
        {
          userId: "a",
          startedAt: at("2026-10-20", "08:00"),
          lastActivityAt: at("2026-10-20", "15:00"),
        },
      ],
      sales: [],
    });
    const p = r.people.find((x) => x.userId === "a")!;
    assert.equal(p.days.length, 2);
    assert.equal(p.days[0].attendance, 1);
    assert.equal(p.days[1].attendance, 0);
    assert.equal(p.attendance, 0.5);
    assert.equal(p.declaredHours, 10);
    assert.equal(p.fulfilledHours, 8);
  });

  it("turno futuro não puxa a média para baixo", () => {
    const r = computeAttendance({
      period,
      users,
      nowMs: at("2026-10-20", "18:00").getTime(),
      shifts: [
        { userId: "a", dateISO: "2026-10-20", startMin: 8 * 60, endMin: 16 * 60 },
        { userId: "a", dateISO: "2026-10-30", startMin: 8 * 60, endMin: 16 * 60 },
      ],
      sessions: [
        {
          userId: "a",
          startedAt: at("2026-10-20", "08:00"),
          lastActivityAt: at("2026-10-20", "15:00"),
        },
      ],
      sales: [],
    });
    const p = r.people.find((x) => x.userId === "a")!;
    assert.equal(p.declaredHours, 16);
    assert.equal(p.fulfilledHours, 8);
    assert.equal(p.missedHours, 0);
    assert.equal(p.attendance, 1);
    assert.equal(p.days.filter((d) => d.upcoming).length, 1);
  });

  it("no meio do turno de hoje só conta o que já deveria ter sido feito", () => {
    const r = computeAttendance({
      period,
      users,
      nowMs: at("2026-10-20", "12:00").getTime(),
      shifts: [{ userId: "a", dateISO: "2026-10-20", startMin: 8 * 60, endMin: 18 * 60 }],
      sessions: [
        {
          userId: "a",
          startedAt: at("2026-10-20", "08:00"),
          lastActivityAt: at("2026-10-20", "11:00"),
        },
      ],
      sales: [],
    });
    const p = r.people.find((x) => x.userId === "a")!;
    assert.equal(p.days.length, 1);
    assert.equal(p.days[0].declaredHours, 4);
    assert.equal(p.days[0].fulfilledHours, 4);
    assert.equal(p.attendance, 1);
    assert.equal(p.declaredHours, 10);
    assert.equal(p.fulfilledHours, 4);
    assert.equal(p.missedHours, 0);
  });

  it("turno da noite que ainda não começou não entra no dia", () => {
    const r = computeAttendance({
      period,
      users,
      nowMs: at("2026-10-20", "14:00").getTime(),
      shifts: [
        { userId: "a", dateISO: "2026-10-20", startMin: 8 * 60, endMin: 12 * 60 },
        { userId: "a", dateISO: "2026-10-20", startMin: 18 * 60, endMin: 22 * 60 },
      ],
      sessions: [
        {
          userId: "a",
          startedAt: at("2026-10-20", "08:00"),
          lastActivityAt: at("2026-10-20", "11:00"),
        },
      ],
      sales: [],
    });
    const p = r.people.find((x) => x.userId === "a")!;
    assert.equal(p.days[0].declaredHours, 4);
    assert.equal(p.days[0].fulfilledHours, 4);
    assert.equal(p.attendance, 1);
    assert.equal(p.declaredHours, 8);
    assert.equal(p.missedHours, 0);
  });

  it("14. intervalos simultâneos não duplicam", () => {
    const start = at("2026-10-20", "08:00");
    const r = computeAttendance({
      period,
      users,
      shifts: [{ userId: "a", dateISO: "2026-10-20", startMin: 8 * 60, endMin: 10 * 60 }],
      sessions: [
        { userId: "a", startedAt: start, lastActivityAt: start },
        { userId: "a", startedAt: start, lastActivityAt: start },
      ],
      sales: [],
    });
    assert.equal(r.people.find((x) => x.userId === "a")!.fulfilledHours, 1);
  });

  it("17h30 no fim do turno conta só até 18h", () => {
    const start = at("2026-10-20", "17:30");
    const r = computeAttendance({
      period,
      users,
      shifts: [{ userId: "a", dateISO: "2026-10-20", startMin: 13 * 60, endMin: 18 * 60 }],
      sessions: [{ userId: "a", startedAt: start, lastActivityAt: start }],
      sales: [],
    });
    const p = r.people.find((x) => x.userId === "a")!;
    assert.equal(p.declaredHours, 5);
    assert.equal(p.fulfilledHours, 0.5);
  });
});

describe("elegibilidade e score", () => {
  it("9. assiduidade exatamente 90% não é elegível", () => {
    const A = attendanceRatio(9, 10);
    assert.equal(A, 0.9);
    assert.equal(attendanceScore({ attendance: A, fulfilledHours: 50, creditHours: 0, minHours: 1 }), null);
  });

  it("10. 90,01% e mínimo cumprido é elegível", () => {
    const A = 0.9001;
    const s = attendanceScore({ attendance: A, fulfilledHours: 50, creditHours: 0, minHours: 48.57 });
    assert.ok(s != null && s > 0);
  });

  it("11. assiduidade alta sem mínimo não é elegível", () => {
    const s = attendanceScore({ attendance: 1, fulfilledHours: 10, creditHours: 0, minHours: 48.57 });
    assert.equal(s, null);
  });
});

describe("horas da sessão vs ping", () => {
  it("16. last duplicado não infla horas", () => {
    const start = Date.parse("2026-10-20T10:00:00-03:00");
    const a = sessionCountable({ startedAt: start, lastActivityAt: start });
    const b = sessionCountable({ startedAt: start, lastActivityAt: start });
    assert.equal(hoursFromMs(a.end - a.start), hoursFromMs(b.end - b.start));
    assert.equal(a.end - a.start, SESSION_IDLE_MS);
  });
});
