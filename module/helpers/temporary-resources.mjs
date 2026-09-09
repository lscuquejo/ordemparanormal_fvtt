/** @typedef {"PV"|"SAN"|"PE"|"PD"} TemporaryResourceKey */

export const TEMPORARY_RESOURCE_KEYS = new Set(["PV", "SAN", "PE", "PD"]);

/**
 * Temporary resources do not stack — keep the highest value.
 * @param {number} current
 * @param {number} incoming
 * @returns {number}
 */
export function resolveTemporaryResourceAmount(current, incoming) {
	const currentValue = Math.max(0, Number(current) || 0);
	const incomingValue = Math.max(0, Number(incoming) || 0);
	return Math.max(currentValue, incomingValue);
}

/**
 * @param {number} current
 * @param {number} incoming
 * @returns {boolean}
 */
export function shouldReplaceTemporaryResource(current, incoming) {
	return resolveTemporaryResourceAmount(current, incoming) > Math.max(0, Number(current) || 0);
}

/**
 * @param {ActiveEffect} effect
 * @returns {TemporaryResourceKey|null}
 */
export function getTemporaryResourceKeyFromEffect(effect) {
	const key = effect?.getFlag?.("ordemparanormal", "temporaryResource");
	if (!key || !TEMPORARY_RESOURCE_KEYS.has(String(key).toUpperCase())) return null;
	return String(key).toUpperCase();
}

/**
 * @param {Actor} actor
 * @param {TemporaryResourceKey} resourceKey
 * @returns {ActiveEffect[]}
 */
export function findTemporaryResourceEffects(actor, resourceKey) {
	const key = String(resourceKey).toUpperCase();
	const path = `system.${key}.temp`;
	return (actor?.effects ?? []).filter((effect) => {
		if (getTemporaryResourceKeyFromEffect(effect) === key) return true;
		return effect.changes?.some((change) => change.key === path);
	});
}
