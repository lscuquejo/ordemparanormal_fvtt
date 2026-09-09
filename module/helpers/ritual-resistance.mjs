import { extractTierEnhancementSnippet } from "./ritual-zones.mjs";

/**
 * @param {object|null|undefined} resistanceSpec
 * @returns {boolean}
 */
export function ritualNeedsResistance(resistanceSpec) {
	return Boolean(resistanceSpec?.skill && resistanceSpec?.effect && resistanceSpec.effect !== "none");
}

/**
 * Buff rituals only force resistance on other people — never on the caster.
 * @param {string} casterUuid
 * @param {string[]} targetUuids
 * @returns {{ selfTargets: string[], otherTargets: string[] }}
 */
export function splitBuffResistanceTargets(casterUuid, targetUuids = []) {
	const selfTargets = [];
	const otherTargets = [];
	for (const uuid of targetUuids) {
		if (!uuid) continue;
		if (uuid === casterUuid) selfTargets.push(uuid);
		else otherTargets.push(uuid);
	}
	return { selfTargets, otherTargets };
}

/**
 * @param {object} user
 * @param {Actor} targetActor
 * @returns {boolean}
 */
export function canUserRollResistance(user, targetActor) {
	if (!user || !targetActor) return false;
	if (user.isGM) return true;
	return targetActor.testUserPermission?.(user, "OWNER") ?? false;
}

/**
 * Foundry flag storage splits keys like "Actor.abc" into nested { Actor: { abc: ... } }.
 * We store results as an array; this normalizes legacy object shapes on read.
 * @param {unknown} raw
 * @returns {object[]}
 */
export function normalizeResistanceResults(raw) {
	if (Array.isArray(raw)) {
		return raw.filter((entry) => entry?.actorUuid);
	}
	if (!raw || typeof raw !== "object") return [];

	const entries = [];
	for (const [key, value] of Object.entries(raw)) {
		if (!value || typeof value !== "object") continue;
		if (value.actorUuid) {
			entries.push(value);
			continue;
		}
		if (key === "Actor") {
			for (const [id, nested] of Object.entries(value)) {
				if (nested && typeof nested === "object") {
					entries.push({ ...nested, actorUuid: nested.actorUuid ?? `Actor.${id}` });
				}
			}
			continue;
		}
		entries.push({ ...value, actorUuid: value.actorUuid ?? key });
	}
	return entries;
}

/**
 * @param {unknown} raw
 * @param {string} actorUuid
 * @returns {object|null}
 */
export function getResistanceResult(raw, actorUuid) {
	return normalizeResistanceResults(raw).find((entry) => entry.actorUuid === actorUuid) ?? null;
}

/**
 * @param {unknown} raw
 * @param {object} entry
 * @returns {object[]}
 */
export function upsertResistanceResult(raw, entry) {
	const list = normalizeResistanceResults(raw).filter((item) => item.actorUuid !== entry.actorUuid);
	list.push(entry);
	return list;
}

/**
 * @param {string[]} targetUuids
 * @param {unknown} resistanceResults
 * @returns {boolean}
 */
export function allResistancesResolved(targetUuids, resistanceResults = []) {
	const list = normalizeResistanceResults(resistanceResults);
	return (targetUuids ?? []).every((uuid) => list.some((entry) => entry.actorUuid === uuid));
}

/**
 * @param {Item} ritualItem
 * @param {object} tier
 * @returns {{ skill: string|null, effect: string, label: string }}
 */
export function getRitualResistanceSpec(ritualItem, tier) {
	const tierSnippet = extractTierEnhancementSnippet(ritualItem.system?.description, tier);
	const combined = `${tierSnippet} ${ritualItem.system?.resistance ?? ""} ${ritualItem.system?.description ?? ""}`;

	if (/resist[eê]ncia para ["']?nenhuma|sem resist[eê]ncia|nenhuma resist/i.test(tierSnippet)) {
		return { skill: null, effect: "none", label: "" };
	}

	let skill = ritualItem.system?.skillResis || null;
	let effect = ritualItem.system?.resistance || null;

	if (/vontade/i.test(combined) && !skill) skill = "will";
	if (/reflexos/i.test(combined) && !skill) skill = "reflexes";
	if (/fortitude/i.test(combined) && !skill) skill = "resilience";

	if (/anula/i.test(combined)) effect = effect || "nullifies";
	else if (/desacredita/i.test(combined)) effect = effect || "discredits";
	else if (/parcial/i.test(combined)) effect = effect || "partial";
	else if (/metade|reduz/i.test(combined)) effect = effect || "reducesByHalf";

	if (!skill || !effect || effect === "none") {
		return { skill: null, effect: "none", label: "" };
	}

	const skillLabel = game.i18n.localize(CONFIG.op?.skills?.[skill] ?? skill);
	return { skill, effect, label: skillLabel };
}

/**
 * @param {number} amount
 * @param {string} effect
 * @param {boolean} passed
 * @returns {number}
 */
export function adjustDamageForResistance(amount, effect, passed) {
	const base = Math.max(0, Number(amount) || 0);
	if (!passed) return base;

	switch (effect) {
		case "reducesByHalf":
		case "partial":
			return Math.floor(base / 2);
		case "nullifies":
		case "discredits":
			return 0;
		default:
			return base;
	}
}

/**
 * Whether a passed resistance blocks a non-damage ritual effect.
 * @param {string} effect
 * @param {boolean} passed
 * @returns {boolean}
 */
export function resistanceBlocksEffect(effect, passed) {
	if (!passed) return false;
	return ["nullifies", "discredits"].includes(effect);
}

/**
 * @param {Roll|null|undefined} roll
 * @returns {number}
 */
export function extractRollTotal(roll) {
	if (!roll) return 0;
	if (!roll._evaluated) {
		try {
			roll.evaluate({ async: false });
		} catch {
			/* already evaluating or invalid */
		}
	}
	const total = Number(roll.total);
	if (Number.isFinite(total)) return total;
	const dieTotal = Number(roll.d20?.total ?? roll.terms?.[0]?.total);
	return Number.isFinite(dieTotal) ? dieTotal : 0;
}

/**
 * @param {Actor} targetActor
 * @param {object} options
 * @returns {Promise<{ passed: boolean, total: number, roll: Roll|null }|null>}
 */
export async function rollRitualResistanceForTarget(
	targetActor,
	{ resistanceSpec, ritualDT, ritualName = "", casterActor = null }
) {
	if (!ritualNeedsResistance(resistanceSpec)) return null;

	const dt = Number(ritualDT) || Number(casterActor?.system?.ritual?.DT) || 10;
	const rolls = await targetActor.rollSkill(
		{ skill: resistanceSpec.skill, rolls: [{ options: { target: dt } }] },
		{ configure: false },
		{
			create: true,
			flavor: game.i18n.format("op.ritualResistanceRoll", {
				target: targetActor.name,
				skill: resistanceSpec.label,
				dt,
				ritual: ritualName || "—",
			}),
		}
	);

	const roll = rolls?.[0] ?? null;
	const total = extractRollTotal(roll);
	return { passed: Boolean(roll?.isSuccess), total, roll };
}

/**
 * @param {number} amount
 * @param {boolean|null} passed
 * @param {object} resistanceSpec
 * @returns {number}
 */
export function applyResistanceToDamage(amount, passed, resistanceSpec) {
	if (passed === null || passed === undefined || !ritualNeedsResistance(resistanceSpec)) {
		return Math.max(0, Number(amount) || 0);
	}
	return adjustDamageForResistance(amount, resistanceSpec.effect, passed);
}

/**
 * @param {number} baseDamage
 * @param {object} resistanceSpec
 * @param {boolean} passed
 * @returns {{ damage: number, negated: boolean, outcome: string }}
 */
export function resolveRitualTargetOutcome(baseDamage, resistanceSpec, passed) {
	const amount = Math.max(0, Number(baseDamage) || 0);
	if (!ritualNeedsResistance(resistanceSpec)) {
		return { damage: amount, negated: false, outcome: "full" };
	}

	if (passed) {
		if (["nullifies", "discredits"].includes(resistanceSpec.effect)) {
			return { damage: 0, negated: true, outcome: "negated" };
		}
		if (["reducesByHalf", "partial"].includes(resistanceSpec.effect)) {
			return { damage: Math.floor(amount / 2), negated: false, outcome: "half" };
		}
	}

	return { damage: amount, negated: false, outcome: "full" };
}

/**
 * @param {string} outcome
 * @returns {string}
 */
export function getRitualOutcomeMessageKey(outcome) {
	switch (outcome) {
		case "negated":
			return "op.ritualOutcomeNegated";
		case "half":
			return "op.ritualOutcomeHalf";
		default:
			return "op.ritualOutcomeFull";
	}
}
