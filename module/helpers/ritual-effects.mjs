import { getRitualSourceId } from "./ritual-enchantments.mjs";
import { ritualDurationToEffectDuration } from "./ritual-helpers.mjs";
import { getRitualZoneAttackPenalty } from "./ritual-zones.mjs";
import { resolveTemporaryResourceAmount, shouldReplaceTemporaryResource } from "./temporary-resources.mjs";

/** @type {number} Foundry CONST.ACTIVE_EFFECT_MODES.ADD */
const ADD = 2;

/** @type {readonly string[]} */
export const PHYSICAL_DAMAGE_TYPES = ["ballisticDamage", "cuttingDamage", "impactDamage", "piercingDamage"];

/** @type {readonly string[]} */
export const PARANORMAL_DAMAGE_TYPES = ["bloodDamage", "deathDamage", "knowledgeDamage", "energyDamage", "fearDamage"];

/** @type {readonly string[]} */
export const ELEMENTAL_DAMAGE_TYPES = ["fireDamage", "eletricDamage", "coldDamage", "chemicalDamage", "mentalDamage"];

/** @type {readonly string[]} */
export const ALL_RD_DISPLAY_TYPES = [...PHYSICAL_DAMAGE_TYPES, ...PARANORMAL_DAMAGE_TYPES, ...ELEMENTAL_DAMAGE_TYPES];

/** @type {readonly string[]} */
export const AGENT_SKILL_KEYS = [
	"acrobatics",
	"animal",
	"arts",
	"athleticism",
	"relevance",
	"sciences",
	"crime",
	"diplomacy",
	"deception",
	"resilience",
	"stealth",
	"initiative",
	"intimidation",
	"intuition",
	"investigation",
	"fighting",
	"medicine",
	"occultism",
	"perception",
	"driving",
	"aim",
	"reflexes",
	"religion",
	"survival",
	"tactics",
	"technology",
	"will",
];

/**
 * Mechanical ritual effects by source id and tier.
 * RP-only rituals are omitted — they get a duration tracker with no stat changes.
 *
 * @type {Record<string, Record<string, object>>}
 */
export const RITUAL_TIER_EFFECTS = {
	"armadura-de-sangue": {
		base: { defense: 5 },
		discente: { defense: 10, rdPhysical: 5 },
		verdadeiro: { defense: 15, rdPhysical: 10 },
	},
	"aprimorar-fisico": {
		base: { attributeChoice: ["dex", "str"], attributeBonus: 1 },
		discente: { attributeChoice: ["dex", "str"], attributeBonus: 2 },
		verdadeiro: { attributeChoice: ["dex", "str"], attributeBonus: 3 },
	},
	"aprimorar-mente": {
		base: { attributeChoice: ["int", "pre"], attributeBonus: 1 },
		discente: { attributeChoice: ["int", "pre"], attributeBonus: 2 },
		verdadeiro: { attributeChoice: ["int", "pre"], attributeBonus: 3 },
	},
	"coincidencia-forcada": {
		base: { skillsAll: 2 },
		discente: { skillsAll: 2 },
		verdadeiro: { skillsAll: 5 },
	},
	embaralhar: {
		base: { defense: 6, meta: { copies: 3, defenseLossPerMiss: 2 } },
		discente: { defense: 10, meta: { copies: 5, defenseLossPerMiss: 2 } },
		verdadeiro: { defense: 16, meta: { copies: 8, defenseLossPerMiss: 2, onCopyDestroyed: "ofuscado" } },
	},
	"esconder-dos-olhos": {
		base: { skills: { stealth: 15 }, meta: { invisible: true } },
		discente: { skills: { stealth: 15 }, meta: { invisible: true, auraRadius: 3 } },
		verdadeiro: { skills: { stealth: 15 }, meta: { invisible: true, touchTarget: true } },
	},
	"fortalecimento-sensorial": {
		base: { skillDice: { investigation: 1, fighting: 1, perception: 1, aim: 1 } },
		discente: {
			skillDice: { investigation: 1, fighting: 1, perception: 1, aim: 1 },
			meta: { enemyAttackPenalty: 1 },
		},
		verdadeiro: {
			skillDice: { investigation: 1, fighting: 1, perception: 1, aim: 1 },
			defense: 10,
			skills: { reflexes: 10 },
			meta: { enemyAttackPenalty: 1, immuneSurprise: true },
		},
	},
	"protecao-contra-rituais": {
		base: { rdParanormal: 5, savesRitual: 5 },
		discente: { rdParanormal: 5, savesRitual: 5 },
		verdadeiro: { rdParanormal: 10, savesRitual: 10 },
	},
	"forma-monstruosa": {
		base: { attack: 5, meleeDamage: 5, tempHP: 30, meta: { size: "Grande", cannotCastRituals: true } },
		discente: { attack: 5, meleeDamage: 5, tempHP: 30, meta: { immuneMinorConditions: true } },
		verdadeiro: { attack: 10, meleeDamage: 10, tempHP: 50, meta: { size: "Grande", cannotCastRituals: true } },
	},
	"odio-incontrolavel": {
		base: { attack: 2, meleeDamage: 2, rdPhysical: 5, meta: { mustAttackEachTurn: true } },
		discente: { attack: 2, meleeDamage: 2, rdPhysical: 5, meta: { extraMeleeOnAgredir: true } },
		verdadeiro: { attack: 5, meleeDamage: 5, rdPhysicalHalf: true, meta: { mustAttackEachTurn: true } },
	},
	"distorcer-aparencia": {
		base: { skills: { deception: 10 } },
		discente: { skills: { deception: 10 } },
		verdadeiro: { skills: { deception: 10 } },
	},
	"deteccao-de-ameacas": {
		discente: { savesTraps: 5 },
		verdadeiro: { savesTraps: 5 },
	},
	"espirais-da-perdicao": {
		base: { diceAttack: -1 },
		discente: { diceAttack: -2 },
		verdadeiro: { diceAttack: -2 },
	},
	"polarizacao-caotica": {
		repelir: { rdPhysical: 5 },
	},
	"salto-fantasma": {
		discente: { defense: 10, skills: { reflexes: 10 }, meta: { reactionDefense: true } },
		verdadeiro: { defense: 10, skills: { reflexes: 10 }, meta: { reactionDefense: true } },
	},
	"tela-de-ruido": {
		base: { tempHP: 30, rdPhysical: 15, meta: { reactionAltRd: 15 } },
		discente: { tempHP: 60, rdPhysical: 30, meta: { reactionAltRd: 30 } },
	},
	"alterar-destino": {
		base: { meta: { reactionBonus: 15 } },
		verdadeiro: { meta: { reactionBonus: 15, allyRange: true } },
	},
	"consumir-manancial": {
		base: { meta: { tempHPFormula: "3d6" } },
		discente: { meta: { tempHPFormula: "6d6" } },
	},
};

/**
 * @param {string} ritualId
 * @returns {boolean}
 */
export function hasMechanicalRitualEffect(ritualId) {
	return Boolean(ritualId && RITUAL_TIER_EFFECTS[ritualId]);
}

const RITUAL_TIER_KEYS = new Set(["base", "discente", "verdadeiro"]);

/**
 * Aprimorar Físico/Mente: Base +1 die, Discente +2, Verdadeiro +3 (one extra die per upcast).
 * @param {string} tierKey
 * @returns {number}
 */
export function getAttributeUpcastBonus(tierKey) {
	const key = String(tierKey ?? "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase();
	if (key.startsWith("verdadeiro") || key === "true") return 3;
	if (key.startsWith("discente") || key === "student") return 2;
	return 1;
}

/**
 * Build the ActiveEffect payload for Aprimorar Físico / Mente.
 * @param {object} options
 * @param {string} options.ritualName
 * @param {string} options.ritualId
 * @param {string} options.tierKey
 * @param {string} options.tierLabel
 * @param {string} options.attributeKey
 * @param {string} [options.img]
 * @param {string} [options.origin]
 * @param {string} [options.durationKey]
 * @param {string} [options.attributeLabel]
 * @returns {{ effectData: object, bonus: number }}
 */
export function buildAprimorarEffectData({
	ritualName,
	ritualId,
	tierKey,
	tierLabel,
	attributeKey,
	img = "",
	origin = "",
	durationKey = "scene",
	attributeLabel = "",
}) {
	const bonus = getAttributeUpcastBonus(tierKey);
	const label = attributeLabel || attributeKey;
	const effectData = {
		name: `${ritualName} (${tierLabel}) +${bonus}`,
		img,
		icon: img,
		origin,
		disabled: false,
		duration: ritualDurationToEffectDuration(durationKey || "scene"),
		description: `<p>+${bonus} ${label}</p>`,
		changes: [
			{
				key: `system.attributes.${attributeKey}.bonus`,
				mode: ADD,
				value: String(bonus),
				priority: 20,
			},
		],
		flags: {
			ordemparanormal: {
				ritualEffect: true,
				ritualSourceId: ritualId,
				ritualTier: tierKey,
				chosenAttribute: attributeKey,
				attributeBonus: bonus,
			},
		},
	};
	return { effectData, bonus };
}

export function getRitualTierEffectSpec(ritualId, tierKey, modeKey = "") {
	const table = RITUAL_TIER_EFFECTS[ritualId];
	if (!table) return null;
	// Mode names (e.g. polarizacao "repelir") must not collide with tier keys like "base".
	if (modeKey && !RITUAL_TIER_KEYS.has(modeKey) && table[modeKey]) {
		return foundry.utils.deepClone(table[modeKey]);
	}
	const spec = foundry.utils.deepClone(table[tierKey] ?? table.base ?? null);
	if (!spec) return null;
	// Always derive attribute dice from the tier key so upcasts cannot fall back to +1.
	if (spec.attributeChoice?.length) {
		spec.attributeBonus = getAttributeUpcastBonus(tierKey);
	}
	return spec;
}

/**
 * @param {object} spec
 * @param {object} [options]
 * @returns {{ changes: object[], flags: object, instant: object }}
 */
export function buildRitualEffectParts(spec, options = {}) {
	const changes = [];
	const flags = { ordemparanormal: { ritualEffect: true } };
	const instant = {};

	if (!spec) return { changes, flags, instant };

	if (spec.defense) {
		changes.push({ key: "system.defense.bonus", mode: ADD, value: String(spec.defense), priority: 20 });
	}

	if (spec.desloc) {
		changes.push({ key: "system.desloc.bonus", mode: ADD, value: String(spec.desloc), priority: 20 });
	}

	if (spec.attributeBonus && options.attributeKey) {
		// Use `.bonus` (not `.value`) so sheet edits of the base attribute don't clash with the AE.
		changes.push({
			key: `system.attributes.${options.attributeKey}.bonus`,
			mode: ADD,
			value: String(spec.attributeBonus),
			priority: 20,
		});
	}

	if (spec.skillsAll) {
		for (const skillKey of AGENT_SKILL_KEYS) {
			changes.push({
				key: `system.skills.${skillKey}.mod`,
				mode: ADD,
				value: String(spec.skillsAll),
				priority: 20,
			});
		}
	}

	if (spec.skills) {
		for (const [skillKey, amount] of Object.entries(spec.skills)) {
			changes.push({
				key: `system.skills.${skillKey}.mod`,
				mode: ADD,
				value: String(amount),
				priority: 20,
			});
		}
	}

	if (spec.skillDice) {
		for (const [skillKey, amount] of Object.entries(spec.skillDice)) {
			changes.push({
				key: `system.skills.${skillKey}.diceMod`,
				mode: ADD,
				value: String(amount),
				priority: 20,
			});
		}
	}

	if (spec.savesRitual) {
		for (const skillKey of ["will", "resilience"]) {
			changes.push({
				key: `system.skills.${skillKey}.mod`,
				mode: ADD,
				value: String(spec.savesRitual),
				priority: 20,
			});
		}
	}

	if (spec.savesTraps) {
		for (const skillKey of ["reflexes", "perception"]) {
			changes.push({
				key: `system.skills.${skillKey}.mod`,
				mode: ADD,
				value: String(spec.savesTraps),
				priority: 20,
			});
		}
	}

	const ritualRd = {};
	if (spec.rdPhysical) {
		for (const type of PHYSICAL_DAMAGE_TYPES) ritualRd[type] = spec.rdPhysical;
	}
	if (spec.rdParanormal) {
		for (const type of PARANORMAL_DAMAGE_TYPES) ritualRd[type] = spec.rdParanormal;
	}
	if (Object.keys(ritualRd).length) flags.ordemparanormal.ritualRd = ritualRd;

	const combatMod = {};
	if (spec.attack) combatMod.attackBonus = spec.attack;
	if (spec.attackPenalty) combatMod.attackPenalty = spec.attackPenalty;
	if (spec.diceAttack) combatMod.diceAttack = spec.diceAttack;
	if (spec.meleeDamage) combatMod.meleeDamageBonus = spec.meleeDamage;
	if (Object.keys(combatMod).length) flags.ordemparanormal.combatMod = combatMod;

	if (spec.rdPhysicalHalf) flags.ordemparanormal.rdPhysicalHalf = true;
	if (spec.tempHP) instant.tempHP = spec.tempHP;
	if (spec.meta) {
		flags.ordemparanormal.ritualMeta = {
			...spec.meta,
			...(Number.isFinite(spec.meta.copies) ? { copiesRemaining: spec.meta.copies } : {}),
		};
	}

	return { changes, flags, instant };
}

/**
 * @param {Item} ritualItem
 * @param {object} tier
 * @param {object} [options]
 * @returns {object|null}
 */
export function buildRitualActiveEffectData(ritualItem, tier, options = {}) {
	const ritualId = getRitualSourceId(ritualItem);
	const modeKey = tier.mode ? slugifyTierKey(tier.mode) : "";
	const spec = getRitualTierEffectSpec(ritualId, tier.key, modeKey);
	const duration = ritualDurationToEffectDuration(ritualItem.system.duration);
	const { changes, flags, instant } = buildRitualEffectParts(spec, options);

	const effectData = {
		name: `${ritualItem.name} (${tier.label})`,
		img: ritualItem.img,
		icon: ritualItem.img,
		origin: ritualItem.uuid,
		disabled: false,
		duration,
		description: ritualItem.system.chatDescription || ritualItem.name,
		changes,
		flags: {
			...flags,
			ordemparanormal: {
				...(flags.ordemparanormal ?? {}),
				ritualSourceId: ritualId,
				ritualTier: tier.key,
				ritualInstant: instant,
			},
		},
	};

	if (options.attributeKey) {
		effectData.flags.ordemparanormal.chosenAttribute = options.attributeKey;
		if (spec?.attributeBonus) {
			effectData.description = `${effectData.description}<p><strong>+${spec.attributeBonus}</strong> ${options.attributeKey}</p>`;
		}
	}

	const statuses = options.conditionIds ?? [];
	if (statuses.length) {
		effectData.statuses = statuses;
		effectData.flags.ordemparanormal.ritualConditions = statuses;
		const conditionOnly = !changes.length && !instant.tempHP;
		if (conditionOnly && options.conditionDuration) {
			effectData.duration = {
				rounds: options.conditionDuration.rounds ?? duration.rounds,
				seconds: options.conditionDuration.seconds ?? duration.seconds,
			};
		}
	}

	return effectData;
}

/**
 * @param {string} label
 * @returns {string}
 */
function slugifyTierKey(label) {
	return String(label ?? "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

/**
 * Effective attribute dice count (base value + ritual/AE bonus).
 * @param {{ value?: number, bonus?: number }|null|undefined} attribute
 * @returns {number}
 */
export function getEffectiveAttributeValue(attribute) {
	return (Number(attribute?.value) || 0) + (Number(attribute?.bonus) || 0);
}

/**
 * @param {Item} ritualItem
 * @param {object} tier
 * @returns {Promise<object|null>}
 */
export async function promptRitualEffectOptions(ritualItem, tier) {
	const ritualId = getRitualSourceId(ritualItem);
	const modeKey = tier.mode ? slugifyTierKey(tier.mode) : "";
	const spec = getRitualTierEffectSpec(ritualId, tier.key, modeKey);
	if (!spec?.attributeChoice?.length) return {};

	const labels = {
		dex: game.i18n.localize("op.dexAbv"),
		str: game.i18n.localize("op.strAbv"),
		int: game.i18n.localize("op.intAbv"),
		pre: game.i18n.localize("op.preAbv"),
	};

	const bonus = getAttributeUpcastBonus(tier.key);
	try {
		// One button per attribute — return value is the action id (no form parsing).
		const attributeKey = await foundry.applications.api.DialogV2.wait({
			window: { title: game.i18n.format("op.ritualAttributePromptTitle", { name: ritualItem.name }) },
			content: `<p>${game.i18n.format("op.ritualAttributePromptHint", { bonus })}</p>`,
			buttons: spec.attributeChoice.map((key) => ({
				action: key,
				label: `${labels[key] ?? key} (+${bonus})`,
			})),
			rejectClose: false,
		});
		if (!attributeKey) return null;
		return { attributeKey: String(attributeKey) };
	} catch {
		return null;
	}
}

/**
 * Remove an existing effect from the same ritual origin before re-applying.
 * @param {Actor} targetActor
 * @param {string} ritualItemUuid
 * @param {string} [ritualSourceId]
 */
export async function removeExistingRitualEffect(targetActor, ritualItemUuid, ritualSourceId = "") {
	const existing = targetActor.effects.filter((effect) => {
		if (ritualItemUuid && effect.origin === ritualItemUuid) return true;
		const flags = effect.flags?.ordemparanormal ?? {};
		if (ritualSourceId && flags.ritualSourceId === ritualSourceId) return true;
		return false;
	});
	if (existing.length)
		await targetActor.deleteEmbeddedDocuments(
			"ActiveEffect",
			existing.map((e) => e.id)
		);
}

/**
 * Merge RD from actor resistances and active effect flags.
 * @param {object} [options]
 * @param {object} [options.resistances]
 * @param {object[]} [options.effects]
 * @returns {{ byType: { key: string, value: number }[], physicalHalf: boolean }}
 */
export function mergeActiveRdTotals({ resistances = {}, effects = [] } = {}) {
	/** @type {Record<string, number>} */
	const totals = {};
	let physicalHalf = false;

	for (const key of ALL_RD_DISPLAY_TYPES) {
		const base = Number(resistances?.[key]?.value) || 0;
		if (base) totals[key] = base;
	}

	for (const effect of effects) {
		if (effect.disabled) continue;
		const rd = effect.ritualRd ?? effect.flags?.ordemparanormal?.ritualRd;
		if (rd) {
			for (const [key, raw] of Object.entries(rd)) {
				const amount = Number(raw) || 0;
				if (!amount) continue;
				totals[key] = (totals[key] || 0) + amount;
			}
		}
		if (effect.rdPhysicalHalf || effect.flags?.ordemparanormal?.rdPhysicalHalf) physicalHalf = true;
	}

	const byType = ALL_RD_DISPLAY_TYPES.filter((key) => (totals[key] || 0) > 0).map((key) => ({
		key,
		value: totals[key],
	}));

	return { byType, physicalHalf };
}

/**
 * @param {Actor} actor
 * @returns {{ byType: { key: string, value: number }[], physicalHalf: boolean }}
 */
export function getActiveRdTotals(actor) {
	if (!actor) return { byType: [], physicalHalf: false };

	const effects = [];
	for (const effect of actor.allApplicableEffects?.() ?? []) {
		effects.push({
			disabled: effect.disabled,
			flags: effect.flags,
		});
	}

	return mergeActiveRdTotals({
		resistances: actor.system?.resistances,
		effects,
	});
}

/**
 * @param {Actor} actor
 * @returns {{ defense: number, desloc: number, tempPV: number }}
 */
export function getActiveStatBonuses(actor) {
	return {
		defense: Number(actor?.system?.defense?.bonus) || 0,
		desloc: Number(actor?.system?.desloc?.bonus) || 0,
		tempPV: Number(actor?.system?.PV?.temp) || 0,
	};
}

/**
 * @param {Actor} actor
 * @returns {{ key: string, value: number|string, label: string }[]}
 */
export function prepareActiveRdDisplay(actor) {
	const { byType, physicalHalf } = getActiveRdTotals(actor);
	const rows = byType.map(({ key, value }) => ({
		key,
		value,
		label: game.i18n.localize(`op.damageTypeAbv.${key}`) || key,
	}));

	if (physicalHalf) {
		rows.push({
			key: "physicalHalf",
			value: "½",
			label: game.i18n.localize("op.rdPhysicalHalf"),
		});
	}

	return rows;
}

/**
 * @param {Actor} actor
 * @param {string} [damageType]
 * @returns {number}
 */
export function getRitualDamageResistanceBonus(actor, damageType = "") {
	if (!damageType || !actor?.allApplicableEffects) return 0;

	let total = 0;

	for (const effect of actor.allApplicableEffects()) {
		if (effect.disabled) continue;
		const rd = effect.flags?.ordemparanormal?.ritualRd;
		if (rd?.[damageType]) total += Number(rd[damageType]) || 0;
	}

	return total;
}

/**
 * @param {Actor} actor
 * @param {number} amount
 * @param {string} damageType
 * @returns {number}
 */
export function applyRitualPhysicalHalfReduction(actor, amount, damageType) {
	if (!PHYSICAL_DAMAGE_TYPES.includes(damageType)) return amount;
	for (const effect of actor.allApplicableEffects?.() ?? []) {
		if (effect.disabled) continue;
		if (effect.flags?.ordemparanormal?.rdPhysicalHalf) return Math.floor(amount / 2);
	}
	return amount;
}

/**
 * @param {Actor} actor
 * @returns {{ attackBonus: number, attackPenalty: number, diceAttack: number, meleeDamageBonus: number }}
 */
export function getRitualCombatModifiers(actor) {
	const result = { attackBonus: 0, attackPenalty: 0, diceAttack: 0, meleeDamageBonus: 0 };
	if (!actor) return result;

	if (actor.allApplicableEffects) {
		for (const effect of actor.allApplicableEffects()) {
			if (effect.disabled) continue;
			const mod = effect.flags?.ordemparanormal?.combatMod;
			if (!mod) continue;
			result.attackBonus += Number(mod.attackBonus) || 0;
			result.attackPenalty += Number(mod.attackPenalty) || 0;
			result.diceAttack += Number(mod.diceAttack) || 0;
			result.meleeDamageBonus += Number(mod.meleeDamageBonus) || 0;
		}
	}

	result.attackPenalty += getRitualZoneAttackPenalty(actor) || 0;
	return result;
}

/**
 * Dice penalty applied to attackers targeting this actor (e.g. Fortalecimento Sensorial Discente+).
 * Returns a positive count of d20s to subtract from the attacker's attribute dice.
 * @param {Actor} targetActor
 * @returns {number}
 */
export function getEnemyAttackDicePenaltyFromTarget(targetActor) {
	let total = 0;
	if (!targetActor?.allApplicableEffects) return 0;

	for (const effect of targetActor.allApplicableEffects()) {
		if (effect.disabled) continue;
		total += Number(effect.flags?.ordemparanormal?.ritualMeta?.enemyAttackPenalty) || 0;
	}

	return total;
}

/**
 * Pure Embaralhar miss update: −defenseLossPerMiss on Defense AE change, −1 copy.
 * @param {object} effectLike  ActiveEffect-like `{ changes, flags }`
 * @returns {{ changes: object[], copiesRemaining: number, loss: number, ofuscado: boolean, defenseBonus: number }|null}
 */
export function computeEmbaralharMissUpdate(effectLike) {
	const flags = effectLike?.flags?.ordemparanormal ?? {};
	const meta = flags.ritualMeta;
	if (!meta || !Number.isFinite(Number(meta.defenseLossPerMiss))) return null;
	if (flags.ritualSourceId && flags.ritualSourceId !== "embaralhar") return null;

	const remaining = Number(meta.copiesRemaining ?? meta.copies ?? 0);
	if (remaining <= 0) return null;

	const loss = Math.max(0, Number(meta.defenseLossPerMiss) || 0);
	if (!loss) return null;

	let defenseBonus = null;
	const changes = (effectLike.changes ?? []).map((change) => {
		if (change.key !== "system.defense.bonus") return change;
		const next = Math.max(0, (Number(change.value) || 0) - loss);
		defenseBonus = next;
		return { ...change, value: String(next) };
	});
	if (defenseBonus == null) return null;

	return {
		changes,
		copiesRemaining: Math.max(0, remaining - 1),
		loss,
		ofuscado: meta.onCopyDestroyed === "ofuscado",
		defenseBonus,
	};
}

/**
 * Find Embaralhar (or any defenseLossPerMiss ritual) on the defender and apply a miss.
 * @param {Actor} defender
 * @param {object} [options]
 * @param {Actor|null} [options.attacker]
 * @param {ChatMessage|null} [options.message]
 * @returns {Promise<object|null>}
 */
export async function applyEmbaralharOnMiss(defender, { attacker = null, message = null } = {}) {
	if (!defender) return null;
	if (message?.getFlag?.("ordemparanormal", "embaralharMissApplied")) return null;

	const effects = [...(defender.effects ?? [])];
	let targetEffect = null;
	let update = null;
	for (const effect of effects) {
		if (effect.disabled) continue;
		update = computeEmbaralharMissUpdate(effect);
		if (update) {
			targetEffect = effect;
			break;
		}
	}
	if (!targetEffect || !update) return null;

	if (!defender.isOwner) {
		const gmOnline = game.users.some((u) => u.isGM && u.active);
		if (!gmOnline) {
			ui.notifications.warn(game.i18n.localize("op.embaralharNeedsGM"));
			return null;
		}
		game.socket.emit("system.ordemparanormal", {
			type: "applyEmbaralharMiss",
			defenderUuid: defender.uuid,
			attackerUuid: attacker?.uuid ?? null,
			messageId: message?.id ?? null,
			userId: game.user.id,
		});
		return { ...update, deferred: true };
	}

	if (message?.id) {
		await message.setFlag("ordemparanormal", "embaralharMissApplied", true);
	}

	await targetEffect.update({
		changes: update.changes,
		"flags.ordemparanormal.ritualMeta.copiesRemaining": update.copiesRemaining,
	});

	if (update.ofuscado && attacker) {
		const { applyRitualStatusConditions } = await import("./ritual-conditions.mjs");
		await applyRitualStatusConditions(attacker, ["ofuscado"], {
			origin: targetEffect.uuid,
			ritualName: targetEffect.name,
			duration: { rounds: 1 },
		});
	}

	await ChatMessage.create({
		speaker: ChatMessage.getSpeaker({ actor: defender }),
		content: game.i18n.format("op.embaralharMiss", {
			target: defender.name,
			loss: update.loss,
			bonus: update.defenseBonus,
			copies: update.copiesRemaining,
		}),
	});

	return update;
}

/**
 * Apply one-shot effects after the ActiveEffect is created (temp HP, etc.).
 * @param {Actor} actor
 * @param {object} effectData
 */
export async function applyRitualInstantEffects(actor, effectData) {
	const instant = effectData?.flags?.ordemparanormal?.ritualInstant;
	if (!instant?.tempHP) return;

	if (actor.type === "agent") {
		const current = Number(actor.system.PV?.temp ?? 0);
		const incoming = Number(instant.tempHP) || 0;
		if (shouldReplaceTemporaryResource(current, incoming)) {
			await actor.update({ "system.PV.temp": resolveTemporaryResourceAmount(current, incoming) });
		}
	}
}
