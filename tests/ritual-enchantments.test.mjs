import { describe, it, expect, vi, beforeEach } from "vitest";
import {
	buildDecadenciaDiscenteEnchantment,
	getEligibleArmaments,
	getRitualSourceId,
	isTechnologyArmament,
	removeEnchantmentFromWeapon,
	slugifyRitualSourceId,
} from "../module/helpers/ritual-enchantments.mjs";

describe("getRitualSourceId", () => {
	it("prefers the stored flag", () => {
		const item = { name: "Aprimorar Físico", getFlag: () => "aprimorar-fisico" };
		expect(getRitualSourceId(item)).toBe("aprimorar-fisico");
	});

	it("recovers the id from the ritual name when the flag is missing", () => {
		const item = { name: "Aprimorar Mente", getFlag: () => undefined };
		expect(getRitualSourceId(item)).toBe("aprimorar-mente");
		expect(slugifyRitualSourceId("Aprimorar Físico")).toBe("aprimorar-fisico");
	});
});

describe("buildDecadenciaDiscenteEnchantment", () => {
	it("adds tier formula as temporary weapon damage for one turn", () => {
		const ritual = { name: "Decadência", img: "icon.svg" };
		const tier = { key: "discente", label: "Discente", formula: "3d8+3", damageType: "deathDamage" };
		const enchant = buildDecadenciaDiscenteEnchantment(ritual, tier);
		expect(enchant.damageBonuses).toEqual(["3d8+3"]);
		expect(enchant.damageType).toBe("deathDamage");
		expect(enchant.remainingTurns).toBe(1);
		expect(enchant.skipRitualResistance).toBe(true);
	});
});

describe("isTechnologyArmament", () => {
	it("accepts explicit ranged weapons", () => {
		expect(
			isTechnologyArmament({
				type: "armament",
				system: { types: { rangeType: { name: "ranged" } } },
			})
		).toBe(true);
	});

	it("rejects explicit melee weapons", () => {
		expect(
			isTechnologyArmament({
				type: "armament",
				system: { types: { rangeType: { name: "melee" } } },
			})
		).toBe(false);
	});

	it("accepts custom weapons missing rangeType when range is set", () => {
		expect(
			isTechnologyArmament({
				type: "armament",
				system: { range: "30m", types: { rangeType: { name: "" } } },
			})
		).toBe(true);
	});

	it("accepts automatic weapons even without rangeType", () => {
		expect(
			isTechnologyArmament({
				type: "armament",
				system: { conditions: { automatic: true }, types: { rangeType: {} } },
			})
		).toBe(true);
	});
});

describe("getEligibleArmaments rangedOnly", () => {
	it("includes custom firearms without rangeType name", () => {
		const actor = {
			items: [
				{
					type: "armament",
					system: { range: "20m", types: { rangeType: { name: "" } } },
				},
				{
					type: "armament",
					system: { types: { rangeType: { name: "melee" } } },
				},
			],
		};
		const weapons = getEligibleArmaments(actor, { rangedOnly: true });
		expect(weapons).toHaveLength(1);
	});
});

describe("removeEnchantmentFromWeapon", () => {
	beforeEach(() => {
		global.CONFIG = {
			op: {
				firearmModifications: {
					auto: { label: "op.test.auto", setAutomatic: true },
					scope: { label: "op.test.scope", attackBonus: 1 },
				},
			},
		};
	});

	it("removes enchantment by id", async () => {
		const weapon = {
			system: {
				enchantments: [
					{ id: "a", ritualId: "arma-atroz", active: true },
					{ id: "b", ritualId: "amaldicoar-arma", active: true },
				],
				conditions: { automatic: false },
			},
			update: vi.fn(async (data) => {
				weapon.system = { ...weapon.system, ...flattenUpdate(data) };
			}),
		};

		await removeEnchantmentFromWeapon(weapon, "a");

		expect(weapon.system.enchantments).toHaveLength(1);
		expect(weapon.system.enchantments[0].id).toBe("b");
	});

	it("clears automatic condition when last auto tech mod is removed", async () => {
		const weapon = {
			system: {
				enchantments: [{ id: "tech", techModifications: ["auto"], active: true }],
				conditions: { automatic: true },
			},
			update: vi.fn(async (data) => {
				weapon.system = { ...weapon.system, ...flattenUpdate(data) };
			}),
		};

		await removeEnchantmentFromWeapon(weapon, "tech");

		expect(weapon.system.enchantments).toHaveLength(0);
		expect(weapon.update).toHaveBeenCalledWith(expect.objectContaining({ "system.conditions.automatic": false }));
	});

	it("keeps automatic when another active enchantment still grants it", async () => {
		const weapon = {
			system: {
				enchantments: [
					{ id: "tech1", techModifications: ["auto"], active: true },
					{ id: "tech2", techModifications: ["auto"], active: true },
				],
				conditions: { automatic: true },
			},
			update: vi.fn(async (data) => {
				weapon.system = { ...weapon.system, ...flattenUpdate(data) };
			}),
		};

		await removeEnchantmentFromWeapon(weapon, "tech1");

		expect(weapon.system.enchantments).toHaveLength(1);
		expect(weapon.update).not.toHaveBeenCalledWith(expect.objectContaining({ "system.conditions.automatic": false }));
	});
});

/** @param {Record<string, unknown>} data */
function flattenUpdate(data) {
	const result = {};
	for (const [key, value] of Object.entries(data)) {
		if (key.startsWith("system.")) {
			const path = key.slice("system.".length).split(".");
			let cursor = result;
			for (let i = 0; i < path.length - 1; i += 1) {
				cursor[path[i]] ??= {};
				cursor = cursor[path[i]];
			}
			cursor[path[path.length - 1]] = value;
		}
	}
	return result;
}
