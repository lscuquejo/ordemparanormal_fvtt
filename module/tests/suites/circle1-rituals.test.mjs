import { installBatchGuards, withActor } from "../helpers/fixtures.mjs";
import {
	buildTemplateDataFromSpec,
	getCinerariaTierEffects,
	parseRitualAreaSpec,
	ritualMetersToTemplateDistance,
	ritualTierPlacesPersistentZone,
} from "../../helpers/ritual-zones.mjs";
import { getRitualTierEffectSpec, buildRitualEffectParts } from "../../helpers/ritual-effects.mjs";

Hooks.once("quenchReady", (quench) => {
	quench.registerBatch(
		"ordemparanormal.circle1Rituals",
		(context) => {
			const { describe, it, assert } = context;
			installBatchGuards(context, { prefix: "[c1-ritual]", clearTargets: true });

			function refetch(actor) {
				return game.actors.get(actor.id);
			}

			function agentData(name = "[c1-ritual] Agent") {
				return {
					name,
					type: "agent",
					system: {
						class: "fighter",
						// Keep derived defense so ritual defense.bonus is folded into defense.value
						// (same path as real play / existing Armadura Quench suite).
						disableCalculations: false,
						attributes: {
							vit: { value: 2, bonus: 0 },
							pre: { value: 2, bonus: 0 },
							dex: { value: 2, bonus: 0 },
							str: { value: 2, bonus: 0 },
							int: { value: 2, bonus: 0 },
						},
						defense: { value: 10, bonus: 0, dodge: 0 },
						PE: { value: 40, max: 40 },
						skills: {
							deception: { mod: 0 },
							acrobatics: { mod: 0 },
							athleticism: { mod: 0 },
						},
					},
				};
			}

			function ritualItem(id, name, overrides = {}) {
				const { system: systemOverrides = {}, flags: flagOverrides, ...rest } = overrides;
				return {
					name,
					type: "ritual",
					img: "icons/svg/aura.svg",
					system: {
						circle: 1,
						duration: "scene",
						range: "personal",
						target: "people",
						targetQtd: "1",
						studentForm: true,
						trueForm: true,
						basePeCost: 1,
						tiers: [
							{ key: "base", label: "Base", peCost: 1, formula: "", kind: "efeito" },
							{ key: "discente", label: "Discente", peCost: 3, formula: "", kind: "efeito" },
							{ key: "verdadeiro", label: "Verdadeiro", peCost: 6, formula: "", kind: "efeito" },
						],
						...systemOverrides,
					},
					flags: {
						ordemparanormal: {
							ritualSourceId: id,
							peCost: 1,
							...(flagOverrides?.ordemparanormal ?? {}),
						},
					},
					...rest,
				};
			}

			async function castBuff(ritualId, actor, tierKey) {
				actor = refetch(actor);
				const live = actor.items.get(ritualId);
				assert.ok(live, "ritual item must exist");
				live._getRitualTargetUuids = () => [actor.uuid];
				return live.useRitual({ tierKey });
			}

			async function withTemplateTestPoint(point, fn) {
				globalThis.__opRitualTemplateTestPoint = point;
				try {
					return await fn();
				} finally {
					delete globalThis.__opRitualTemplateTestPoint;
				}
			}

			async function cleanupRitualTemplates() {
				if (!canvas?.scene) return;
				const regionIds = [...(canvas.scene.regions ?? [])]
					.filter((t) => t.flags?.ordemparanormal?.ritualAreaTemplate || t.flags?.ordemparanormal?.ritualId)
					.map((t) => t.id);
				if (regionIds.length) {
					try {
						await canvas.scene.deleteEmbeddedDocuments("Region", regionIds);
					} catch (_error) {
						/* ignore */
					}
				}
				const templateIds = [...(canvas.scene.templates ?? [])]
					.filter((t) => t.flags?.ordemparanormal?.ritualAreaTemplate || t.flags?.ordemparanormal?.ritualId)
					.map((t) => t.id);
				if (templateIds.length) {
					try {
						await canvas.scene.deleteEmbeddedDocuments("MeasuredTemplate", templateIds);
					} catch (_error) {
						/* ignore */
					}
				}
				try {
					await canvas.scene.unsetFlag("ordemparanormal", "ritualZones");
				} catch (_error) {
					/* ignore */
				}
			}

			describe("spec baselines (shared with Vitest)", () => {
				it("Armadura de Sangue base/discente/verdadeiro defense (+5/+10/+15)", () => {
					assert.equal(getRitualTierEffectSpec("armadura-de-sangue", "base").defense, 5);
					assert.equal(getRitualTierEffectSpec("armadura-de-sangue", "discente").defense, 10);
					assert.equal(getRitualTierEffectSpec("armadura-de-sangue", "verdadeiro").defense, 15);
				});

				it("Coincidência Forçada skillsAll +2 base / +5 verdadeiro", () => {
					assert.equal(getRitualTierEffectSpec("coincidencia-forcada", "base").skillsAll, 2);
					assert.equal(getRitualTierEffectSpec("coincidencia-forcada", "verdadeiro").skillsAll, 5);
					const parts = buildRitualEffectParts(getRitualTierEffectSpec("coincidencia-forcada", "base"));
					assert.ok(parts.changes.some((c) => c.key === "system.skills.acrobatics.mod" && c.value === "2"));
				});

				it("Cinerária template distance is 6 scene units (meters), not grid squares", () => {
					assert.equal(ritualMetersToTemplateDistance(6), 6);
					const cineraria = {
						system: {
							target: "area",
							range: "short",
							duration: "scene",
							description: "<p><strong>Área:</strong> nuvem de 6m de raio</p>",
							area: { name: "nuvem de 6m de raio", size: "6", type: "circle" },
						},
					};
					const spec = parseRitualAreaSpec(cineraria, { key: "base", label: "Base" });
					assert.equal(spec.distanceMeters, 6);
					const data = buildTemplateDataFromSpec(spec, { x: 100, y: 100, userId: "u" });
					assert.equal(data.t, "circle");
					assert.equal(data.distance, 6);
					assert.equal(getCinerariaTierEffects({ key: "base" }).dtBonus, 5);
				});
			});

			describe("Armadura de Sangue — cast path (personal buff baseline)", () => {
				it("Base applies +5 defense.bonus on the sheet", async () => {
					await withActor(agentData(), async (actor) => {
						const [ritual] = await actor.createEmbeddedDocuments("Item", [
							ritualItem("armadura-de-sangue", "Armadura de Sangue"),
						]);
						const baseDefense = Number(refetch(actor).system.defense.value) || 0;
						const result = await castBuff(ritual.id, actor, "base");
						assert.ok(result, "cast must succeed");

						actor = refetch(actor);
						assert.equal(Number(actor.system.defense.bonus) || 0, 5, "defense.bonus +5");
						assert.equal(Number(actor.system.defense.value) || 0, baseDefense + 5, "defense.value includes AE");
						const effect = [...actor.effects].find((e) => e.flags?.ordemparanormal?.ritualSourceId === "armadura-de-sangue");
						assert.ok(effect, "ritual AE must exist");
					});
				});

				it("Discente applies +10 defense (not +5)", async () => {
					await withActor(agentData(), async (actor) => {
						const [ritual] = await actor.createEmbeddedDocuments("Item", [
							ritualItem("armadura-de-sangue", "Armadura de Sangue"),
						]);
						await castBuff(ritual.id, actor, "discente");
						actor = refetch(actor);
						assert.equal(Number(actor.system.defense.bonus) || 0, 10, "discente defense.bonus +10");
					});
				});
			});

			describe("Coincidência Forçada — skill buff baseline", () => {
				it("Base applies +2 skill mod (acrobatics)", async () => {
					await withActor(agentData(), async (actor) => {
						const [ritual] = await actor.createEmbeddedDocuments("Item", [
							ritualItem("coincidencia-forcada", "Coincidência Forçada", {
								system: { range: "short", target: "creatures", targetQtd: "1" },
							}),
						]);
						await castBuff(ritual.id, actor, "base");
						actor = refetch(actor);
						assert.equal(Number(actor.system.skills.acrobatics?.mod) || 0, 2);
						assert.equal(Number(actor.system.skills.deception?.mod) || 0, 2);
					});
				});

				it("Verdadeiro applies +5 skill mod", async () => {
					await withActor(agentData(), async (actor) => {
						const [ritual] = await actor.createEmbeddedDocuments("Item", [
							ritualItem("coincidencia-forcada", "Coincidência Forçada", {
								system: { range: "short", target: "creatures", targetQtd: "1" },
							}),
						]);
						await castBuff(ritual.id, actor, "verdadeiro");
						actor = refetch(actor);
						assert.equal(Number(actor.system.skills.acrobatics?.mod) || 0, 5);
					});
				});
			});

			describe("Distorcer Aparência — deception baseline", () => {
				it("Base applies +10 deception.mod", async () => {
					await withActor(agentData(), async (actor) => {
						const [ritual] = await actor.createEmbeddedDocuments("Item", [
							ritualItem("distorcer-aparencia", "Distorcer Aparência"),
						]);
						await castBuff(ritual.id, actor, "base");
						actor = refetch(actor);
						assert.equal(Number(actor.system.skills.deception?.mod) || 0, 10);
					});
				});
			});

			describe("Cinerária / Nuvem — MeasuredTemplate AoE", () => {
				it("Cinerária creates a 6m circle template and +5 DT zone", async () => {
					if (!canvas?.ready || !canvas.scene) {
						assert.ok(true, "skipped — open a scene to run AoE template tests");
						return;
					}

					await cleanupRitualTemplates();
					await withActor(agentData("[c1-ritual] Cinerária"), async (actor) => {
						const [ritual] = await actor.createEmbeddedDocuments("Item", [
							ritualItem("cineraria", "Cinerária", {
								system: {
									target: "area",
									range: "short",
									duration: "scene",
									area: { name: "nuvem de 6m de raio", size: "6", type: "circle" },
									description: "<p><strong>Área:</strong> nuvem de 6m de raio</p>",
								},
							}),
						]);

						const place = {
							x: canvas.dimensions.width / 2,
							y: canvas.dimensions.height / 2,
						};

						const result = await withTemplateTestPoint(place, async () => {
							actor = refetch(actor);
							const live = actor.items.get(ritual.id);
							return live.useRitual({ tierKey: "base" });
						});

						assert.ok(result?.zone?.templateDoc, "cast must place a zone template");
						const templateId = result.zone.templateDoc.id;
						const placeable =
							canvas.scene.regions?.get?.(templateId) ?? canvas.scene.templates?.get?.(templateId) ?? result.zone.templateDoc;
						assert.ok(placeable, "placeable must exist on the scene");

						const isRegion = placeable.documentName === "Region" || Array.isArray(placeable.shapes);
						if (isRegion) {
							const shape = placeable.shapes?.[0] ?? placeable._source?.shapes?.[0];
							assert.equal(shape?.type, "circle");
							const pxPerMeter = canvas.dimensions?.distancePixels || canvas.grid.size / (canvas.scene.grid.distance || 1);
							assert.approximately(Number(shape.radius) / pxPerMeter, 6, 0.05, "region radius ≈ 6m");
						} else {
							assert.equal(placeable.t ?? placeable.system?.t, "circle");
							assert.equal(Number(placeable.distance), 6, "template distance must be 6m scene units");
						}

						const flaggedId =
							placeable.getFlag?.("ordemparanormal", "ritualId") ?? placeable.flags?.ordemparanormal?.ritualId;
						assert.equal(flaggedId, "cineraria", "placeable must carry ritualId flag");

						const zones = canvas.scene.getFlag("ordemparanormal", "ritualZones") ?? [];
						const zone = zones.find(
							(z) =>
								z.ritualId === "cineraria" &&
								(z.templateId === templateId || z.regionId === templateId || z.placeableId === templateId)
						);
						assert.ok(zone, "ritualZones must register Cinerária");
						assert.equal(zone.dtBonus, 5);
						assert.equal(zone.radiusMeters, 6);
					});

					await cleanupRitualTemplates();
				});

				it("Nuvem de Cinzas is a persistent zone ritual and places a 6m template", async () => {
					const nuvem = {
						system: {
							target: "area",
							range: "short",
							duration: "scene",
							area: { name: "nuvem com 6m de raio e 6m de altura", size: "6", type: "circle" },
							description: "<p><strong>Efeito:</strong> nuvem com 6m de raio e 6m de altura</p>",
						},
					};
					assert.ok(
						ritualTierPlacesPersistentZone(nuvem, { key: "base", label: "Base" }),
						"Nuvem should place a persistent zone"
					);

					if (!canvas?.ready || !canvas.scene) {
						assert.ok(true, "skipped — open a scene to run AoE template tests");
						return;
					}

					await cleanupRitualTemplates();
					await withActor(agentData("[c1-ritual] Nuvem"), async (actor) => {
						const [ritual] = await actor.createEmbeddedDocuments("Item", [
							ritualItem("nuvem-de-cinzas", "Nuvem de Cinzas", {
								system: nuvem.system,
							}),
						]);

						const place = {
							x: canvas.dimensions.width / 2 + 50,
							y: canvas.dimensions.height / 2 + 50,
						};

						const result = await withTemplateTestPoint(place, async () => {
							actor = refetch(actor);
							return actor.items.get(ritual.id).useRitual({ tierKey: "base" });
						});

						assert.ok(result?.zone?.templateDoc, "nuvem must place a template");
						assert.equal(Number(result.zone.templateDoc.distance), 6);
						assert.equal(Number(result.zone.radiusMeters) || 6, 6);
					});
					await cleanupRitualTemplates();
				});
			});
		},
		{ displayName: "OP | Circle 1 Rituals" }
	);
});
