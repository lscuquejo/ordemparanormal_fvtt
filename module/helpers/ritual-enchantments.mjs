import { mapRitualDamageType } from "./ritual-helpers.mjs";

/** Rituals that enchant armament items instead of buffing actors. */
export const WEAPON_ENCHANT_RITUAL_IDS = new Set(["arma-atroz", "amaldicoar-tecnologia", "amaldicoar-arma"]);

const AMALDICOAR_ELEMENTS = ["Conhecimento", "Energia", "Morte", "Sangue"];

const TIER_MOD_COUNT = { base: 1, discente: 2, verdadeiro: 3 };

/**
 * @param {string} value
 * @returns {string}
 */
export function slugifyRitualSourceId(value) {
	return String(value ?? "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

/**
 * @param {Item} ritualItem
 * @returns {string}
 */
export function getRitualSourceId(ritualItem) {
	const flagged = ritualItem?.getFlag?.("ordemparanormal", "ritualSourceId");
	if (flagged) return String(flagged);
	// World copies sometimes lose the pack flag — recover from the ritual name.
	return slugifyRitualSourceId(ritualItem?.name);
}

/**
 * @param {Item} ritualItem
 * @returns {boolean}
 */
export function isWeaponEnchantRitual(ritualItem) {
	if (ritualItem.type !== "ritual") return false;
	return WEAPON_ENCHANT_RITUAL_IDS.has(getRitualSourceId(ritualItem));
}

/**
 * @param {string} ritualId
 * @returns {{ meleeOnly?: boolean, rangedOnly?: boolean }}
 */
export function getWeaponFilterForRitual(ritualId) {
	switch (ritualId) {
		case "arma-atroz":
		case "amaldicoar-arma":
			return { meleeOnly: true };
		case "amaldicoar-tecnologia":
			return { rangedOnly: true };
		default:
			return {};
	}
}

/**
 * Firearms / technology weapons eligible for Amaldiçoar Tecnologia.
 * @param {Item} item
 * @returns {boolean}
 */
export function isTechnologyArmament(item) {
	if (item?.type !== "armament") return false;

	const rangeType = item.system?.types?.rangeType?.name ?? "";
	if (rangeType === "ranged") return true;
	if (rangeType === "melee") return false;

	if (item.system?.conditions?.automatic) return true;

	const subRange = String(item.system?.types?.rangeType?.subRangeType ?? "").toLowerCase();
	if (subRange && /(firearm|pistola|rifle|espingarda|fuzil|submet|revólver|revolver|tech|disparo)/i.test(subRange)) {
		return true;
	}

	const range = String(item.system?.range ?? "")
		.trim()
		.toLowerCase();
	if (range && !["", "0", "—", "-", "corpo a corpo", "corpo-a-corpo"].includes(range)) return true;

	// Custom items often omit rangeType — treat unknown armaments as eligible unless explicitly melee.
	if (!rangeType) return true;

	return false;
}

/**
 * @param {Actor} actor
 * @param {object} [filter]
 * @returns {Item[]}
 */
export function getEligibleArmaments(actor, filter = {}) {
	return actor.items.filter((item) => {
		if (item.type !== "armament") return false;
		const rangeType = item.system.types?.rangeType?.name;
		if (filter.meleeOnly && rangeType === "ranged") return false;
		if (filter.rangedOnly) return isTechnologyArmament(item);
		return true;
	});
}

/**
 * @param {Actor} actor
 * @param {object} filter
 * @returns {Promise<Item|null>}
 */
export async function promptPickArmament(actor, filter = {}) {
	const weapons = getEligibleArmaments(actor, filter);
	if (!weapons.length) {
		ui.notifications.warn(game.i18n.localize("op.ritualNoEligibleWeapons"));
		return null;
	}
	if (weapons.length === 1) return weapons[0];

	const options = weapons.map((w) => `<option value="${w.id}">${w.name}</option>`).join("");

	return new Promise((resolve) => {
		new Dialog({
			title: game.i18n.localize("op.pickWeaponTarget"),
			content: `<form><label>${game.i18n.localize(
				"op.armament"
			)}<select name="weaponId" style="width:100%;margin-top:4px;">${options}</select></label></form>`,
			buttons: {
				ok: {
					label: game.i18n.localize("Confirm"),
					callback: (html) => {
						const id = html.find('[name="weaponId"]').val();
						resolve(actor.items.get(id) ?? null);
					},
				},
				cancel: { label: game.i18n.localize("Cancel"), callback: () => resolve(null) },
			},
			default: "ok",
		}).render(true);
	});
}

/**
 * @param {Item} ritualItem
 * @returns {Promise<string|null>}
 */
export async function promptAmaldicoarElement(ritualItem) {
	const stored = ritualItem.getFlag("ordemparanormal", "chosenElement");
	if (stored) return stored;

	const options = AMALDICOAR_ELEMENTS.map((el) => `<option value="${el}">${el}</option>`).join("");

	return new Promise((resolve) => {
		new Dialog({
			title: game.i18n.localize("op.pickAmaldicoarElement"),
			content: `<form><p>${game.i18n.localize(
				"op.pickAmaldicoarElementHint"
			)}</p><select name="element" style="width:100%;">${options}</select></form>`,
			buttons: {
				ok: {
					label: game.i18n.localize("Confirm"),
					callback: async (html) => {
						const element = html.find('[name="element"]').val();
						await ritualItem.setFlag("ordemparanormal", "chosenElement", element);
						resolve(element);
					},
				},
				cancel: { label: game.i18n.localize("Cancel"), callback: () => resolve(null) },
			},
			default: "ok",
		}).render(true);
	});
}

/**
 * @param {number} count
 * @returns {Promise<string[]|null>}
 */
export async function promptTechModifications(count) {
	const mods = CONFIG.op?.firearmModifications ?? {};
	const keys = Object.keys(mods);
	if (!keys.length) return [];

	const checkboxes = keys
		.map(
			(key) =>
				`<label class="tech-mod-option"><input type="checkbox" name="mod" value="${key}" /> ${game.i18n.localize(
					mods[key].label
				)}</label>`
		)
		.join("<br/>");

	return new Promise((resolve) => {
		new Dialog({
			title: game.i18n.format("op.pickTechModifications", { count }),
			content: `<form class="tech-mod-form"><p>${game.i18n.format("op.pickTechModificationsHint", {
				count,
			})}</p>${checkboxes}</form>`,
			buttons: {
				ok: {
					label: game.i18n.localize("Confirm"),
					callback: (html) => {
						const root = html[0] ?? html.get?.(0);
						const selected = [...(root?.querySelectorAll('[name="mod"]:checked') ?? [])].map((el) => el.value);
						if (selected.length !== count) {
							ui.notifications.warn(game.i18n.format("op.pickTechModificationsWrongCount", { count }));
							return false;
						}
						resolve(selected);
					},
				},
				cancel: { label: game.i18n.localize("Cancel"), callback: () => resolve(null) },
			},
			default: "ok",
		}).render(true);
	});
}

/**
 * @param {string} tierKey
 * @returns {object}
 */
export function buildArmaAtrozEnchantment(tierKey) {
	switch (tierKey) {
		case "discente":
			return { attackBonus: 5, critMarginBonus: 0, critMultiplierBonus: 0 };
		case "verdadeiro":
			return { attackBonus: 5, critMarginBonus: 2, critMultiplierBonus: 1 };
		default:
			return { attackBonus: 2, critMarginBonus: 1, critMultiplierBonus: 0 };
	}
}

/**
 * Decadência (Discente) — temporary melee weapon damage for 1 turn, no resistance.
 * @param {Item} ritualItem
 * @param {object} tier
 * @returns {object}
 */
export function buildDecadenciaDiscenteEnchantment(ritualItem, tier) {
	return {
		id: foundry.utils.randomID(16),
		ritualId: "decadencia",
		ritualName: ritualItem.name,
		tierKey: tier.key,
		tierLabel: tier.label,
		active: true,
		attackBonus: 0,
		critMarginBonus: 0,
		critMultiplierBonus: 0,
		damageBonuses: [tier.formula].filter(Boolean),
		damageType: tier.damageType || mapRitualDamageType("Morte", ["Morte"]),
		techModifications: [],
		element: "Morte",
		remainingTurns: 1,
		skipRitualResistance: true,
		icon: ritualItem.img,
	};
}

/**
 * @param {string} tierKey
 * @param {string} element
 * @returns {object}
 */
export function buildAmaldicoarArmaEnchantment(tierKey, element) {
	const formulas = { base: "1d6", discente: "2d6", verdadeiro: "4d6" };
	return {
		damageBonuses: [formulas[tierKey] ?? formulas.base],
		damageType: mapRitualDamageType(element, [element]),
		element,
	};
}

/**
 * @param {string[]} modKeys
 * @returns {object}
 */
export function buildTechModEffects(modKeys) {
	const mods = CONFIG.op?.firearmModifications ?? {};
	let attackBonus = 0;
	const damageBonuses = [];
	const conditionUpdates = {};

	for (const key of modKeys) {
		const mod = mods[key];
		if (!mod) continue;
		attackBonus += Number(mod.attackBonus) || 0;
		if (mod.damageBonus) damageBonuses.push(mod.damageBonus);
		if (mod.setAutomatic) conditionUpdates.automatic = true;
	}

	return { attackBonus, damageBonuses, techModifications: modKeys, conditionUpdates };
}

/**
 * @param {Item} ritualItem
 * @param {object} tier
 * @param {object} choices
 * @returns {Promise<object|null>}
 */
export async function buildEnchantmentData(ritualItem, tier, choices = {}) {
	const ritualId = getRitualSourceId(ritualItem);
	const base = {
		id: foundry.utils.randomID(16),
		ritualId,
		ritualName: ritualItem.name,
		tierKey: tier.key,
		tierLabel: tier.label,
		active: true,
		attackBonus: 0,
		critMarginBonus: 0,
		critMultiplierBonus: 0,
		damageBonuses: [],
		damageType: "",
		techModifications: [],
		element: "",
		duration: ritualItem.system.duration ?? "",
		icon: ritualItem.img,
	};

	if (ritualId === "arma-atroz") {
		return { ...base, ...buildArmaAtrozEnchantment(tier.key) };
	}

	if (ritualId === "amaldicoar-arma") {
		const element = choices.element ?? (await promptAmaldicoarElement(ritualItem));
		if (!element) return null;
		return { ...base, ...buildAmaldicoarArmaEnchantment(tier.key, element) };
	}

	if (ritualId === "amaldicoar-tecnologia") {
		const count = TIER_MOD_COUNT[tier.key] ?? 1;
		const modKeys = choices.techModifications ?? (await promptTechModifications(count));
		if (!modKeys) return null;
		return { ...base, ...buildTechModEffects(modKeys) };
	}

	return null;
}

/**
 * @param {Item} weapon
 * @param {object} enchantment
 */
export async function applyEnchantmentToWeapon(weapon, enchantment) {
	const enchantments = [...(weapon.system.enchantments ?? [])];
	// Replace same ritual+tier refresh; stack different rituals
	const idx = enchantments.findIndex((e) => e.ritualId === enchantment.ritualId && e.tierKey === enchantment.tierKey);
	if (idx >= 0) enchantments[idx] = enchantment;
	else enchantments.push(enchantment);

	const update = { "system.enchantments": enchantments };

	if (enchantment.conditionUpdates?.automatic) {
		update["system.conditions.automatic"] = true;
	}

	await weapon.update(update);
}

/**
 * @param {Item} weapon
 * @param {string} enchantmentId
 */
export async function removeEnchantmentFromWeapon(weapon, enchantmentId) {
	const current = weapon.system.enchantments ?? [];
	const removed = current.find((e) => e.id === enchantmentId);
	const enchantments = current.filter((e) => e.id !== enchantmentId);
	const update = { "system.enchantments": enchantments };

	const mods = CONFIG.op?.firearmModifications ?? {};
	const removedHadAuto = (removed?.techModifications ?? []).some((key) => mods[key]?.setAutomatic);
	if (removedHadAuto) {
		const stillAuto = enchantments.some(
			(e) => e.active !== false && (e.techModifications ?? []).some((key) => mods[key]?.setAutomatic)
		);
		if (!stillAuto) update["system.conditions.automatic"] = false;
	}

	await weapon.update(update);
}

/**
 * @param {Item} weapon
 * @param {string} enchantmentId
 */
export async function toggleEnchantmentOnWeapon(weapon, enchantmentId) {
	const enchantments = (weapon.system.enchantments ?? []).map((e) =>
		e.id === enchantmentId ? { ...e, active: !e.active } : e
	);
	await weapon.update({ "system.enchantments": enchantments });
}
