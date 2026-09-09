import { describe, it, expect } from "vitest";
import {
	applyConditionDesloc,
	getConditionDicePenalty,
	halfDeslocMeters,
	mergeConditionModifiers,
	prepareConditionSheetDisplay,
	resolveConditionApplication,
} from "../module/helpers/condition-effects.mjs";

function actorWithStatuses(...ids) {
	return {
		effects: ids.map((id) => ({
			disabled: false,
			statuses: new Set([id]),
			flags: { ordemparanormal: { statusId: id } },
		})),
	};
}

describe("condition mechanics", () => {
	it("Fatigado applies Weakened + Vulnerable (–1 physical d20, –2 defense)", () => {
		const mods = mergeConditionModifiers(["fatigado"]);
		expect(mods.defense).toBe(-2);
		expect(mods.dicePhysical).toBe(-1);
	});

	it("does not stack Fatigado's included Vulnerable with a second Vulnerable", () => {
		const mods = mergeConditionModifiers(["fatigado", "vulneravel"]);
		expect(mods.defense).toBe(-2);
	});

	it("Indefeso uses –10 defense instead of Desprevenido's –5", () => {
		const mods = mergeConditionModifiers(["paralisado"]);
		expect(mods.defense).toBe(-10);
		expect(mods.deslocZero).toBe(true);
		expect(mods.autoFailReflexes).toBe(true);
	});

	it("halves speed on the 1.5m grid", () => {
		expect(halfDeslocMeters(9)).toBe(4.5);
		expect(applyConditionDesloc(9, mergeConditionModifiers(["lento"]))).toBe(4.5);
		expect(applyConditionDesloc(9, mergeConditionModifiers(["imovel"]))).toBe(0);
	});

	it("applies physical dice penalty to Fortitude (Vigor) but not Will", () => {
		const actor = actorWithStatuses("fraco");
		expect(getConditionDicePenalty(actor, { skill: "resilience" })).toBe(-1);
		expect(getConditionDicePenalty(actor, { skill: "will" })).toBe(0);
	});

	it("Ofuscado penalizes attacks and Perception", () => {
		const actor = actorWithStatuses("ofuscado");
		expect(getConditionDicePenalty(actor, { skill: "fighting", isAttack: true, isMelee: true })).toBe(-1);
		expect(getConditionDicePenalty(actor, { skill: "perception" })).toBe(-1);
	});

	it("upgrades Fatigado to Exausto when applied again", () => {
		expect(resolveConditionApplication(["fatigado"], "fatigado")).toEqual({
			applyId: "exausto",
			removeIds: ["fatigado"],
		});
	});

	it("keeps Exhausted instead of re-applying Fatigado", () => {
		expect(resolveConditionApplication(["exausto"], "fatigado")).toEqual({
			applyId: "exausto",
			removeIds: [],
		});
	});

	it("Alquebrado adds extra PE cost", () => {
		expect(mergeConditionModifiers(["alquebrado"]).peCostExtra).toBe(1);
	});

	it("Petrificado grants RD 10", () => {
		expect(mergeConditionModifiers(["petrificado"]).rdAll).toBe(10);
	});
});

describe("condition sheet display", () => {
	it("marks every test with –1d20 when Abalado", () => {
		const display = prepareConditionSheetDisplay(actorWithStatuses("abalado"));
		expect(display.hasAny).toBe(true);
		expect(display.conditions[0].id).toBe("abalado");
		expect(display.conditions[0].reduced).toBe("testes –1d20");
		expect(display.attributes.dex).toMatchObject({ affected: true, label: "–1d20" });
		expect(display.attributes.int).toMatchObject({ affected: true, label: "–1d20" });
		expect(display.skills.will).toMatchObject({ affected: true, label: "–1d20" });
		expect(display.defense.affected).toBe(false);
	});

	it("marks Defense in red for Vulnerável and physical tests for Fraco", () => {
		const display = prepareConditionSheetDisplay(actorWithStatuses("fatigado"));
		expect(display.defense).toMatchObject({ affected: true, label: "–2" });
		expect(display.conditions[0].reduced).toBe("Agi, For, Vig –1d20; Defesa –2");
		expect(display.attributes.dex).toMatchObject({ affected: true, label: "–1d20" });
		expect(display.attributes.int.affected).toBe(false);
	});

	it("shows PE cost extra for Alquebrado", () => {
		const display = prepareConditionSheetDisplay(actorWithStatuses("alquebrado"));
		expect(display.peCost).toMatchObject({ affected: true, extra: 1, label: "+1" });
		expect(display.conditions[0].reduced).toBe("PE +1");
	});

	it("shows halved speed for Lento", () => {
		const display = prepareConditionSheetDisplay(actorWithStatuses("lento"));
		expect(display.desloc.affected).toBe(true);
		expect(display.desloc.half).toBe(true);
	});

	it("marks attack tests for Ofuscado without changing Defense", () => {
		const display = prepareConditionSheetDisplay(actorWithStatuses("ofuscado"));
		expect(display.attacks.affected).toBe(true);
		expect(display.attacks.label).toBe("–1d20");
		expect(display.skills.perception.label).toBe("–1d20");
		expect(display.defense.affected).toBe(false);
	});
});
