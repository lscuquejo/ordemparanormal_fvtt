import { getActiveWeaponModifiers } from "./weapon-modifiers.mjs";
import { getEffectiveAttributeValue } from "./ritual-effects.mjs";

/**
 * @param {string} [seed]
 * @returns {string}
 */
export function createAttackProfileId(seed = "") {
	return foundry.utils.randomID(16);
}

/**
 * @param {object} profile
 * @param {Item|null} baseItem
 * @param {Actor} actor
 * @returns {{ attack: object, damage: object, critical: string, label: string, sources: string[] }}
 */
export function resolveAttackProfile(profile, baseItem, actor) {
	const globalMods = getActiveWeaponModifiers(actor);
	const baseAttack = foundry.utils.deepClone(baseItem?.system?.formulas?.attack ?? {});
	const baseDamage = foundry.utils.deepClone(baseItem?.system?.formulas?.damage ?? { parts: [] });

	const profileAttackBonus = Number(profile.attackBonus) || 0;
	const profileDamageBonus = String(profile.damageBonus ?? "").trim();

	baseAttack.bonus = (Number(baseAttack.bonus) || 0) + globalMods.attackBonus + profileAttackBonus;

	let damageFormula = String(profile.damageFormulaOverride ?? "").trim() || baseDamage.formula || "0";
	if (profileDamageBonus) {
		damageFormula = damageFormula === "0" ? profileDamageBonus : `${damageFormula}+(${profileDamageBonus})`;
	}
	for (const bonus of globalMods.damageBonuses) {
		damageFormula = `${damageFormula}+(${bonus})`;
	}

	const damage = {
		...baseDamage,
		formula: damageFormula,
		type: String(profile.damageTypeOverride ?? "").trim() || baseDamage.type || "",
		parts: Array.isArray(baseDamage.parts) ? [...baseDamage.parts] : [],
	};

	const labelParts = [profile.name || baseItem?.name || game.i18n.localize("op.attack")];
	if (profile.peCost) labelParts.push(`${profile.peCost} PE`);

	return {
		attack: baseAttack,
		damage,
		critical: baseItem?.system?.critical ?? "20",
		label: labelParts.join(" — "),
		sources: globalMods.sources,
	};
}

/**
 * @param {Actor} actor
 * @returns {object[]}
 */
export function prepareAttackProfileRows(actor) {
	const profiles = actor.system.attackProfiles ?? [];
	const armaments = actor.items.filter((i) => i.type === "armament");

	return profiles.map((profile) => {
		const baseItem = armaments.find((i) => i.id === profile.baseArmamentId) ?? null;
		const resolved = baseItem ? resolveAttackProfile(profile, baseItem, actor) : null;

		const rangeType = baseItem?.system?.types?.rangeType?.name;
		const attrKey = baseItem?.system?.formulas?.attack?.attr ?? (rangeType === "ranged" ? "dex" : "str");
		const skillKey = baseItem?.system?.formulas?.attack?.skill ?? (rangeType === "ranged" ? "aim" : "fighting");
		const attrValue = getEffectiveAttributeValue(actor.system.attributes[attrKey]);
		const diceString = attrValue > 0 ? `${attrValue}d20` : "2d20kl1";
		const skillLabel = game.i18n.localize(`op.skill.${skillKey}`) || skillKey;

		let attackLabel = resolved ? `${diceString} + ${skillLabel}` : "—";
		if (resolved?.attack?.bonus) attackLabel += ` + ${resolved.attack.bonus}`;

		const dmgFormula = resolved?.damage?.formula ?? "—";
		const dmgTypeKey = resolved?.damage?.type;
		const dmgTypeLabel = dmgTypeKey ? game.i18n.localize(`op.damageTypeAbv.${dmgTypeKey}`) : "";

		return {
			...profile,
			baseItemName: baseItem?.name ?? game.i18n.localize("op.attackProfileMissingWeapon"),
			attackLabel,
			damageLabel: resolved ? `${dmgFormula} ${dmgTypeLabel}`.trim() : "—",
			peLabel: profile.peCost ? `${profile.peCost} PE` : "—",
			hasBase: Boolean(baseItem),
		};
	});
}
