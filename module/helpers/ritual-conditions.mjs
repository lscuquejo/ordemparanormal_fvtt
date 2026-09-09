import {
	buildConditionActiveEffectData,
	getActorStatusIds,
	resolveConditionApplication,
} from "./condition-effects.mjs";
import { extractTierEnhancementSnippet } from "./ritual-zones.mjs";
import { getRitualSourceId } from "./ritual-enchantments.mjs";
import { ritualDurationToEffectDuration } from "./ritual-helpers.mjs";

/** Rituals whose mention of a condition is not the immediate apply-on-target effect. */
const SKIP_AUTO_CONDITIONS = new Set([
	"convocar-o-algoz",
	"mergulho-mental",
	"esconder-dos-olhos",
	"teletransporte",
	"videncia",
	"luz",
	"corpo-adaptado",
	"medo-tangivel",
]);

/**
 * Canonical Ordem Paranormal condition ids (journal names, unaccented).
 * Longer phrases first so "em chamas" wins over a partial match.
 * @type {readonly { id: string, names: string[], img: string }[]}
 */
export const OP_CONDITIONS = [
	{ id: "em-chamas", names: ["em chamas"], img: "icons/svg/fire.svg" },
	{ id: "enlouquecendo", names: ["enlouquecendo"], img: "icons/svg/terror.svg" },
	{ id: "desprevenido", names: ["desprevenido", "desprevenida"], img: "icons/svg/eye.svg" },
	{ id: "inconsciente", names: ["inconsciente"], img: "icons/svg/unconscious.svg" },
	{ id: "paralisado", names: ["paralisado", "paralisada"], img: "icons/svg/net.svg" },
	{ id: "petrificado", names: ["petrificado", "petrificada"], img: "icons/svg/statue.svg" },
	{ id: "envenenado", names: ["envenenado", "envenenada"], img: "icons/svg/poison.svg" },
	{ id: "perturbado", names: ["perturbado", "perturbada"], img: "icons/svg/daze.svg" },
	{ id: "alquebrado", names: ["alquebrado", "alquebrada"], img: "icons/svg/degen.svg" },
	{ id: "apavorado", names: ["apavorado", "apavorada"], img: "icons/svg/terror.svg" },
	{ id: "asfixiado", names: ["asfixiado", "asfixiada"], img: "icons/svg/drowning.svg" },
	{ id: "atordoado", names: ["atordoado", "atordoada"], img: "icons/svg/stoned.svg" },
	{ id: "debilitado", names: ["debilitado", "debilitada"], img: "icons/svg/downgrade.svg" },
	{ id: "esmorecido", names: ["esmorecido", "esmorecida"], img: "icons/svg/sleep.svg" },
	{ id: "fascinado", names: ["fascinado", "fascinada"], img: "icons/svg/sun.svg" },
	{ id: "fatigado", names: ["fatigado", "fatigada"], img: "icons/svg/downgrade.svg" },
	{ id: "frustrado", names: ["frustrado", "frustrada"], img: "icons/svg/daze.svg" },
	{ id: "agarrado", names: ["agarrado", "agarrada"], img: "icons/svg/padlock.svg" },
	{ id: "enredado", names: ["enredado", "enredada"], img: "icons/svg/net.svg" },
	{ id: "ofuscado", names: ["ofuscado", "ofuscada"], img: "icons/svg/sun.svg" },
	{ id: "sangrando", names: ["sangrando", "hemorragia"], img: "icons/svg/blood.svg" },
	{ id: "vulneravel", names: ["vulneravel", "vulnerável"], img: "icons/svg/target.svg" },
	{ id: "exausto", names: ["exausto", "exausta"], img: "icons/svg/unconscious.svg" },
	{ id: "enjoado", names: ["enjoado", "enjoada"], img: "icons/svg/poison.svg" },
	{ id: "abalado", names: ["abalado", "abalada"], img: "icons/svg/terror.svg" },
	{ id: "confuso", names: ["confuso", "confusa"], img: "icons/svg/daze.svg" },
	{ id: "machucado", names: ["machucado", "machucada"], img: "icons/svg/blood.svg" },
	{ id: "morrendo", names: ["morrendo"], img: "icons/svg/skull.svg" },
	{ id: "indefeso", names: ["indefeso", "indefesa"], img: "icons/svg/falling.svg" },
	{ id: "pasmo", names: ["pasmo", "pasma"], img: "icons/svg/daze.svg" },
	{ id: "fraco", names: ["fraco", "fraca"], img: "icons/svg/downgrade.svg" },
	{ id: "lento", names: ["lento", "lenta"], img: "icons/svg/wingfoot.svg" },
	{ id: "surdo", names: ["surdo", "surda"], img: "icons/svg/sound-off.svg" },
	{ id: "cego", names: ["cego", "cega"], img: "icons/svg/blind.svg" },
	{ id: "doente", names: ["doente"], img: "icons/svg/poison.svg" },
	{ id: "caido", names: ["caido", "caído", "caida", "caída"], img: "icons/svg/falling.svg" },
];

/**
 * Foundry status-effect entries for the token HUD.
 * @returns {object[]}
 */
export function getOpStatusEffects() {
	return OP_CONDITIONS.map((entry) => ({
		id: entry.id,
		name: `op.condition.${entry.id}`,
		img: entry.img,
		icon: entry.img,
		description: game.i18n?.localize?.(`op.condition.desc.${entry.id}`) ?? "",
	}));
}

/**
 * Merge OP conditions into CONFIG.statusEffects without duplicating ids.
 */
export function registerOpStatusEffects() {
	const existing = CONFIG.statusEffects ?? [];
	const ours = getOpStatusEffects().filter((entry) => !existing.some((effect) => effect.id === entry.id));
	CONFIG.statusEffects = [...existing, ...ours];
}

/**
 * @param {string} text
 * @returns {string}
 */
function stripHtml(text) {
	return String(text ?? "")
		.replace(/<[^>]+>/g, " ")
		.replace(/&quot;/g, '"')
		.replace(/&amp;/g, "&")
		.replace(/\s+/g, " ")
		.trim();
}

/**
 * @param {string} text
 * @returns {string}
 */
function normalize(text) {
	return stripHtml(text)
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase();
}

/**
 * @param {string} text
 * @returns {string[]}
 */
export function extractConditionIds(text) {
	const norm = normalize(text);
	if (!norm) return [];
	const ids = [];
	for (const entry of OP_CONDITIONS) {
		for (const name of entry.names) {
			const needle = normalize(name);
			if (!needle) continue;
			const applied = new RegExp(
				`(?:fica(?:m|ra)?|ficara|deixando-[oa]|tornando-[oa]|com uma |fica com )\\s+${needle}\\b`
			);
			const bareFica = new RegExp(`\\bfica(?:m)?\\s+${needle}\\b`);
			if (applied.test(norm) || bareFica.test(norm) || (entry.id === "sangrando" && /hemorragia/.test(norm))) {
				ids.push(entry.id);
				break;
			}
		}
	}
	return [...new Set(ids)];
}

/**
 * @param {string} text
 * @returns {{ fail: string, pass: string }}
 */
export function splitResistanceClauses(text) {
	const source = stripHtml(text);
	const parts = source.split(
		/se passar(?:em)?(?: no teste)?(?: de (?:resistencia|resistência|vontade|fortitude|reflexos))?/i
	);
	return {
		fail: parts[0] ?? source,
		pass: parts.slice(1).join(" "),
	};
}

/**
 * @param {string} text
 * @param {string} [ritualDuration]
 * @returns {{ rounds: number|null, seconds: number|null }}
 */
export function parseConditionDuration(text, ritualDuration = "") {
	const norm = normalize(text);
	if (/por uma rodada|por 1 rodada|pela rodada|por uma unica rodada/.test(norm)) {
		return { rounds: 1, seconds: null };
	}
	if (ritualDuration === "instantaneous") return { rounds: 1, seconds: null };
	return ritualDurationToEffectDuration(ritualDuration);
}

/**
 * @param {Item} ritualItem
 * @param {object} tier
 * @returns {{ fail: string[], pass: string[], duration: { rounds: number|null, seconds: number|null } }}
 */
export function getRitualConditionSpec(ritualItem, tier) {
	const ritualId = getRitualSourceId(ritualItem);
	if (SKIP_AUTO_CONDITIONS.has(ritualId)) {
		return { fail: [], pass: [], duration: { rounds: null, seconds: null } };
	}

	// Perturbação: base/verdadeiro are command + Will only (player narrates).
	// Discente "Sofra" applies damage + Abalado for 1 round. Do not parse mode text ("fica pasmo").
	if (ritualId === "perturbacao") {
		if (tier?.key === "discente") {
			return { fail: ["abalado"], pass: [], duration: { rounds: 1, seconds: null } };
		}
		return { fail: [], pass: [], duration: { rounds: null, seconds: null } };
	}

	const description = ritualItem.system?.description ?? "";
	const snippet = extractTierEnhancementSnippet(description, tier);
	const useSnippet = Boolean(snippet && /fica|em vez do normal|em vez da|deixando-/i.test(snippet));
	const source = useSnippet
		? snippet
		: stripHtml(description.split(/<p><strong>Aprimoramentos<\/strong>/i)[0] ?? description);

	const { fail, pass } = splitResistanceClauses(source);
	const failIds = extractConditionIds(fail);
	let passIds = [];
	if (pass) {
		const passNorm = normalize(pass);
		if (/evita a condi|nao fica|nao ficam|nao sofre a condi/.test(passNorm)) {
			passIds = [];
		} else {
			passIds = extractConditionIds(pass);
		}
	}

	return {
		fail: failIds,
		pass: passIds,
		duration: parseConditionDuration(source, ritualItem.system?.duration),
	};
}

/**
 * Rituals where a failed resistance only prompts narrative (no ActiveEffect / auto condition).
 * @param {string} ritualId
 * @param {string} tierKey
 * @returns {boolean}
 */
export function isNarrativeResistanceRitual(ritualId, tierKey) {
	return ritualId === "perturbacao" && tierKey !== "discente";
}

/**
 * @param {{ fail?: string[], pass?: string[] }|null|undefined} spec
 * @param {boolean} passed
 * @returns {string[]}
 */
export function resolveRitualConditions(spec, passed) {
	if (!spec) return [];
	if (passed) return spec.pass ?? [];
	return spec.fail ?? [];
}

/**
 * @param {string} statusId
 * @returns {object|null}
 */
export function getConditionDefinition(statusId) {
	const entry = OP_CONDITIONS.find((item) => item.id === statusId);
	if (!entry) return null;
	const name = game.i18n?.localize?.(`op.condition.${entry.id}`) ?? entry.names[0];
	const description = game.i18n?.localize?.(`op.condition.desc.${entry.id}`) ?? "";
	return { ...entry, name, description };
}

/**
 * Apply named OP status conditions to an actor (token HUD + ActiveEffect).
 * @param {Actor} actor
 * @param {string[]} statusIds
 * @param {object} [options]
 * @returns {Promise<string[]>}
 */
export async function applyRitualStatusConditions(actor, statusIds, options = {}) {
	const ids = [...new Set((statusIds ?? []).filter(Boolean))];
	if (!actor || !ids.length) return [];

	const applied = [];
	for (const statusId of ids) {
		const def = getConditionDefinition(statusId);
		if (!def) continue;

		const existingIds = getActorStatusIds(actor);
		const resolution = resolveConditionApplication(existingIds, statusId);
		if (!resolution) continue;

		for (const removeId of resolution.removeIds) {
			const toRemove = actor.effects?.filter((effect) => {
				const statuses = effect.statuses;
				if (!statuses) return effect.flags?.ordemparanormal?.statusId === removeId;
				if (typeof statuses.has === "function") return statuses.has(removeId);
				return Array.from(statuses).includes(removeId);
			});
			if (toRemove?.length) {
				await actor.deleteEmbeddedDocuments(
					"ActiveEffect",
					toRemove.map((effect) => effect.id)
				);
			}
		}

		const applyId = resolution.applyId;
		const applyDef = getConditionDefinition(applyId) ?? def;
		const hasStatus = getActorStatusIds(actor).includes(applyId);
		if (hasStatus) {
			applied.push(applyId);
			continue;
		}

		await actor.createEmbeddedDocuments("ActiveEffect", [
			buildConditionActiveEffectData(applyId, {
				img: applyDef.img,
				origin: options.origin,
				ritualName: options.ritualName,
				duration: options.duration,
			}),
		]);
		applied.push(applyId);
	}

	return applied;
}

/**
 * @param {string[]} statusIds
 * @returns {string}
 */
export function formatConditionList(statusIds) {
	return (statusIds ?? []).map((id) => game.i18n.localize(`op.condition.${id}`)).join(", ");
}
