const DAMAGE_TYPE_MAP = {
	fogo: "fireDamage",
	eletricidade: "eletricDamage",
	frio: "coldDamage",
	quimico: "chemicalDamage",
	mental: "mentalDamage",
	energia: "energyDamage",
	sangue: "bloodDamage",
	morte: "deathDamage",
	conhecimento: "knowledgeDamage",
	medo: "fearDamage",
	corte: "cuttingDamage",
	impacto: "impactDamage",
	perfurante: "piercingDamage",
	balistico: "ballisticDamage",
};

const ELEMENT_DAMAGE_MAP = {
	blood: "bloodDamage",
	death: "deathDamage",
	knowledge: "knowledgeDamage",
	energy: "energyDamage",
	fear: "fearDamage",
};

/**
 * @param {string|null|undefined} raw
 * @param {string[]} [elements]
 * @returns {string}
 */
export function mapRitualDamageType(raw, elements = []) {
	if (!raw) {
		const element = elements[0]?.toLowerCase?.() ?? elements[0];
		return ELEMENT_DAMAGE_MAP[element] ?? "";
	}
	const key = String(raw)
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase();
	if (DAMAGE_TYPE_MAP[key]) return DAMAGE_TYPE_MAP[key];
	if (key.includes("elemento") && elements.length === 1) {
		const element = elements[0]
			.normalize("NFD")
			.replace(/[\u0300-\u036f]/g, "")
			.toLowerCase();
		return DAMAGE_TYPE_MAP[element] ?? ELEMENT_DAMAGE_MAP[elements[0]] ?? "";
	}
	return "";
}

/**
 * @param {string|null|undefined} duration
 * @returns {{ rounds: number|null, seconds: number|null }}
 */
export function ritualDurationToEffectDuration(duration) {
	if (!duration) return { rounds: null, seconds: null };
	if (duration === "scene") return { rounds: null, seconds: 3600 };
	if (duration === "sustained") return { rounds: null, seconds: 7200 };
	if (duration === "instantaneous") return { rounds: 0, seconds: null };
	if (duration === "setDuration") return { rounds: 10, seconds: null };
	if (duration === "permanent") return { rounds: null, seconds: null };
	return { rounds: null, seconds: 1800 };
}

/**
 * @param {object} item
 * @returns {Promise<object|null>}
 */
export async function promptRitualTier(item) {
	const tiers = item.getRitualTiers?.() ?? [];
	if (!tiers.length) return null;
	if (tiers.length === 1) return tiers[0];

	try {
		// Callback returns the full tier so upcast keys cannot be lost.
		const chosen = await foundry.applications.api.DialogV2.wait({
			window: { title: game.i18n.format("op.ritualTierPromptTitle", { name: item.name }) },
			content: `<p>${game.i18n.localize("op.ritualTierPromptHint")}</p>`,
			buttons: tiers.map((tier) => ({
				action: tier.key,
				label: `${tier.label} — ${tier.peCost} PE${tier.formula ? ` (${tier.formula})` : ""}`,
				callback: () => tier,
			})),
			rejectClose: false,
		});
		return chosen ?? null;
	} catch {
		return null;
	}
}

const CICATRIZATION_ID = "cicatrizacao";

/**
 * Strip accents and punctuation so "Cicatrização" matches the ritual id.
 * @param {string} value
 * @returns {string}
 */
export function slugifyRitualName(value) {
	return String(value ?? "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "");
}

/**
 * Cicatrização ages the target by 1 year when healing is applied.
 * @param {{ ritualId?: string, ritualName?: string }} [healTarget]
 * @returns {number}
 */
export function ritualHealAgeYears(healTarget = {}) {
	const id = slugifyRitualName(healTarget.ritualId);
	if (id === CICATRIZATION_ID) return 1;
	if (slugifyRitualName(healTarget.ritualName) === CICATRIZATION_ID) return 1;
	return 0;
}

function normalizeTierText(text) {
	return String(text ?? "")
		.replace(/&quot;/gi, '"')
		.replace(/<[^>]+>/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function extractTierSnippet(description, tier) {
	if (!description || !tier?.label || tier.key === "base") return "";
	const label = String(tier.label).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const regex = new RegExp(
		`(?:^|\\n|<li[^>]*>)\\s*(?:<strong>)?${label}[^:]*:?([\\s\\S]*?)(?=<\\/li>|\\n\\s*(?:<li|<p><strong>|$))`,
		"i"
	);
	return description.match(regex)?.[1] ?? "";
}

function mergeDiscenteDefaults(description, tier, snippet) {
	if (tier?.key !== "verdadeiro") return snippet;
	const normalized = slugifyRitualName(normalizeTierText(snippet));
	if (!normalized.includes("comoemdiscente")) return snippet;
	const discenteSnippet = extractTierSnippet(description, { key: "discente", label: "Discente" });
	return `${discenteSnippet} ${snippet}`.trim();
}

function mapRangeTextToKey(rangeText, fallback = "") {
	const text = slugifyRitualName(rangeText);
	if (!text) return fallback;
	if (["pessoal", "voce"].includes(text)) return "personal";
	if (text.startsWith("toque")) return "touch";
	if (text.startsWith("curto")) return "short";
	if (text.startsWith("medio")) return "medium";
	if (text.startsWith("longo")) return "long";
	if (text.startsWith("extremo")) return "extreme";
	if (text.startsWith("ilimitado")) return "unlimited";
	return fallback;
}

/**
 * Resolve tier-specific targeting overrides from enhancement text.
 * Example: Distorcer Aparência discente changes range to short and target to 1 being.
 * @param {Item} ritualItem
 * @param {object} tier
 * @returns {{ range: string, targetText: string, requiresTargetSelection: boolean, selfOnly: boolean }}
 */
export function getTierTargetingData(ritualItem, tier) {
	const baseRange = String(ritualItem?.system?.range ?? "");
	const baseTargetRaw = String(ritualItem?.system?.targetQtd ?? ritualItem?.system?.target ?? "");
	const rawDescription = ritualItem?.system?.description ?? "";
	const snippet = normalizeTierText(
		mergeDiscenteDefaults(rawDescription, tier, extractTierSnippet(rawDescription, tier))
	);

	let range = baseRange;
	const rangeMatch = snippet.match(/muda o alcance para\s*["“]?([^"”.]+)["”]?/i);
	if (rangeMatch?.[1]) range = mapRangeTextToKey(rangeMatch[1], baseRange);

	let targetText = baseTargetRaw;
	const targetMatch = snippet.match(/muda o alvo para\s*["“]?([^"”.,]+(?:\s+[^"”.,]+)*)["”]?/i);
	if (targetMatch?.[1]) {
		targetText = targetMatch[1];
	} else if (/seres escolhidos/i.test(snippet)) {
		targetText = "seres escolhidos";
	} else if (/\b(?:1|um)\s+ser\b/i.test(snippet)) {
		targetText = "1 ser";
	}

	const targetNorm = slugifyRitualName(targetText);
	const selfOnly = range === "personal" || ["voce", "si", "pessoal"].includes(targetNorm);
	const requiresTargetSelection = !selfOnly && /(ser|sers|seres|criatura|criaturas|alvo|alvos)/i.test(targetText || "");

	return { range, targetText, requiresTargetSelection, selfOnly };
}
