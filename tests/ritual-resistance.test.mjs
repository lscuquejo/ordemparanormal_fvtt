import { describe, it, expect, beforeEach } from "vitest";
import {
	adjustDamageForResistance,
	allResistancesResolved,
	applyResistanceToDamage,
	canUserRollResistance,
	extractRollTotal,
	getRitualResistanceSpec,
	getResistanceResult,
	resistanceBlocksEffect,
	resolveRitualTargetOutcome,
	ritualNeedsResistance,
	splitBuffResistanceTargets,
	upsertResistanceResult,
} from "../module/helpers/ritual-resistance.mjs";

const decadencia = {
	system: {
		resistance: "reducesByHalf",
		skillResis: "resilience",
		description: `<p>Espirais de trevas...</p>
<p><strong>Aprimoramentos</strong></p><ul>
<li><strong>Discente (+2 PE):</strong> muda a resistência para "nenhuma" e o dano para 3d8+3.</li>
</ul>`,
	},
};

describe("getRitualResistanceSpec", () => {
	beforeEach(() => {
		global.CONFIG = { op: { skills: { resilience: "op.skill.resilience" } } };
		global.game = { i18n: { localize: (key) => key } };
	});

	it("reads base Fortitude half reduction", () => {
		const spec = getRitualResistanceSpec(decadencia, { key: "base", label: "Base" });
		expect(spec.skill).toBe("resilience");
		expect(spec.effect).toBe("reducesByHalf");
		expect(ritualNeedsResistance(spec)).toBe(true);
	});

	it("removes resistance on discente tier", () => {
		const spec = getRitualResistanceSpec(decadencia, { key: "discente", label: "Discente" });
		expect(spec.effect).toBe("none");
		expect(ritualNeedsResistance(spec)).toBe(false);
	});
});

describe("resistance flow helpers", () => {
	it("tracks pending and resolved resistance rolls", () => {
		const uuids = ["a", "b"];
		expect(allResistancesResolved(uuids, [])).toBe(false);
		expect(allResistancesResolved(uuids, { a: { passed: true } })).toBe(false);
		expect(allResistancesResolved(uuids, { a: { passed: true }, b: { passed: false } })).toBe(true);
	});

	it("reads Foundry-mangled Actor uuid keys from legacy object storage", () => {
		const mangled = { Actor: { abc123: { passed: false, total: 14 } } };
		expect(allResistancesResolved(["Actor.abc123"], mangled)).toBe(true);
		expect(getResistanceResult(mangled, "Actor.abc123")?.total).toBe(14);
	});

	it("stores resistance results as a uuid-keyed array", () => {
		const stored = upsertResistanceResult([], {
			actorUuid: "Actor.abc123",
			passed: false,
			total: 14,
		});
		expect(stored).toHaveLength(1);
		expect(allResistancesResolved(["Actor.abc123"], stored)).toBe(true);
	});

	it("allows target owner or GM to roll", () => {
		const owner = { id: "u1", isGM: false };
		const gm = { id: "gm", isGM: true };
		const actor = { testUserPermission: (user) => user.id === "u1" };
		expect(canUserRollResistance(owner, actor)).toBe(true);
		expect(canUserRollResistance(gm, actor)).toBe(true);
		expect(canUserRollResistance({ id: "other", isGM: false }, actor)).toBe(false);
	});

	it("halves damage only when resistance succeeds", () => {
		expect(adjustDamageForResistance(11, "reducesByHalf", true)).toBe(5);
		expect(applyResistanceToDamage(11, false, { effect: "reducesByHalf", skill: "resilience" })).toBe(11);
	});

	it("blocks effects on nullify success", () => {
		expect(resistanceBlocksEffect("nullifies", true)).toBe(true);
		expect(resistanceBlocksEffect("reducesByHalf", true)).toBe(false);
	});

	it("extracts roll total from evaluated d20 rolls", () => {
		const roll = {
			_evaluated: true,
			total: 14,
			isSuccess: false,
		};
		expect(extractRollTotal(roll)).toBe(14);
		expect(extractRollTotal({ _evaluated: true, total: 0, terms: [{ total: 12 }] })).toBe(0);
	});

	it("resolves per-target damage outcomes after resistance", () => {
		const spec = { skill: "resilience", effect: "reducesByHalf", label: "Fortitude" };
		expect(resolveRitualTargetOutcome(10, spec, true)).toEqual({
			damage: 5,
			negated: false,
			outcome: "half",
		});
		expect(resolveRitualTargetOutcome(10, spec, false)).toEqual({
			damage: 10,
			negated: false,
			outcome: "full",
		});
		expect(resolveRitualTargetOutcome(10, { skill: "will", effect: "nullifies", label: "Will" }, true)).toEqual({
			damage: 0,
			negated: true,
			outcome: "negated",
		});
	});
});

describe("splitBuffResistanceTargets", () => {
	it("keeps the caster out of resistance targets", () => {
		expect(splitBuffResistanceTargets("Actor.caster", ["Actor.caster", "Actor.other"])).toEqual({
			selfTargets: ["Actor.caster"],
			otherTargets: ["Actor.other"],
		});
	});

	it("treats pure self-buffs as no resistance targets", () => {
		expect(splitBuffResistanceTargets("Actor.caster", ["Actor.caster"])).toEqual({
			selfTargets: ["Actor.caster"],
			otherTargets: [],
		});
	});
});
