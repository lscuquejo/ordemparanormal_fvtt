const PHYSICAL_ATTRS = new Set(["dex", "str", "vit"]);
const MENTAL_ATTRS = new Set(["int", "pre"]);
const DEX_STR_ATTRS = new Set(["dex", "str"]);

const SKILL_ATTR = {
	fighting: "str",
	aim: "dex",
	resilience: "vit",
	reflexes: "dex",
	will: "pre",
	initiative: "dex",
	perception: "pre",
	acrobatics: "dex",
	animal: "pre",
	arts: "pre",
	athleticism: "str",
	relevance: "int",
	sciences: "int",
	crime: "dex",
	diplomacy: "pre",
	deception: "pre",
	stealth: "dex",
	intimidation: "pre",
	intuition: "pre",
	investigation: "int",
	medicine: "int",
	occultism: "int",
	driving: "dex",
	religion: "pre",
	survival: "int",
	tactics: "int",
	technology: "int",
	freeSkill: "int",
};

/**
 * Mechanical effects per condition. Composite conditions list `includes` so
 * child penalties are applied without requiring extra HUD statuses.
 *
 * @type {Record<string, object>}
 */
export const CONDITION_EFFECTS = {
	abalado: { diceAll: -1, upgrade: "apavorado" },
	apavorado: { diceSkills: -2 },
	agarrado: { includes: ["desprevenido", "imovel"], diceAttack: -1 },
	alquebrado: { peCostExtra: 1 },
	atordoado: { includes: ["desprevenido"] },
	caido: { deslocFixed: 1.5, diceMeleeAttack: -2 },
	cego: { includes: ["desprevenido", "lento"], diceDexStr: -2 },
	debilitado: { dicePhysical: -2, upgrade: "inconsciente" },
	desprevenido: { defense: -5, diceReflexes: -1 },
	"em-chamas": { startOfTurn: "em-chamas" },
	enredado: { includes: ["lento", "vulneravel"], diceAttack: -1 },
	esmorecido: { diceMental: -2 },
	exausto: { includes: ["debilitado", "lento", "vulneravel"], upgrade: "inconsciente" },
	fascinado: { dicePerception: -2 },
	fatigado: { includes: ["fraco", "vulneravel"], upgrade: "exausto" },
	fraco: { dicePhysical: -1, upgrade: "debilitado" },
	frustrado: { diceMental: -1, upgrade: "esmorecido" },
	imovel: { deslocZero: true },
	inconsciente: { includes: ["indefeso"] },
	indefeso: { defense: -10, autoFailReflexes: true },
	lento: { deslocHalf: true },
	ofuscado: { diceAttack: -1, dicePerception: -1 },
	paralisado: { includes: ["imovel", "indefeso"] },
	petrificado: { includes: ["inconsciente"], rdAll: 10 },
	sangrando: { startOfTurn: "sangrando" },
	surdo: { diceInitiative: -2 },
	vulneravel: { defense: -2 },
};

const EMPTY_MODS = {
	defense: 0,
	deslocZero: false,
	deslocHalf: false,
	deslocFixed: null,
	diceAll: 0,
	diceSkills: 0,
	dicePhysical: 0,
	diceMental: 0,
	diceDexStr: 0,
	diceAttack: 0,
	diceMeleeAttack: 0,
	dicePerception: 0,
	diceReflexes: 0,
	diceInitiative: 0,
	peCostExtra: 0,
	rdAll: 0,
	autoFailReflexes: false,
	startOfTurn: [],
};

/**
 * @param {number} meters
 * @returns {number}
 */
export function halfDeslocMeters(meters) {
	const half = Math.max(0, Number(meters) || 0) / 2;
	return Math.floor(half / 1.5) * 1.5;
}

/**
 * @param {Actor} actor
 * @returns {string[]}
 */
export function getActorStatusIds(actor) {
	const ids = [];
	for (const effect of actor?.effects ?? actor?.allApplicableEffects?.() ?? []) {
		if (effect.disabled) continue;
		const statuses = effect.statuses;
		if (statuses) {
			const list = typeof statuses.has === "function" ? [...statuses] : Array.from(statuses);
			ids.push(...list);
		}
		const flagged = effect.flags?.ordemparanormal?.statusId;
		if (flagged) ids.push(flagged);
		const ritual = effect.flags?.ordemparanormal?.ritualConditions;
		if (Array.isArray(ritual)) ids.push(...ritual);
	}
	return [...new Set(ids.filter(Boolean))];
}

/**
 * @param {string} statusId
 * @param {Set<string>} [seen]
 * @returns {string[]}
 */
function expandConditionIds(statusId, seen = new Set()) {
	if (!statusId || seen.has(statusId)) return [];
	seen.add(statusId);
	const spec = CONDITION_EFFECTS[statusId];
	const ids = [statusId];
	for (const child of spec?.includes ?? []) {
		ids.push(...expandConditionIds(child, seen));
	}
	return ids;
}

/**
 * @param {Iterable<string>} statusIds
 * @returns {typeof EMPTY_MODS}
 */
export function mergeConditionModifiers(statusIds) {
	const mods = { ...EMPTY_MODS, startOfTurn: [] };
	const expanded = new Set();
	for (const id of statusIds ?? []) {
		for (const entry of expandConditionIds(id)) expanded.add(entry);
	}

	for (const id of expanded) {
		const spec = CONDITION_EFFECTS[id];
		if (!spec) continue;
		if (Number.isFinite(spec.defense)) mods.defense = Math.min(mods.defense, spec.defense);
		if (spec.deslocZero) mods.deslocZero = true;
		if (spec.deslocHalf) mods.deslocHalf = true;
		if (Number.isFinite(spec.deslocFixed)) {
			mods.deslocFixed = mods.deslocFixed == null ? spec.deslocFixed : Math.min(mods.deslocFixed, spec.deslocFixed);
		}
		for (const key of [
			"diceAll",
			"diceSkills",
			"dicePhysical",
			"diceMental",
			"diceDexStr",
			"diceAttack",
			"diceMeleeAttack",
			"dicePerception",
			"diceReflexes",
			"diceInitiative",
		]) {
			if (Number.isFinite(spec[key])) mods[key] = Math.min(mods[key], spec[key]);
		}
		if (spec.peCostExtra) mods.peCostExtra = Math.max(mods.peCostExtra, spec.peCostExtra);
		if (spec.rdAll) mods.rdAll = Math.max(mods.rdAll, spec.rdAll);
		if (spec.autoFailReflexes) mods.autoFailReflexes = true;
		if (spec.startOfTurn) mods.startOfTurn.push(spec.startOfTurn);
	}

	mods.startOfTurn = [...new Set(mods.startOfTurn)];
	return mods;
}

/**
 * @param {Actor} actor
 * @returns {typeof EMPTY_MODS}
 */
export function getActorConditionModifiers(actor) {
	if (!actor) return { ...EMPTY_MODS, startOfTurn: [] };
	return mergeConditionModifiers(getActorStatusIds(actor));
}

/**
 * Extra d20s (negative = penalty) for a roll.
 * @param {Actor} actor
 * @param {object} [context]
 * @returns {number}
 */
export function getConditionDicePenalty(
	actor,
	{ skill = "", attributeId = "", isAttack = false, isMelee = false } = {}
) {
	const mods = getActorConditionModifiers(actor);
	const attr = attributeId || SKILL_ATTR[skill] || "";
	let penalty = mods.diceAll;
	if (skill || isAttack) penalty += mods.diceSkills;
	if (isAttack) penalty += mods.diceAttack;
	if (isAttack && isMelee) penalty += mods.diceMeleeAttack;
	if (skill === "perception") penalty += mods.dicePerception;
	if (skill === "initiative") penalty += mods.diceInitiative;
	if (skill === "reflexes" && !mods.autoFailReflexes) penalty += mods.diceReflexes;
	if (PHYSICAL_ATTRS.has(attr)) penalty += mods.dicePhysical;
	if (DEX_STR_ATTRS.has(attr)) penalty += mods.diceDexStr;
	if (MENTAL_ATTRS.has(attr)) penalty += mods.diceMental;
	return penalty;
}

const ATTR_KEYS = ["dex", "str", "int", "pre", "vit"];

function loc(key) {
	const text = globalThis.game?.i18n?.localize?.(key);
	return text && text !== key ? text : "";
}

function locOr(key, fallback) {
	return loc(key) || fallback;
}

function locName(statusId) {
	return loc(`op.condition.${statusId}`) || statusId;
}

function locDesc(statusId) {
	return loc(`op.condition.desc.${statusId}`);
}

/**
 * @param {number} dice
 * @returns {string}
 */
export function formatDicePenaltyLabel(dice) {
	const n = Number(dice) || 0;
	if (!n) return "";
	const sign = n < 0 ? "–" : "+";
	return `${sign}${Math.abs(n)}d20`;
}

/**
 * @param {number} value
 * @returns {string}
 */
export function formatNumericPenaltyLabel(value) {
	const n = Number(value) || 0;
	if (!n) return "";
	return n < 0 ? `–${Math.abs(n)}` : `+${n}`;
}

function formatPeCostLabel(extra) {
	if (!extra) return "";
	const formatted = globalThis.game?.i18n?.format?.("op.conditionPeCostExtra", { n: extra });
	if (formatted && formatted !== "op.conditionPeCostExtra") return formatted;
	return `+${extra}`;
}

function actorWithOnly(statusId) {
	return {
		effects: [
			{
				disabled: false,
				statuses: new Set([statusId]),
				flags: { ordemparanormal: { statusId } },
			},
		],
	};
}

function sourceNames(statusIds, check) {
	return statusIds.filter((id) => check(id)).map(locName);
}

function penaltyEntry({ dice = 0, value = 0, label = "", tooltip = "", autoFail = false } = {}) {
	return {
		dice,
		value,
		label,
		tooltip,
		autoFail,
		affected: autoFail || Boolean(label),
	};
}

function isKnownCondition(statusId) {
	return Boolean(CONDITION_EFFECTS[statusId] || loc(`op.condition.${statusId}`));
}

function attrAbv(attr) {
	const keys = { dex: "dexAbv", str: "strAbv", int: "intAbv", pre: "preAbv", vit: "vitAbv" };
	const fallbacks = { dex: "Agi", str: "For", int: "Int", pre: "Pre", vit: "Vig" };
	return locOr(`op.${keys[attr]}`, fallbacks[attr] || attr);
}

function skillLabel(skill) {
	const fallbacks = {
		perception: "Percepção",
		reflexes: "Reflexos",
		initiative: "Iniciativa",
	};
	return locOr(`op.skill.${skill}`, fallbacks[skill] || skill);
}

/**
 * Compact list of stats a single condition reduces, for the sheet banner.
 * @param {string} statusId
 * @returns {string}
 */
export function describeConditionReductions(statusId) {
	const mods = mergeConditionModifiers([statusId]);
	const parts = [];

	if (mods.diceAll) {
		parts.push(`${locOr("op.conditionReducedTests", "testes")} ${formatDicePenaltyLabel(mods.diceAll)}`);
	} else {
		if (mods.dicePhysical) {
			parts.push(
				`${[attrAbv("dex"), attrAbv("str"), attrAbv("vit")].join(", ")} ${formatDicePenaltyLabel(mods.dicePhysical)}`
			);
		}
		if (mods.diceMental) {
			parts.push(`${[attrAbv("int"), attrAbv("pre")].join(", ")} ${formatDicePenaltyLabel(mods.diceMental)}`);
		}
		if (mods.diceDexStr) {
			parts.push(`${[attrAbv("dex"), attrAbv("str")].join(", ")} ${formatDicePenaltyLabel(mods.diceDexStr)}`);
		}
		if (mods.diceSkills) {
			parts.push(`${locOr("op.conditionReducedSkills", "perícias")} ${formatDicePenaltyLabel(mods.diceSkills)}`);
		}
		if (mods.diceAttack) {
			parts.push(`${locOr("op.conditionReducedAttacks", "ataques")} ${formatDicePenaltyLabel(mods.diceAttack)}`);
		}
		if (mods.dicePerception) {
			parts.push(`${skillLabel("perception")} ${formatDicePenaltyLabel(mods.dicePerception)}`);
		}
		if (mods.diceReflexes) {
			parts.push(`${skillLabel("reflexes")} ${formatDicePenaltyLabel(mods.diceReflexes)}`);
		}
		if (mods.diceInitiative) {
			parts.push(`${skillLabel("initiative")} ${formatDicePenaltyLabel(mods.diceInitiative)}`);
		}
	}

	if (mods.diceMeleeAttack) {
		parts.push(`${locOr("op.conditionReducedMelee", "ataques CdC")} ${formatDicePenaltyLabel(mods.diceMeleeAttack)}`);
	}
	if (mods.defense) {
		parts.push(`${locOr("op.defense", "Defesa")} ${formatNumericPenaltyLabel(mods.defense)}`);
	}
	if (mods.deslocZero) {
		parts.push(`${locOr("op.deslocamento", "Deslocamento")} ${locOr("op.conditionDeslocZero", "0m")}`);
	} else if (mods.deslocFixed != null) {
		parts.push(`${locOr("op.deslocamento", "Deslocamento")} ${String(mods.deslocFixed).replace(".", ",")}m`);
	} else if (mods.deslocHalf) {
		parts.push(`${locOr("op.deslocamento", "Deslocamento")} ${locOr("op.conditionDeslocHalf", "½")}`);
	}
	if (mods.peCostExtra) {
		parts.push(`${locOr("op.conditionStatPE", "PE")} ${formatPeCostLabel(mods.peCostExtra)}`);
	}
	if (mods.autoFailReflexes) {
		parts.push(`${skillLabel("reflexes")} ${locOr("op.conditionAutoFail", "Falha")}`);
	}

	return parts.join("; ");
}

/**
 * Sheet-facing summary of active conditions and which stats they penalize.
 * @param {Actor} actor
 * @returns {object}
 */
export function prepareConditionSheetDisplay(actor) {
	const statusIds = getActorStatusIds(actor).filter(isKnownCondition);
	const mods = mergeConditionModifiers(statusIds);

	const conditions = statusIds.map((id) => {
		const cfg = globalThis.CONFIG?.statusEffects?.find?.((entry) => entry.id === id);
		return {
			id,
			name: locName(id),
			description: locDesc(id),
			reduced: describeConditionReductions(id),
			img: cfg?.img || cfg?.icon || "",
		};
	});

	const attributes = {};
	for (const attr of ATTR_KEYS) {
		const dice = getConditionDicePenalty(actor, { attributeId: attr });
		attributes[attr] = penaltyEntry({
			dice,
			label: formatDicePenaltyLabel(dice),
			tooltip: sourceNames(statusIds, (id) => getConditionDicePenalty(actorWithOnly(id), { attributeId: attr }) < 0).join(
				" · "
			),
		});
	}

	const skills = {};
	for (const skill of Object.keys(SKILL_ATTR)) {
		const dice = getConditionDicePenalty(actor, { skill });
		const autoFail = skill === "reflexes" && mods.autoFailReflexes;
		const sources = sourceNames(statusIds, (id) => {
			const one = mergeConditionModifiers([id]);
			if (skill === "reflexes" && one.autoFailReflexes) return true;
			return getConditionDicePenalty(actorWithOnly(id), { skill }) < 0;
		});
		let label = formatDicePenaltyLabel(dice);
		if (autoFail) {
			const fail = loc("op.conditionAutoFail") || "Falha";
			label = label ? `${label} · ${fail}` : fail;
		}
		skills[skill] = penaltyEntry({ dice, label, tooltip: sources.join(" · "), autoFail });
	}

	const defense = penaltyEntry({
		value: mods.defense,
		label: formatNumericPenaltyLabel(mods.defense),
		tooltip: sourceNames(statusIds, (id) => mergeConditionModifiers([id]).defense < 0).join(" · "),
	});

	let deslocLabel = "";
	if (mods.deslocZero) deslocLabel = loc("op.conditionDeslocZero") || "0m";
	else if (mods.deslocFixed != null) deslocLabel = `${String(mods.deslocFixed).replace(".", ",")}m`;
	else if (mods.deslocHalf) deslocLabel = loc("op.conditionDeslocHalf") || "½";

	const desloc = {
		affected: Boolean(deslocLabel),
		label: deslocLabel,
		tooltip: sourceNames(statusIds, (id) => {
			const one = mergeConditionModifiers([id]);
			return one.deslocZero || one.deslocHalf || one.deslocFixed != null;
		}).join(" · "),
		zero: mods.deslocZero,
		half: mods.deslocHalf,
		fixed: mods.deslocFixed,
	};

	const peCost = {
		extra: mods.peCostExtra,
		affected: mods.peCostExtra > 0,
		label: formatPeCostLabel(mods.peCostExtra),
		tooltip: sourceNames(statusIds, (id) => mergeConditionModifiers([id]).peCostExtra > 0).join(" · "),
	};

	const meleeDice = getConditionDicePenalty(actor, { skill: "fighting", isAttack: true, isMelee: true });
	const rangedDice = getConditionDicePenalty(actor, { skill: "aim", isAttack: true, isMelee: false });
	let attackLabel = "";
	if (meleeDice && meleeDice === rangedDice) attackLabel = formatDicePenaltyLabel(meleeDice);
	else {
		const parts = [];
		if (meleeDice) {
			parts.push(`${loc("op.conditionMeleeShort") || "CdC"} ${formatDicePenaltyLabel(meleeDice)}`);
		}
		if (rangedDice) {
			parts.push(`${loc("op.conditionRangedShort") || "Dist."} ${formatDicePenaltyLabel(rangedDice)}`);
		}
		attackLabel = parts.join(" / ");
	}

	const attacks = {
		melee: meleeDice,
		ranged: rangedDice,
		affected: meleeDice < 0 || rangedDice < 0,
		label: attackLabel,
		tooltip: sourceNames(statusIds, (id) => {
			const one = actorWithOnly(id);
			return (
				getConditionDicePenalty(one, { skill: "fighting", isAttack: true, isMelee: true }) < 0 ||
				getConditionDicePenalty(one, { skill: "aim", isAttack: true, isMelee: false }) < 0
			);
		}).join(" · "),
	};

	return {
		hasAny: conditions.length > 0,
		conditions,
		attributes,
		skills,
		defense,
		dodge: defense,
		desloc,
		peCost,
		attacks,
		autoFailReflexes: mods.autoFailReflexes,
	};
}

/**
 * @param {number} currentDesloc
 * @param {typeof EMPTY_MODS} mods
 * @returns {number}
 */
export function applyConditionDesloc(currentDesloc, mods) {
	let value = Number(currentDesloc) || 0;
	if (mods.deslocZero) return 0;
	if (mods.deslocHalf) value = halfDeslocMeters(value);
	if (mods.deslocFixed != null) value = Math.min(value, mods.deslocFixed);
	return value;
}

/**
 * If the actor already has this condition, upgrade it (Fatigado → Exausto, etc.).
 * @param {string[]} existingIds
 * @param {string} incomingId
 * @returns {{ applyId: string, removeIds: string[] }|null}
 */
export function resolveConditionApplication(existingIds, incomingId) {
	if (!incomingId) return null;
	const have = new Set(existingIds ?? []);
	const spec = CONDITION_EFFECTS[incomingId];
	const upgrade = spec?.upgrade;

	if (have.has(incomingId) && upgrade) {
		return { applyId: upgrade, removeIds: [incomingId] };
	}
	if (have.has(incomingId)) {
		return { applyId: incomingId, removeIds: [] };
	}

	const worseThan = Object.entries(CONDITION_EFFECTS)
		.filter(([, data]) => data.upgrade === incomingId)
		.map(([id]) => id);
	if (worseThan.some((id) => have.has(id)) && have.has(incomingId)) {
		return { applyId: incomingId, removeIds: [] };
	}

	let cursor = incomingId;
	const seen = new Set();
	while (cursor && !seen.has(cursor)) {
		seen.add(cursor);
		const next = CONDITION_EFFECTS[cursor]?.upgrade;
		if (next && have.has(next)) {
			return { applyId: next, removeIds: [] };
		}
		cursor = next;
	}

	return { applyId: incomingId, removeIds: [] };
}

/**
 * @param {string} statusId
 * @param {object} [options]
 * @returns {object|null}
 */
export function buildConditionActiveEffectData(statusId, options = {}) {
	const name = game.i18n.localize(`op.condition.${statusId}`);
	const description = game.i18n.localize(`op.condition.desc.${statusId}`);
	const img = options.img ?? "icons/svg/aura.svg";
	const duration = options.duration ?? {};
	return {
		name,
		img,
		icon: img,
		statuses: [statusId],
		description,
		origin: options.origin ?? "",
		disabled: false,
		duration: {
			rounds: duration.rounds ?? null,
			seconds: duration.seconds ?? null,
		},
		flags: {
			ordemparanormal: {
				ritualCondition: Boolean(options.ritualName),
				conditionEffect: true,
				statusId,
				ritualName: options.ritualName ?? "",
			},
		},
	};
}

/**
 * @param {Actor} actor
 * @param {string} statusId
 */
export async function removeActorStatus(actor, statusId) {
	if (!actor || !statusId) return;
	const ids = (actor.effects ?? [])
		.filter((effect) => {
			if (effect.flags?.ordemparanormal?.statusId === statusId) return true;
			const statuses = effect.statuses;
			if (!statuses) return false;
			if (typeof statuses.has === "function") return statuses.has(statusId);
			return Array.from(statuses).includes(statusId);
		})
		.map((effect) => effect.id);
	if (ids.length) await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
}

/**
 * Recurring condition effects at the start of a combatant's turn.
 * @param {Actor} actor
 */
export async function applyConditionStartOfTurn(actor) {
	if (!actor) return;
	const mods = getActorConditionModifiers(actor);

	if (mods.startOfTurn.includes("em-chamas")) {
		const roll = await new Roll("1d6").evaluate();
		await actor.applyDamage(roll.total, { damageType: "fireDamage" });
		await ChatMessage.create({
			speaker: ChatMessage.getSpeaker({ actor }),
			flavor: game.i18n.localize("op.condition.em-chamas"),
			content: game.i18n.format("op.conditionTurnEmChamas", {
				target: actor.name,
				damage: roll.total,
			}),
			rolls: [roll],
		});
	}

	if (mods.startOfTurn.includes("sangrando")) {
		let passed = false;
		if (actor.system.skills?.resilience && typeof actor.rollSkill === "function") {
			const rolls = await actor.rollSkill(
				{ skill: "resilience", rolls: [{ options: { target: 20 } }] },
				{ configure: false },
				{
					create: true,
					flavor: game.i18n.format("op.conditionTurnSangrandoTest", { target: actor.name }),
				}
			);
			passed = Boolean(rolls?.[0]?.isSuccess);
		}
		if (passed) {
			await removeActorStatus(actor, "sangrando");
			await ChatMessage.create({
				speaker: ChatMessage.getSpeaker({ actor }),
				content: game.i18n.format("op.conditionTurnSangrandoStabilize", { target: actor.name }),
			});
		} else {
			const roll = await new Roll("1d6").evaluate();
			await actor.applyDamage(roll.total, { ignoreRD: true });
			await ChatMessage.create({
				speaker: ChatMessage.getSpeaker({ actor }),
				content: game.i18n.format("op.conditionTurnSangrandoDamage", {
					target: actor.name,
					damage: roll.total,
				}),
				rolls: [roll],
			});
		}
	}
}
