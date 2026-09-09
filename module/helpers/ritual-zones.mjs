import { getRitualSourceId } from "./ritual-enchantments.mjs";
import { ritualDurationToEffectDuration } from "./ritual-helpers.mjs";

const AREA_SHAPE_RE =
	/área|area|esfera|explos[aã]o|nuvem|emana[cç][aã]o|c[ií]rculo|cilindro|linha de|explos[aã]o com|ilus[aã]o|cubos?/i;

/**
 * @param {string} description
 * @param {object} tier
 * @returns {string}
 */
export function extractTierEnhancementSnippet(description, tier) {
	if (!description || !tier?.label) return "";
	const label = String(tier.label).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const re = new RegExp(`<strong>\\s*${label}[^<]*:?\\s*</strong>\\s*:?\\s*([^<]+)`, "i");
	return description.match(re)?.[1]?.trim() ?? "";
}

/**
 * @param {Item} ritualItem
 * @param {object} [tier]
 * @returns {string}
 */
export function getRitualAreaText(ritualItem, tier = null) {
	const sys = ritualItem.system ?? {};
	const parts = [sys.area?.size, sys.area?.name];

	if (tier?.key && tier.key !== "base") {
		const snippet = extractTierEnhancementSnippet(sys.description, tier);
		if (snippet) parts.push(snippet);
	} else {
		const areaHeader = sys.description?.match(/<strong>Área:<\/strong>\s*([^<\n]+)/i)?.[1];
		if (areaHeader) parts.push(areaHeader.trim());
		const effectHeader = sys.description?.match(/<strong>Efeito:<\/strong>\s*([^<\n]+)/i)?.[1];
		if (effectHeader) parts.push(effectHeader.trim());
		const intro = sys.description?.split(/<p><strong>Aprimoramentos<\/strong>/i)[0] ?? "";
		if (intro && AREA_SHAPE_RE.test(intro)) parts.push(intro);
	}

	if (sys.target === "area" || (sys.target && AREA_SHAPE_RE.test(String(sys.target)))) {
		parts.push(sys.target);
	}
	return parts.filter(Boolean).join(" ");
}

/**
 * @param {Item} ritualItem
 * @returns {number}
 */
export function parseRitualAreaRadiusMeters(ritualItem, tier = null) {
	return parseRitualAreaSpec(ritualItem, tier).distanceMeters;
}

/**
 * @param {Item} ritualItem
 * @param {object} [tier]
 * @returns {{ type: string, distanceMeters: number, widthMeters: number, centeredOnCaster: boolean, excludeCaster: boolean }}
 */
export function parseRitualAreaSpec(ritualItem, tier = null) {
	const text = getRitualAreaText(ritualItem, tier);
	const lineMatch = text.match(/linha(?:\s+de)?\s+(\d+(?:[.,]\d+)?)\s*m/i);
	const cubeMatch = text.match(/(\d+)\s*cubos?\s*(?:de\s*)?(\d+(?:[.,]\d+)?)\s*m/i);
	const radiusMatch = text.match(/(\d+(?:[.,]\d+)?)\s*m(?:etros?)?(?:\s+de\s+raio|\s+radius)?/i);

	let type = "circle";
	let distanceMeters = 6;
	if (lineMatch) {
		type = "ray";
		distanceMeters = Number(lineMatch[1].replace(",", ".")) || 30;
	} else if (cubeMatch) {
		// "até N cubos de 1,5m" → bounding square side ≈ ceil(√N) × cube size
		type = "rect";
		const cubes = Number(cubeMatch[1]) || 4;
		const cubeSize = Number(cubeMatch[2].replace(",", ".")) || 1.5;
		distanceMeters = Math.ceil(Math.sqrt(cubes)) * cubeSize;
	} else if (/cone/i.test(text)) {
		type = "cone";
		distanceMeters = radiusMatch ? Number(radiusMatch[1].replace(",", ".")) || 6 : 6;
	} else if (radiusMatch) {
		distanceMeters = Number(radiusMatch[1].replace(",", ".")) || 6;
	}

	const centeredOnCaster =
		/centrad[oa]\s+em\s+você|emana[cç][aã]o|explos[aã]o/i.test(text) ||
		(ritualItem.system?.range === "personal" && type === "circle");

	const description = ritualItem.system?.description ?? "";
	const excludeCaster = /você não é afetad|voce nao e afetad|não sofre|nao sofre|não é afetad/i.test(description);

	return { type, distanceMeters, widthMeters: 0, centeredOnCaster, excludeCaster };
}

/**
 * @param {Item} ritualItem
 * @param {object} tier
 * @returns {boolean}
 */
export function ritualTierUsesArea(ritualItem, tier) {
	if (ritualItem.system?.target === "area") return true;
	return AREA_SHAPE_RE.test(getRitualAreaText(ritualItem, tier));
}

const PERSISTENT_ZONE_DURATIONS = new Set(["scene", "sustained", "setDuration", "permanent"]);

/**
 * Non-damage lasting areas (Nuvem de Cinzas, Tecer Ilusão, Cinerária-like zones).
 * Instantaneous damage AoEs keep the formula-targeting path instead.
 * @param {Item} ritualItem
 * @param {object} tier
 * @returns {boolean}
 */
export function ritualTierPlacesPersistentZone(ritualItem, tier) {
	if (!ritualTierUsesArea(ritualItem, tier)) return false;
	const duration = ritualItem.system?.duration ?? "";
	if (!PERSISTENT_ZONE_DURATIONS.has(duration)) return false;
	// Instant damage bursts are never "persistent zones" even if mis-tagged.
	if (duration === "instantaneous") return false;
	return true;
}

/**
 * Label for the sheet Alvo/Área column — prefers creature targets, else area/effect text.
 * @param {Item|object} ritualItem
 * @returns {string}
 */
export function getRitualSheetTargetLabel(ritualItem) {
	const sys = ritualItem?.system ?? {};
	if (sys.area?.name) return String(sys.area.name);
	if (sys.target && sys.target !== "area") {
		const qtd = sys.targetQtd ? `${sys.targetQtd} ` : "";
		const key = `op.targetChoices.${sys.target}`;
		const localized = globalThis.game?.i18n?.localize?.(key);
		const label = localized && localized !== key ? localized : sys.target;
		return `${qtd}${label}`.trim();
	}
	if (sys.area?.size) {
		const name = sys.area?.type || "área";
		return `${name} ${sys.area.size}m`;
	}
	const effectHeader = sys.description?.match(/<strong>Efeito:<\/strong>\s*([^<\n]+)/i)?.[1];
	if (effectHeader) return effectHeader.trim();
	const areaHeader = sys.description?.match(/<strong>Área:<\/strong>\s*([^<\n]+)/i)?.[1];
	if (areaHeader) return areaHeader.trim();
	if (sys.target === "area") {
		const localized = globalThis.game?.i18n?.localize?.("op.targetChoices.area");
		return localized && localized !== "op.targetChoices.area" ? localized : "Área";
	}
	return "";
}

/**
 * Foundry MeasuredTemplate.distance is in **scene units** (meters for OP),
 * not grid squares. Do not divide by grid.distance.
 * @param {number} meters
 * @returns {number}
 */
export function ritualMetersToTemplateDistance(meters) {
	const value = Number(meters);
	return Number.isFinite(value) && value > 0 ? value : 6;
}

/**
 * Foundry ColorField rejects 8-digit #RRGGBBAA (treats as blank). Always use #RRGGBB.
 * @param {string} color
 * @param {string} [fallback]
 * @returns {string}
 */
export function normalizeHexColor(color, fallback = "#7c3aed") {
	const raw = String(color ?? "").trim();
	const m8 = raw.match(/^#([0-9a-f]{8})$/i);
	if (m8) return `#${m8[1].slice(0, 6)}`;
	const m6 = raw.match(/^#([0-9a-f]{6})$/i);
	if (m6) return `#${m6[1]}`;
	const m3 = raw.match(/^#([0-9a-f]{3})$/i);
	if (m3) return `#${[...m3[1]].map((c) => c + c).join("")}`;
	return fallback;
}

/**
 * @param {number} meters
 * @returns {number} canvas pixels
 */
export function metersToCanvasPixels(meters) {
	const m = Number(meters);
	const value = Number.isFinite(m) && m > 0 ? m : 6;
	if (canvas?.dimensions?.distancePixels) return value * canvas.dimensions.distancePixels;
	const gridDistance = canvas?.scene?.grid?.distance || 1;
	const size = canvas?.grid?.size || 100;
	return (value / gridDistance) * size;
}

/**
 * @returns {boolean}
 */
export function usesRegionPlacement() {
	return typeof canvas?.regions?.placeRegion === "function";
}

/**
 * @param {object} spec
 * @param {object} params
 * @returns {object}
 */
export function buildTemplateDataFromSpec(spec, { x, y, userId }) {
	const distance = ritualMetersToTemplateDistance(spec.distanceMeters);
	const data = {
		t: spec.type === "ray" ? "ray" : spec.type === "cone" ? "cone" : spec.type === "rect" ? "rect" : "circle",
		x,
		y,
		distance,
		direction: spec.direction ?? 0,
		angle: spec.type === "cone" ? 90 : 360,
		borderColor: normalizeHexColor(spec.borderColor ?? "#dc2626", "#dc2626"),
		fillColor: normalizeHexColor(spec.fillColor ?? "#ef4444", "#ef4444"),
	};
	// Foundry v12+ renamed MeasuredTemplate.user → author.
	if ((game.release?.generation ?? 12) >= 12) data.author = userId;
	else data.user = userId;

	if (spec.type === "ray") {
		data.width = ritualMetersToTemplateDistance(spec.widthMeters || canvas?.dimensions?.distance || 1.5);
	}

	return data;
}

/**
 * Build Region create/place data (Foundry v14+).
 * @param {object} spec
 * @param {{ x?: number, y?: number }} [origin]
 * @param {object} [flags]
 * @returns {object}
 */
export function buildRegionDataFromSpec(spec, { x = 0, y = 0 } = {}, flags = {}) {
	const color = normalizeHexColor(spec.fillColor || spec.borderColor, "#7c3aed");
	const ritualId = flags.ritualId || "ritual-area";
	const radiusPx = metersToCanvasPixels(spec.distanceMeters);
	let shapes;
	if (spec.type === "rect") {
		const side = metersToCanvasPixels(spec.distanceMeters);
		shapes = [{ type: "rectangle", x: x - side / 2, y: y - side / 2, width: side, height: side }];
	} else {
		shapes = [{ type: "circle", x, y, radius: radiusPx }];
	}

	const data = {
		name: String(ritualId),
		color,
		shapes,
		displayMeasurements: true,
		visibility: CONST.REGION_VISIBILITY?.ALWAYS ?? 2,
		flags: { ordemparanormal: buildRitualTemplateFlagPayload(flags) },
	};
	if (canvas?.level?.id) data.levels = [canvas.level.id];
	return data;
}

/**
 * Normalize placement flags (strip coordinate overrides used only for auto-place).
 * @param {object} [extraFlags]
 * @returns {{ ephemeral: boolean, ritualId: string, rest: object }}
 */
function normalizeTemplateFlags(extraFlags = {}) {
	const flags = { ...(extraFlags ?? {}) };
	delete flags.x;
	delete flags.y;
	const ephemeral = Boolean(flags.ephemeral);
	const ritualId = flags.ritualId ? String(flags.ritualId) : "";
	delete flags.ephemeral;
	delete flags.ritualId;
	return {
		ephemeral,
		ritualId,
		rest: flags,
	};
}

/**
 * Build the ordemparanormal flag payload for a ritual template.
 * @param {object} [extraFlags]
 * @returns {object}
 */
function buildRitualTemplateFlagPayload(extraFlags = {}) {
	const { ephemeral, ritualId, rest } = normalizeTemplateFlags(extraFlags);
	return {
		ritualAreaTemplate: true,
		ephemeral,
		...(ritualId ? { ritualId } : {}),
		...rest,
	};
}

/**
 * Persist ritual flags on a MeasuredTemplate. Prefer setFlag — nested
 * `flags: { ordemparanormal: {...} }` updates are unreliable on v13/v14 templates.
 * @param {MeasuredTemplateDocument} doc
 * @param {object} [extraFlags]
 */
async function flagRitualTemplate(doc, extraFlags = {}) {
	if (!doc) return;
	const payload = buildRitualTemplateFlagPayload(extraFlags);
	for (const [key, value] of Object.entries(payload)) {
		await doc.setFlag("ordemparanormal", key, value);
	}
}

/**
 * @param {object} spec
 * @param {object} point
 * @param {object} [flags]
 * @returns {Promise<Document|null>} Region (v14) or MeasuredTemplate (legacy)
 */
export async function placeRitualTemplateAtPoint(spec, { x, y }, flags = { ephemeral: true }) {
	if (!canvas?.ready || !canvas.scene) {
		ui.notifications.warn(game.i18n.localize("op.ritualNeedsCanvas"));
		return null;
	}

	if (usesRegionPlacement()) {
		const regionData = buildRegionDataFromSpec(spec, { x, y }, flags);
		const docs = await canvas.scene.createEmbeddedDocuments("Region", [regionData]);
		const doc = docs[0] ?? null;
		await flagRitualTemplate(doc, flags);
		return doc;
	}

	const templateData = buildTemplateDataFromSpec(spec, { x, y, userId: game.user.id });
	templateData.flags = { ordemparanormal: buildRitualTemplateFlagPayload(flags) };
	const docs = await canvas.scene.createEmbeddedDocuments("MeasuredTemplate", [templateData]);
	const doc = docs[0] ?? null;
	await flagRitualTemplate(doc, flags);
	return doc;
}

/**
 * Convert a browser pointer event into canvas world coordinates.
 * @param {PointerEvent|MouseEvent} event
 * @returns {{ x: number, y: number }|null}
 */
function clientEventToCanvasPoint(event) {
	if (typeof canvas.canvasCoordinatesFromClient === "function") {
		const pt = canvas.canvasCoordinatesFromClient({ x: event.clientX, y: event.clientY });
		if (pt && Number.isFinite(pt.x) && Number.isFinite(pt.y)) return pt;
	}
	const view = canvas.app?.view;
	if (!view) return canvas.mousePosition ?? null;
	const rect = view.getBoundingClientRect();
	const clientX = ((event.clientX - rect.left) / rect.width) * view.width;
	const clientY = ((event.clientY - rect.top) / rect.height) * view.height;
	if (typeof canvas.stage?.toLocal === "function") {
		const local = canvas.stage.toLocal({ x: clientX, y: clientY });
		if (local && Number.isFinite(local.x) && Number.isFinite(local.y)) return { x: local.x, y: local.y };
	}
	return canvas.mousePosition ?? null;
}

/**
 * Interactive placement that works on Foundry v13/v14 (PIXI Federated events are
 * unreliable on canvas.stage). Uses DOM listeners on the canvas element +
 * canvas.mousePosition, same idea as a manual "click to place" tool.
 * @param {object} templateData
 * @returns {Promise<MeasuredTemplateDocument|null>}
 */
async function placeTemplateWithPlaceablePreview(templateData) {
	const DocumentClass = CONFIG.MeasuredTemplate?.documentClass;
	const ObjectClass = CONFIG.MeasuredTemplate?.objectClass;
	if (!DocumentClass || !ObjectClass) {
		throw new Error("MeasuredTemplate placeable API unavailable");
	}

	const document = new DocumentClass(foundry.utils.deepClone(templateData), { parent: canvas.scene });
	const preview = new ObjectClass(document);
	const initialLayer = canvas.activeLayer;
	const layer = canvas.templates;
	const view = canvas.app?.view ?? canvas.elements?.board ?? document.getElementById("board");
	if (!view) throw new Error("Canvas view unavailable");

	await preview.draw?.();
	layer.activate();
	(layer.preview ?? layer).addChild?.(preview);
	if (!preview.parent && layer.preview) layer.preview.addChild(preview);

	return new Promise((resolve) => {
		let settled = false;
		let armed = false;
		let timeoutId = null;

		const armTimer = setTimeout(() => {
			armed = true;
		}, 250);

		const snapPoint = (point) => {
			if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
				return { x: document.x || 0, y: document.y || 0 };
			}
			if (typeof canvas.templates.getSnappedPoint === "function") {
				return canvas.templates.getSnappedPoint(point);
			}
			if (typeof canvas.grid.getSnappedPoint === "function") {
				try {
					return canvas.grid.getSnappedPoint(point, { mode: CONST.GRID_SNAPPING_MODES?.CENTER });
				} catch (_error) {
					return point;
				}
			}
			return point;
		};

		const refreshPreview = () => {
			if (preview.renderFlags?.set) {
				preview.renderFlags.set({ refreshPosition: true, refreshShape: true, refreshTemplate: true });
			} else {
				preview.refresh?.();
			}
		};

		const movePreviewTo = (point) => {
			const snapped = snapPoint(point);
			document.updateSource({ x: snapped.x, y: snapped.y });
			refreshPreview();
			return snapped;
		};

		const cleanup = () => {
			clearTimeout(armTimer);
			if (timeoutId != null) clearTimeout(timeoutId);
			view.removeEventListener("pointermove", onMove, true);
			view.removeEventListener("mousemove", onMove, true);
			view.removeEventListener("pointerdown", onConfirm, true);
			view.removeEventListener("mousedown", onConfirm, true);
			view.removeEventListener("contextmenu", onCancel, true);
			view.removeEventListener("wheel", onRotate, true);
			window.removeEventListener("keydown", onKey, true);
			try {
				preview.destroy?.({ children: true });
			} catch (_error) {
				/* already cleared */
			}
			try {
				layer.clearPreviewContainer?.();
			} catch (_error) {
				/* optional */
			}
			initialLayer?.activate?.();
		};

		const finish = (doc) => {
			if (settled) return;
			settled = true;
			cleanup();
			resolve(doc ?? null);
		};

		const onMove = (event) => {
			const pos = clientEventToCanvasPoint(event) ?? canvas.mousePosition;
			if (!pos) return;
			movePreviewTo(pos);
		};

		const onConfirm = async (event) => {
			if (!armed || settled) return;
			if (typeof event.button === "number" && event.button !== 0) return;
			event.preventDefault?.();
			event.stopPropagation?.();
			event.stopImmediatePropagation?.();
			settled = true;
			const pos = clientEventToCanvasPoint(event) ?? canvas.mousePosition ?? { x: document.x, y: document.y };
			const snapped = movePreviewTo(pos);
			cleanup();
			try {
				const data = foundry.utils.mergeObject(document.toObject(), { x: snapped.x, y: snapped.y }, { inplace: false });
				delete data._id;
				const created = await canvas.scene.createEmbeddedDocuments("MeasuredTemplate", [data]);
				resolve(created[0] ?? null);
			} catch (error) {
				console.error("Ordem Paranormal | template create failed:", error);
				ui.notifications.error(game.i18n.localize("op.ritualTemplateCreateFailed"));
				resolve(null);
			}
		};

		const onCancel = (event) => {
			event?.preventDefault?.();
			event?.stopPropagation?.();
			ui.notifications.info(game.i18n.localize("op.ritualTemplateCancelled"));
			finish(null);
		};

		const onKey = (event) => {
			if (event.key === "Escape") onCancel(event);
		};

		const onRotate = (event) => {
			if (document.t === "rect" || document.t === "circle") return;
			event.preventDefault?.();
			const delta = event.shiftKey ? 15 : 5;
			document.updateSource({ direction: document.direction + delta * Math.sign(event.deltaY || 1) });
			refreshPreview();
		};

		// Capture phase on the canvas DOM node — always receives clicks even when
		// PIXI stage interaction / active layer would swallow stage events.
		view.addEventListener("pointermove", onMove, true);
		view.addEventListener("mousemove", onMove, true);
		view.addEventListener("pointerdown", onConfirm, true);
		view.addEventListener("mousedown", onConfirm, true);
		view.addEventListener("contextmenu", onCancel, true);
		view.addEventListener("wheel", onRotate, { capture: true, passive: false });
		window.addEventListener("keydown", onKey, true);

		movePreviewTo(canvas.mousePosition ?? { x: templateData.x, y: templateData.y });

		timeoutId = setTimeout(() => {
			if (!settled) {
				ui.notifications.info(game.i18n.localize("op.ritualTemplateCancelled"));
				finish(null);
			}
		}, 120000);
	});
}

/**
 * Interactive template placement on the active scene.
 * Foundry v14+: Scene Regions via canvas.regions.placeRegion.
 * Older: MeasuredTemplate preview / click-to-place.
 * @param {object} spec
 * @param {object} [flags]
 * @returns {Promise<Document|null>}
 */
export async function placeRitualTemplateInteractive(spec, flags = { ephemeral: true }) {
	if (!canvas?.ready || !canvas.scene) {
		ui.notifications.warn(game.i18n.localize("op.ritualNeedsCanvas"));
		return null;
	}

	const { x: flagX, y: flagY, ...templateFlags } = flags ?? {};

	const testPoint = globalThis.__opRitualTemplateTestPoint;
	const autoPoint =
		Number.isFinite(flagX) && Number.isFinite(flagY)
			? { x: flagX, y: flagY }
			: testPoint && Number.isFinite(testPoint.x) && Number.isFinite(testPoint.y)
			? testPoint
			: null;
	if (autoPoint) {
		return placeRitualTemplateAtPoint(spec, autoPoint, templateFlags);
	}

	ui.notifications.info(game.i18n.localize("op.ritualTemplatePlaceHint"));

	// Foundry v14 — Regions replaced MeasuredTemplates.
	if (usesRegionPlacement()) {
		try {
			const regionData = buildRegionDataFromSpec(spec, { x: 0, y: 0 }, templateFlags);
			const doc = await canvas.regions.placeRegion(regionData, { create: true });
			if (doc) await flagRitualTemplate(doc, templateFlags);
			return doc ?? null;
		} catch (error) {
			console.error("Ordem Paranormal | region placement failed:", error);
			ui.notifications.error(game.i18n.localize("op.ritualTemplateCreateFailed"));
			return null;
		}
	}

	const mouse = canvas.mousePosition ?? {
		x: canvas.dimensions?.width / 2 || 0,
		y: canvas.dimensions?.height / 2 || 0,
	};
	const templateData = buildTemplateDataFromSpec(spec, {
		x: mouse.x,
		y: mouse.y,
		userId: game.user.id,
	});

	try {
		const doc = await placeTemplateWithPlaceablePreview(templateData);
		await flagRitualTemplate(doc, templateFlags);
		return doc;
	} catch (error) {
		console.warn("Ordem Paranormal | placeable template preview failed, trying legacy API:", error);
	}

	// Legacy Foundry preview helpers (pre-v13).
	return new Promise((resolve) => {
		let settled = false;
		const finish = async (doc) => {
			if (settled) return;
			settled = true;
			Hooks.off("createMeasuredTemplate", onCreate);
			Hooks.off("createMeasuredTemplateDocument", onCreate);
			await flagRitualTemplate(doc, templateFlags);
			resolve(doc ?? null);
		};

		const onCreate = (document, _options, userId) => {
			if (userId !== game.user.id) return;
			finish(document);
		};

		Hooks.on("createMeasuredTemplate", onCreate);
		Hooks.on("createMeasuredTemplateDocument", onCreate);

		try {
			const previewFn =
				canvas.templates?._createPreview?.bind(canvas.templates) ?? canvas.templates?.createPreview?.bind(canvas.templates);
			if (!previewFn) throw new Error("MeasuredTemplate preview API unavailable");
			previewFn(templateData, { renderSheet: false });
		} catch (error) {
			console.error("Ordem Paranormal | template preview failed:", error);
			const token = canvas.tokens?.controlled?.[0] ?? canvas.tokens?.placeables?.[0] ?? null;
			const fallback = token?.center ?? {
				x: canvas.dimensions?.width / 2,
				y: canvas.dimensions?.height / 2,
			};
			placeRitualTemplateAtPoint(spec, fallback, templateFlags).then((doc) => finish(doc));
			return;
		}

		setTimeout(() => {
			if (!settled) {
				ui.notifications.info(game.i18n.localize("op.ritualTemplateCancelled"));
				finish(null);
			}
		}, 120000);
	});
}

/** @deprecated use placeRitualTemplateInteractive */
export async function placeCircleTemplateInteractive({ distanceMeters = 6 } = {}) {
	return placeRitualTemplateInteractive({
		type: "circle",
		distanceMeters,
		borderColor: "#5b21b6",
		fillColor: "#7c3aed",
	});
}

/**
 * @param {Token} token
 * @param {MeasuredTemplateDocument} templateDoc
 * @returns {boolean}
 */
export function isTokenInsideTemplate(token, templateDoc) {
	if (!canvas?.grid || !token || !templateDoc?.object) return false;
	if (typeof templateDoc.object.shape?.contains === "function") {
		const { x, y } = token.center;
		return templateDoc.object.shape.contains(x, y);
	}

	const center = templateDoc.object.center ?? { x: templateDoc.x, y: templateDoc.y };
	const radiusPx = ((templateDoc.distance ?? 6) / (canvas.scene.grid.distance || 1)) * canvas.grid.size;
	const dx = token.center.x - center.x;
	const dy = token.center.y - center.y;
	return Math.hypot(dx, dy) <= radiusPx;
}

/**
 * @param {MeasuredTemplateDocument} templateDoc
 * @param {object} [options]
 * @returns {string[]}
 */
export function getActorUuidsInTemplate(templateDoc, { excludeActorUuid = null } = {}) {
	if (!templateDoc || !canvas?.tokens) return [];

	let tokens = [];
	if (typeof templateDoc.object?.getTokensInShape === "function") {
		tokens = templateDoc.object.getTokensInShape();
	} else {
		tokens = canvas.tokens.placeables.filter((token) => isTokenInsideTemplate(token, templateDoc));
	}

	const uuids = [];
	for (const token of tokens) {
		const uuid = token.actor?.uuid;
		if (!uuid) continue;
		if (excludeActorUuid && uuid === excludeActorUuid) continue;
		if (!uuids.includes(uuid)) uuids.push(uuid);
	}
	return uuids;
}

/**
 * Place a ritual area on the map and collect actor UUIDs inside it.
 * @param {Item} ritualItem
 * @param {object} tier
 * @param {Actor} caster
 * @returns {Promise<{ templateDoc: MeasuredTemplateDocument, targetUuids: string[], spec: object }|null>}
 */
export async function resolveRitualAreaTargets(ritualItem, tier, caster) {
	if (!ritualTierUsesArea(ritualItem, tier)) return null;

	const spec = parseRitualAreaSpec(ritualItem, tier);
	spec.borderColor = "#dc2626";
	spec.fillColor = "#ef4444";

	const casterToken = caster.getActiveTokens(true)?.[0] ?? null;
	let templateDoc = null;

	if (spec.centeredOnCaster && casterToken) {
		templateDoc = await placeRitualTemplateAtPoint(spec, {
			x: casterToken.center.x,
			y: casterToken.center.y,
		});
	} else {
		templateDoc = await placeRitualTemplateInteractive(spec);
	}

	if (!templateDoc) return null;

	const targetUuids = getActorUuidsInTemplate(templateDoc, {
		excludeActorUuid: spec.excludeCaster ? caster.uuid : null,
	});

	return { templateDoc, targetUuids, spec };
}

/**
 * @param {object} tier
 * @returns {{ dtBonus: number, peDiscount: number, maximizeDamage: boolean }}
 */
export function getCinerariaTierEffects(tier) {
	return {
		dtBonus: 5,
		peDiscount: tier.key === "discente" ? 2 : 0,
		maximizeDamage: tier.key === "verdadeiro",
	};
}

/**
 * @param {Document} placeableDoc Region or MeasuredTemplate
 * @param {object} zoneData
 */
export async function registerRitualZone(placeableDoc, zoneData) {
	if (!canvas.scene || !placeableDoc) return;
	const existing = canvas.scene.getFlag("ordemparanormal", "ritualZones") ?? [];
	const isRegion = placeableDoc.documentName === "Region" || Array.isArray(placeableDoc.shapes);
	const shape0 = placeableDoc.shapes?.[0] ?? placeableDoc._source?.shapes?.[0];
	const entry = {
		id: foundry.utils.randomID(16),
		templateId: isRegion ? null : placeableDoc.id,
		regionId: isRegion ? placeableDoc.id : null,
		placeableId: placeableDoc.id,
		ritualId: zoneData.ritualId,
		ritualName: zoneData.ritualName,
		tierKey: zoneData.tierKey,
		dtBonus: zoneData.dtBonus ?? 0,
		peDiscount: zoneData.peDiscount ?? 0,
		maximizeDamage: Boolean(zoneData.maximizeDamage),
		attackPenalty: Number(zoneData.attackPenalty) || 0,
		deslocFixed: Number.isFinite(zoneData.deslocFixed) ? zoneData.deslocFixed : null,
		camouflage: zoneData.camouflage ?? null,
		seeThroughActorUuids: Array.isArray(zoneData.seeThroughActorUuids) ? zoneData.seeThroughActorUuids : [],
		x: Number(shape0?.x ?? placeableDoc.x) || 0,
		y: Number(shape0?.y ?? placeableDoc.y) || 0,
		radiusMeters: zoneData.radiusMeters ?? 6,
	};

	await canvas.scene.setFlag("ordemparanormal", "ritualZones", [...existing, entry]);
	await placeableDoc.setFlag("ordemparanormal", "ritualZoneId", entry.id);
	await placeableDoc.setFlag("ordemparanormal", "ritualId", entry.ritualId);
	await placeableDoc.setFlag("ordemparanormal", "ephemeral", false);
	await placeableDoc.setFlag("ordemparanormal", "ritualAreaTemplate", true);

	// Prefer live placeable geometry (Region click-to-place updates shapes after create).
	const live = getRitualZonePlaceable(placeableDoc.id) ?? placeableDoc;
	const liveShape = live.shapes?.[0] ?? live._source?.shapes?.[0];
	if (liveShape || live.object?.center) {
		entry.x = Number(liveShape?.x ?? live.object?.center?.x ?? entry.x) || entry.x;
		entry.y = Number(liveShape?.y ?? live.object?.center?.y ?? entry.y) || entry.y;
		const zones = canvas.scene.getFlag("ordemparanormal", "ritualZones") ?? [];
		const idx = zones.findIndex((z) => z.id === entry.id);
		if (idx >= 0) {
			zones[idx] = { ...zones[idx], x: entry.x, y: entry.y };
			await canvas.scene.setFlag("ordemparanormal", "ritualZones", zones);
		}
	}

	refreshActorsAffectedByRitualZones();
	return entry;
}

/**
 * @param {string} placeableId
 * @returns {Document|null}
 */
export function getRitualZonePlaceable(placeableId) {
	if (!placeableId || !canvas?.scene) return null;
	return (
		canvas.scene.regions?.get?.(placeableId) ??
		canvas.scene.getEmbeddedCollection?.("Region")?.get?.(placeableId) ??
		canvas.scene.templates?.get?.(placeableId) ??
		canvas.scene.getEmbeddedCollection?.("MeasuredTemplate")?.get?.(placeableId) ??
		null
	);
}

/**
 * Tokens on the active scene for this actor (linked or unlinked).
 * @param {Actor} actor
 * @returns {Token[]}
 */
function getActorSceneTokens(actor) {
	if (!actor?.getActiveTokens) return [];
	const linked = actor.getActiveTokens(true) ?? [];
	const all = actor.getActiveTokens(false) ?? [];
	const byId = new Map();
	for (const token of [...linked, ...all]) {
		if (token?.id) byId.set(token.id, token);
	}
	return [...byId.values()];
}

/**
 * Re-prepare + re-render agents that may be inside/outside ritual zones.
 * Call after placing/moving/deleting a zone or when tokens move.
 */
export function refreshActorsAffectedByRitualZones() {
	if (!canvas?.scene) return;
	const zones = canvas.scene.getFlag("ordemparanormal", "ritualZones") ?? [];
	if (!zones.length) {
		// Still refresh open agent sheets so DT drops after the last zone is cleared.
	}

	const actors = new Set();
	for (const token of canvas.tokens?.placeables ?? []) {
		if (token.actor?.type === "agent") actors.add(token.actor);
	}
	for (const actor of actors) {
		try {
			actor.prepareData();
			actor.sheet?.rendered && actor.sheet.render(false);
		} catch (_error) {
			/* ignore */
		}
	}
}

/**
 * @param {string} placeableId template or region id
 */
export async function unregisterRitualZoneByTemplate(placeableId) {
	if (!canvas.scene) return;
	const existing = canvas.scene.getFlag("ordemparanormal", "ritualZones") ?? [];
	const filtered = existing.filter(
		(z) => z.templateId !== placeableId && z.regionId !== placeableId && z.placeableId !== placeableId
	);
	if (filtered.length !== existing.length) {
		await canvas.scene.setFlag("ordemparanormal", "ritualZones", filtered);
		refreshActorsAffectedByRitualZones();
	}
}

/**
 * @param {Token} token
 * @param {object} zone
 * @returns {boolean}
 */
export function isTokenInsideRitualZone(token, zone) {
	const canvas = globalThis.canvas;
	if (!canvas?.grid || !token || !zone) return false;

	const placeableId = zone.regionId || zone.placeableId || zone.templateId;
	const placeable = getRitualZonePlaceable(placeableId);

	if (placeable && typeof placeable.testPoint === "function") {
		try {
			const point = {
				x: token.center.x,
				y: token.center.y,
				elevation: token.document?.elevation ?? token.elevation ?? 0,
			};
			if (placeable.testPoint(point)) return true;
		} catch (_error) {
			/* fall through */
		}
	}

	const shape0 = placeable?.shapes?.[0] ?? placeable?._source?.shapes?.[0];
	const center = placeable?.object?.center ?? {
		x: Number(shape0?.x ?? zone.x) || 0,
		y: Number(shape0?.y ?? zone.y) || 0,
	};
	const radiusPx = metersToCanvasPixels(zone.radiusMeters ?? 6);

	const dx = token.center.x - center.x;
	const dy = token.center.y - center.y;
	return Math.hypot(dx, dy) <= radiusPx + 1; // 1px tolerance for grid snap
}

/**
 * @param {Actor} actor
 * @returns {number}
 */
export function getRitualZoneDtBonus(actor) {
	if (!globalThis.canvas?.scene || !actor) return 0;

	const zones = globalThis.canvas.scene.getFlag("ordemparanormal", "ritualZones") ?? [];
	if (!zones.length) return 0;

	const tokens = getActorSceneTokens(actor);
	if (!tokens.length) return 0;

	let bonus = 0;
	for (const token of tokens) {
		for (const zone of zones) {
			if (zone.ritualId !== "cineraria") continue;
			if (isTokenInsideRitualZone(token, zone)) {
				bonus = Math.max(bonus, Number(zone.dtBonus) || 0);
			}
		}
	}
	return bonus;
}

/**
 * @param {Actor} actor
 * @returns {object[]}
 */
export function getRitualZonesAffectingActor(actor) {
	if (!globalThis.canvas?.scene || !actor) return [];
	const zones = globalThis.canvas.scene.getFlag("ordemparanormal", "ritualZones") ?? [];
	if (!zones.length) return [];
	const tokens = getActorSceneTokens(actor);
	if (!tokens.length) return [];

	const affecting = [];
	for (const token of tokens) {
		for (const zone of zones) {
			if (!isTokenInsideRitualZone(token, zone)) continue;
			if (!affecting.some((entry) => entry.id === zone.id)) affecting.push(zone);
		}
	}
	return affecting;
}

/**
 * @param {Actor} actor
 * @returns {number}
 */
export function getRitualZoneAttackPenalty(actor) {
	let penalty = 0;
	for (const zone of getRitualZonesAffectingActor(actor)) {
		if (zone.seeThroughActorUuids?.includes?.(actor.uuid)) continue;
		penalty = Math.max(penalty, Number(zone.attackPenalty) || 0);
	}
	return penalty;
}

/**
 * @param {Actor} actor
 * @returns {number|null}
 */
export function getRitualZoneDeslocCap(actor) {
	let cap = null;
	for (const zone of getRitualZonesAffectingActor(actor)) {
		if (!Number.isFinite(zone.deslocFixed)) continue;
		cap = cap == null ? zone.deslocFixed : Math.min(cap, zone.deslocFixed);
	}
	return cap;
}

/**
 * @param {object} tier
 * @returns {{ camouflage: object, attackPenalty: number, deslocFixed: number|null }}
 */
export function getNuvemDeCinzasTierEffects(tier) {
	const base = {
		camouflage: { lightMeters: 1.5, totalMeters: 3 },
		attackPenalty: 0,
		deslocFixed: null,
	};
	if (tier?.key === "verdadeiro") {
		base.attackPenalty = 2;
		base.deslocFixed = 3;
	}
	return base;
}

/**
 * Collect currently targeted actors as see-through exceptions (Discente+).
 * @returns {string[]}
 */
function collectSeeThroughTargetUuids() {
	const targets = [...(game.user?.targets ?? [])];
	return targets.map((token) => token.actor?.uuid).filter(Boolean);
}

/**
 * Place a lasting area template for non-damage AoE rituals.
 * @param {Item} ritualItem
 * @param {object} tier
 * @param {Actor} caster
 * @returns {Promise<object|null>}
 */
export async function castPersistentRitualZone(ritualItem, tier, caster) {
	const ritualId = getRitualSourceId(ritualItem) || "";
	const spec = parseRitualAreaSpec(ritualItem, tier);

	if (ritualId === "nuvem-de-cinzas") {
		spec.borderColor = "#57534e";
		spec.fillColor = "#78716c";
	} else if (ritualId === "tecer-ilusao") {
		spec.borderColor = "#a16207";
		spec.fillColor = "#eab308";
	} else {
		spec.borderColor = "#dc2626";
		spec.fillColor = "#ef4444";
	}

	const casterToken = caster.getActiveTokens?.(true)?.[0] ?? null;
	let templateDoc = null;
	if (spec.centeredOnCaster && casterToken) {
		templateDoc = await placeRitualTemplateAtPoint(
			spec,
			{ x: casterToken.center.x, y: casterToken.center.y },
			{ ephemeral: false, ritualId }
		);
	} else {
		templateDoc = await placeRitualTemplateInteractive(spec, { ephemeral: false, ritualId });
	}
	if (!templateDoc) return null;

	const radiusMeters = spec.distanceMeters;
	const zoneExtras =
		ritualId === "nuvem-de-cinzas"
			? getNuvemDeCinzasTierEffects(tier)
			: { camouflage: null, attackPenalty: 0, deslocFixed: null };

	const seeThroughActorUuids =
		ritualId === "nuvem-de-cinzas" && tier?.key !== "base" ? collectSeeThroughTargetUuids() : [];

	const zone = await registerRitualZone(templateDoc, {
		ritualId: ritualId || "ritual-zone",
		ritualName: ritualItem.name,
		tierKey: tier.key,
		radiusMeters,
		...zoneExtras,
		seeThroughActorUuids,
	});

	const duration = ritualDurationToEffectDuration(ritualItem.system.duration);
	const description =
		ritualId === "nuvem-de-cinzas"
			? game.i18n.format("op.nuvemDeCinzasZoneActive", {
					radius: radiusMeters,
					tier: tier.label,
			  })
			: game.i18n.format("op.ritualZoneActive", {
					ritual: ritualItem.name,
					radius: radiusMeters,
			  });

	await caster.createEmbeddedDocuments("ActiveEffect", [
		{
			name: `${ritualItem.name} (${tier.label})`,
			icon: ritualItem.img,
			origin: ritualItem.uuid,
			duration,
			description,
			flags: {
				ordemparanormal: {
					ritualZoneOwner: true,
					ritualSourceId: ritualId,
					templateId: templateDoc.id,
					zoneId: zone?.id,
					...zoneExtras,
					seeThroughActorUuids,
				},
			},
		},
	]);

	return { templateDoc, zone, effects: zoneExtras, seeThroughActorUuids, radiusMeters };
}

/**
 * @param {Item} ritualItem
 * @param {object} tier
 * @param {Actor} caster
 * @returns {Promise<object|null>}
 */
export async function castCinerariaZone(ritualItem, tier, caster) {
	const spec = parseRitualAreaSpec(ritualItem, tier);
	spec.borderColor = "#5b21b6";
	spec.fillColor = "#7c3aed";

	const templateDoc = await placeRitualTemplateInteractive(spec, { ephemeral: false, ritualId: "cineraria" });
	if (!templateDoc) return null;

	const radiusMeters = spec.distanceMeters;
	const effects = getCinerariaTierEffects(tier);
	await registerRitualZone(templateDoc, {
		ritualId: getRitualSourceId(ritualItem) || "cineraria",
		ritualName: ritualItem.name,
		tierKey: tier.key,
		radiusMeters,
		...effects,
	});

	const duration = ritualDurationToEffectDuration(ritualItem.system.duration);
	await caster.createEmbeddedDocuments("ActiveEffect", [
		{
			name: `${ritualItem.name} (${tier.label})`,
			icon: ritualItem.img,
			origin: ritualItem.uuid,
			duration,
			description: game.i18n.format("op.cinerariaZoneActive", {
				radius: radiusMeters,
				bonus: effects.dtBonus,
			}),
			flags: {
				ordemparanormal: {
					cinerariaZone: true,
					templateId: templateDoc.id,
					...effects,
				},
			},
		},
	]);

	const liveTemplate =
		canvas.scene.regions?.get?.(templateDoc.id) ?? canvas.scene.templates?.get?.(templateDoc.id) ?? templateDoc;
	return { templateDoc: liveTemplate, effects, radiusMeters };
}
