import { describe, it, expect } from "vitest";
import {
	buildAprimorarEffectData,
	buildRitualEffectParts,
	getAttributeUpcastBonus,
	getEffectiveAttributeValue,
	getEnemyAttackDicePenaltyFromTarget,
	getRitualCombatModifiers,
	getRitualTierEffectSpec,
	mergeActiveRdTotals,
	PHYSICAL_DAMAGE_TYPES,
} from "../module/helpers/ritual-effects.mjs";

describe("ritual-effects", () => {
	it("espirais-da-perdicao applies –1d20 / –2d20 / –2d20 attack dice by tier", () => {
		expect(getRitualTierEffectSpec("espirais-da-perdicao", "base").diceAttack).toBe(-1);
		expect(getRitualTierEffectSpec("espirais-da-perdicao", "discente").diceAttack).toBe(-2);
		expect(getRitualTierEffectSpec("espirais-da-perdicao", "verdadeiro").diceAttack).toBe(-2);

		const { flags } = buildRitualEffectParts(getRitualTierEffectSpec("espirais-da-perdicao", "discente"));
		expect(flags.ordemparanormal.combatMod.diceAttack).toBe(-2);

		const actor = {
			allApplicableEffects: () => [{ disabled: false, flags: { ordemparanormal: { combatMod: { diceAttack: -2 } } } }],
		};
		expect(getRitualCombatModifiers(actor).diceAttack).toBe(-2);
	});

	it("fortalecimento-sensorial base grants +1d20 on investigation, fighting, perception, aim", () => {
		const spec = getRitualTierEffectSpec("fortalecimento-sensorial", "base");
		const { changes, flags } = buildRitualEffectParts(spec);

		for (const skill of ["investigation", "fighting", "perception", "aim"]) {
			expect(changes).toContainEqual({
				key: `system.skills.${skill}.diceMod`,
				mode: 2,
				value: "1",
				priority: 20,
			});
		}
		expect(flags.ordemparanormal.ritualMeta?.enemyAttackPenalty).toBeUndefined();
		expect(changes.some((c) => c.key === "system.defense.bonus")).toBe(false);
	});

	it("fortalecimento-sensorial discente keeps skill dice and penalizes enemy attacks –1d20", () => {
		const spec = getRitualTierEffectSpec("fortalecimento-sensorial", "discente");
		const { changes, flags } = buildRitualEffectParts(spec);

		expect(changes.filter((c) => c.key.endsWith(".diceMod"))).toHaveLength(4);
		expect(flags.ordemparanormal.ritualMeta.enemyAttackPenalty).toBe(1);

		const defender = {
			allApplicableEffects: () => [
				{ disabled: false, flags: { ordemparanormal: { ritualMeta: { enemyAttackPenalty: 1 } } } },
			],
		};
		expect(getEnemyAttackDicePenaltyFromTarget(defender)).toBe(1);
		expect(getEnemyAttackDicePenaltyFromTarget(null)).toBe(0);
	});

	it("fortalecimento-sensorial verdadeiro stacks prior tiers plus +10 defense and reflexes", () => {
		const spec = getRitualTierEffectSpec("fortalecimento-sensorial", "verdadeiro");
		const { changes, flags } = buildRitualEffectParts(spec);

		expect(changes).toContainEqual({
			key: "system.defense.bonus",
			mode: 2,
			value: "10",
			priority: 20,
		});
		expect(changes).toContainEqual({
			key: "system.skills.reflexes.mod",
			mode: 2,
			value: "10",
			priority: 20,
		});
		expect(changes.filter((c) => c.key.endsWith(".diceMod"))).toHaveLength(4);
		expect(flags.ordemparanormal.ritualMeta.enemyAttackPenalty).toBe(1);
		expect(flags.ordemparanormal.ritualMeta.immuneSurprise).toBe(true);
	});

	it("armadura-de-sangue discente grants +10 defense and physical RD 5", () => {
		const spec = getRitualTierEffectSpec("armadura-de-sangue", "discente");
		const { changes, flags } = buildRitualEffectParts(spec);

		expect(changes).toContainEqual({
			key: "system.defense.bonus",
			mode: 2,
			value: "10",
			priority: 20,
		});

		for (const type of PHYSICAL_DAMAGE_TYPES) {
			expect(flags.ordemparanormal.ritualRd[type]).toBe(5);
		}
	});

	it("coincidencia-forcada verdadeiro adds +5 to all skill mods", () => {
		const spec = getRitualTierEffectSpec("coincidencia-forcada", "verdadeiro");
		const { changes } = buildRitualEffectParts(spec);
		const skillChanges = changes.filter((c) => c.key.includes("system.skills.") && c.key.endsWith(".mod"));
		expect(skillChanges.length).toBeGreaterThan(20);
		expect(skillChanges.every((c) => c.value === "5")).toBe(true);
	});

	it("aprimorar-fisico applies chosen attribute bonus", () => {
		const spec = getRitualTierEffectSpec("aprimorar-fisico", "base");
		const { changes } = buildRitualEffectParts(spec, { attributeKey: "dex" });
		expect(changes).toContainEqual({
			key: "system.attributes.dex.bonus",
			mode: 2,
			value: "1",
			priority: 20,
		});
	});

	it("aprimorar-fisico discente/verdadeiro raise the attribute bonus to +2/+3", () => {
		const discente = buildRitualEffectParts(getRitualTierEffectSpec("aprimorar-fisico", "discente"), {
			attributeKey: "str",
		});
		expect(discente.changes).toContainEqual({
			key: "system.attributes.str.bonus",
			mode: 2,
			value: "2",
			priority: 20,
		});

		const verdadeiro = buildRitualEffectParts(getRitualTierEffectSpec("aprimorar-fisico", "verdadeiro"), {
			attributeKey: "dex",
		});
		expect(verdadeiro.changes).toContainEqual({
			key: "system.attributes.dex.bonus",
			mode: 2,
			value: "3",
			priority: 20,
		});
	});

	it("aprimorar-mente upcasts INT/PRE bonus +1/+2/+3", () => {
		expect(getRitualTierEffectSpec("aprimorar-mente", "base").attributeChoice).toEqual(["int", "pre"]);

		const base = buildRitualEffectParts(getRitualTierEffectSpec("aprimorar-mente", "base"), {
			attributeKey: "int",
		});
		expect(base.changes).toContainEqual({
			key: "system.attributes.int.bonus",
			mode: 2,
			value: "1",
			priority: 20,
		});

		const discente = buildRitualEffectParts(getRitualTierEffectSpec("aprimorar-mente", "discente"), {
			attributeKey: "pre",
		});
		expect(discente.changes).toContainEqual({
			key: "system.attributes.pre.bonus",
			mode: 2,
			value: "2",
			priority: 20,
		});

		const verdadeiro = buildRitualEffectParts(getRitualTierEffectSpec("aprimorar-mente", "verdadeiro"), {
			attributeKey: "int",
		});
		expect(verdadeiro.changes).toContainEqual({
			key: "system.attributes.int.bonus",
			mode: 2,
			value: "3",
			priority: 20,
		});
	});

	it("attribute upcast bonus is +1 die per tier", () => {
		expect(getAttributeUpcastBonus("base")).toBe(1);
		expect(getAttributeUpcastBonus("discente")).toBe(2);
		expect(getAttributeUpcastBonus("verdadeiro")).toBe(3);
		expect(getRitualTierEffectSpec("aprimorar-fisico", "discente").attributeBonus).toBe(2);
		expect(getRitualTierEffectSpec("aprimorar-mente", "verdadeiro").attributeBonus).toBe(3);
	});

	it("buildAprimorarEffectData encodes the upcast bonus into the AE change", () => {
		const { effectData, bonus } = buildAprimorarEffectData({
			ritualName: "Aprimorar Físico",
			ritualId: "aprimorar-fisico",
			tierKey: "discente",
			tierLabel: "Discente",
			attributeKey: "dex",
		});
		expect(bonus).toBe(2);
		expect(effectData.changes[0]).toMatchObject({
			key: "system.attributes.dex.bonus",
			value: "2",
		});
		expect(effectData.flags.ordemparanormal.ritualTier).toBe("discente");
	});

	it("getEffectiveAttributeValue adds ritual bonus to the base attribute", () => {
		expect(getEffectiveAttributeValue({ value: 2, bonus: 3 })).toBe(5);
		expect(getEffectiveAttributeValue({ value: 1 })).toBe(1);
	});

	it("mergeActiveRdTotals stacks actor RD and ritual RD by type", () => {
		const { byType, physicalHalf } = mergeActiveRdTotals({
			resistances: {
				cuttingDamage: { value: 2 },
			},
			effects: [
				{
					flags: {
						ordemparanormal: {
							ritualRd: {
								cuttingDamage: 5,
								ballisticDamage: 5,
								impactDamage: 5,
								piercingDamage: 5,
							},
						},
					},
				},
			],
		});

		expect(byType).toContainEqual({ key: "cuttingDamage", value: 7 });
		expect(byType).toContainEqual({ key: "ballisticDamage", value: 5 });
		expect(physicalHalf).toBe(false);
	});
});
