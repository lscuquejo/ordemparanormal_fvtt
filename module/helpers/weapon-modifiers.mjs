/**
 * Collect active weapon modifiers from toggled abilities/equipment.
 * @param {Actor} actor
 * @returns {{ attackBonus: number, damageBonuses: string[], sources: string[] }}
 */
export function getActiveWeaponModifiers(actor) {
	let attackBonus = 0;
	const damageBonuses = [];
	const sources = [];

	for (const item of actor.items ?? []) {
		if (!item.system?.modifiesWeapons) continue;
		const active = Boolean(item.system.using?.state);
		if (!active) continue;

		const mod = item.system.weaponMod ?? {};
		const atk = Number(mod.attackBonus) || 0;
		if (atk) attackBonus += atk;

		const dmg = String(mod.damageBonus ?? "").trim();
		if (dmg) damageBonuses.push(dmg);

		sources.push(item.name);
	}

	return { attackBonus, damageBonuses, sources };
}

/**
 * @param {object} item
 * @returns {boolean}
 */
export function itemModifiesWeapons(item) {
	return Boolean(item?.system?.modifiesWeapons);
}

/**
 * Sum active ritual enchantments on an armament item.
 * @param {Item} armament
 * @returns {{ attackBonus: number, damageBonuses: string[], critMarginBonus: number, critMultiplierBonus: number, damageType: string, sources: string[] }}
 */
export function getArmamentEnchantmentTotals(armament) {
	const result = {
		attackBonus: 0,
		damageBonuses: [],
		critMarginBonus: 0,
		critMultiplierBonus: 0,
		damageType: "",
		sources: [],
	};

	if (armament?.type !== "armament") return result;

	for (const ench of armament.system?.enchantments ?? []) {
		if (!ench?.active) continue;
		result.attackBonus += Number(ench.attackBonus) || 0;
		result.critMarginBonus += Number(ench.critMarginBonus) || 0;
		result.critMultiplierBonus += Number(ench.critMultiplierBonus) || 0;
		for (const dmg of ench.damageBonuses ?? []) {
			if (dmg) result.damageBonuses.push(String(dmg));
		}
		if (ench.damageType && !result.damageType) result.damageType = ench.damageType;
		result.sources.push(`${ench.ritualName} (${ench.tierLabel})`);
	}

	return result;
}

/**
 * @param {Item} armament
 * @returns {string}
 */
export function getEffectiveCriticalFormula(armament) {
	const base = String(armament?.system?.critical ?? "20").trim() || "20";
	const { critMarginBonus, critMultiplierBonus } = getArmamentEnchantmentTotals(armament);

	let margin = 20;
	let multiplier = 2;

	if (base.includes("/")) {
		for (const part of base.split("/")) {
			if (part.includes("x")) multiplier = Number(part.replaceAll("x", "")) || 2;
			else margin = Number(part) || 20;
		}
	} else if (base.includes("x")) {
		multiplier = Number(base.replaceAll("x", "")) || 2;
	} else {
		margin = Number(base) || 20;
	}

	margin = Math.max(1, margin - (critMarginBonus || 0));
	multiplier = Math.max(2, multiplier + (critMultiplierBonus || 0));

	if (margin === 20 && multiplier === 2) return "20";
	if (margin === 20) return `x${multiplier}`;
	if (multiplier === 2) return String(margin);
	return `${margin}/x${multiplier}`;
}
