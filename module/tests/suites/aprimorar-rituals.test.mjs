import { installBatchGuards, withActor } from "../helpers/fixtures.mjs";
import {
	buildAprimorarEffectData,
	getAttributeUpcastBonus,
	getEffectiveAttributeValue,
} from "../../helpers/ritual-effects.mjs";

Hooks.once("quenchReady", (quench) => {
	quench.registerBatch(
		"ordemparanormal.aprimorarRituals",
		(context) => {
			const { describe, it, assert } = context;
			installBatchGuards(context, { prefix: "[aprimorar]", clearTargets: true });

			function refetch(actor) {
				return game.actors.get(actor.id);
			}

			function agentData() {
				return {
					name: "[aprimorar] Agent",
					type: "agent",
					system: {
						class: "fighter",
						disableCalculations: true,
						attributes: {
							vit: { value: 2, bonus: 0 },
							pre: { value: 2, bonus: 0 },
							dex: { value: 2, bonus: 0 },
							str: { value: 2, bonus: 0 },
							int: { value: 2, bonus: 0 },
						},
						PE: { value: 30, max: 30 },
					},
				};
			}

			function ritualData(id, name) {
				return {
					name,
					type: "ritual",
					img: "icons/svg/aura.svg",
					system: {
						circle: 2,
						duration: "scene",
						range: "touch",
						target: "creatures",
						targetQtd: "1",
						studentForm: true,
						trueForm: true,
						basePeCost: 2,
						tiers: [
							{ key: "base", label: "Base", peCost: 2, formula: "", kind: "efeito" },
							{ key: "discente", label: "Discente", peCost: 5, formula: "", kind: "efeito" },
							{ key: "verdadeiro", label: "Verdadeiro", peCost: 9, formula: "", kind: "efeito" },
						],
					},
					flags: { ordemparanormal: { ritualSourceId: id, peCost: 2 } },
				};
			}

			async function withDialogStub(returnValue, fn) {
				const api = foundry.applications.api.DialogV2;
				const originalWait = api.wait?.bind(api);
				const originalInput = api.input?.bind(api);
				const originalPrompt = api.prompt?.bind(api);
				api.wait = async () => returnValue;
				if (api.input) api.input = async () => ({ attributeKey: returnValue, tierKey: returnValue });
				if (api.prompt) api.prompt = async () => returnValue;
				try {
					return await fn();
				} finally {
					if (originalWait) api.wait = originalWait;
					if (originalInput) api.input = originalInput;
					if (originalPrompt) api.prompt = originalPrompt;
				}
			}

			/**
			 * Cast aprimorar without canvas targets / Dialog UI.
			 */
			async function castAprimorar(ritualId, actor, tierKey, attributeKey) {
				actor = refetch(actor);
				const live = actor.items.get(ritualId);
				assert.ok(live, "ritual item must exist on actor");
				const tier = live.getRitualTiers().find((entry) => entry.key === tierKey);
				assert.ok(tier, `tier ${tierKey} must exist`);
				live._getRitualTargetUuids = () => [actor.uuid];
				return withDialogStub(attributeKey, () => live.useRitual({ tierKey }));
			}

			describe("ActiveEffect on attributes.*.bonus (sheet data)", () => {
				it("ADD +2 to dex.bonus is visible on the actor after prepare", async () => {
					await withActor(agentData(), async (actor) => {
						await actor.createEmbeddedDocuments("ActiveEffect", [
							{
								name: "[aprimorar] AE dex +2",
								changes: [
									{
										key: "system.attributes.dex.bonus",
										mode: CONST.ACTIVE_EFFECT_MODES.ADD,
										value: "2",
									},
								],
							},
						]);
						actor = refetch(actor);
						assert.equal(
							Number(actor.system.attributes.dex.bonus) || 0,
							2,
							"bonus field must receive AE — if this fails, Foundry is not applying attributes.*.bonus"
						);
						assert.equal(getEffectiveAttributeValue(actor.system.attributes.dex), 4, "effective = value+bonus");
					});
				});
			});

			describe("buildAprimorarEffectData", () => {
				it("forces +1 / +2 / +3 from the tier key", () => {
					assert.equal(getAttributeUpcastBonus("base"), 1);
					assert.equal(getAttributeUpcastBonus("discente"), 2);
					assert.equal(getAttributeUpcastBonus("verdadeiro"), 3);

					const discente = buildAprimorarEffectData({
						ritualName: "Aprimorar Físico",
						ritualId: "aprimorar-fisico",
						tierKey: "discente",
						tierLabel: "Discente",
						attributeKey: "str",
					});
					assert.equal(discente.bonus, 2);
					assert.equal(discente.effectData.changes[0].value, "2");
					assert.ok(String(discente.effectData.name).includes("+2"));
				});
			});

			describe("useRitual cast path (DialogV2 stubbed)", () => {
				it("Base applies +1 STR bonus on the sheet", async () => {
					await withActor(agentData(), async (actor) => {
						const [ritual] = await actor.createEmbeddedDocuments("Item", [
							ritualData("aprimorar-fisico", "Aprimorar Físico"),
						]);
						const result = await castAprimorar(ritual.id, actor, "base", "str");
						assert.ok(result, "cast must succeed");
						assert.equal(result.bonus, 1);

						actor = refetch(actor);
						assert.equal(Number(actor.system.attributes.str.bonus) || 0, 1);
						assert.equal(getEffectiveAttributeValue(actor.system.attributes.str), 3);
						const effect = [...actor.effects].find((e) => e.flags?.ordemparanormal?.ritualSourceId === "aprimorar-fisico");
						assert.ok(effect, "ritual AE must exist");
						assert.equal(effect.flags.ordemparanormal.ritualTier, "base");
						assert.equal(effect.flags.ordemparanormal.attributeBonus, 1);
					});
				});

				it("Discente applies +2 STR bonus (not +1)", async () => {
					await withActor(agentData(), async (actor) => {
						const [ritual] = await actor.createEmbeddedDocuments("Item", [
							ritualData("aprimorar-fisico", "Aprimorar Físico"),
						]);
						const result = await castAprimorar(ritual.id, actor, "discente", "str");
						assert.ok(result, "discente cast must succeed");
						assert.equal(result.bonus, 2, "upcast bonus must be 2");
						assert.equal(result.tier.key, "discente");

						actor = refetch(actor);
						assert.equal(Number(actor.system.attributes.str.bonus) || 0, 2, "sheet str.bonus must be +2");
						assert.equal(getEffectiveAttributeValue(actor.system.attributes.str), 4);
						const effect = [...actor.effects].find((e) => e.flags?.ordemparanormal?.ritualSourceId === "aprimorar-fisico");
						assert.ok(effect);
						assert.equal(effect.flags.ordemparanormal.ritualTier, "discente");
						assert.equal(effect.flags.ordemparanormal.attributeBonus, 2);
						assert.ok(String(effect.name).includes("+2"));
					});
				});

				it("Verdadeiro applies +3 INT bonus for Aprimorar Mente", async () => {
					await withActor(agentData(), async (actor) => {
						const [ritual] = await actor.createEmbeddedDocuments("Item", [ritualData("aprimorar-mente", "Aprimorar Mente")]);
						const result = await castAprimorar(ritual.id, actor, "verdadeiro", "int");
						assert.ok(result, "verdadeiro cast must succeed");
						assert.equal(result.bonus, 3);

						actor = refetch(actor);
						assert.equal(Number(actor.system.attributes.int.bonus) || 0, 3);
						assert.equal(getEffectiveAttributeValue(actor.system.attributes.int), 5);
						const effect = [...actor.effects].find((e) => e.flags?.ordemparanormal?.ritualSourceId === "aprimorar-mente");
						assert.ok(effect);
						assert.equal(effect.flags.ordemparanormal.ritualTier, "verdadeiro");
						assert.equal(effect.flags.ordemparanormal.attributeBonus, 3);
					});
				});

				it("upcasting replaces Base with Discente (no stacked +1/+2)", async () => {
					await withActor(agentData(), async (actor) => {
						const [ritual] = await actor.createEmbeddedDocuments("Item", [
							ritualData("aprimorar-fisico", "Aprimorar Físico"),
						]);
						await castAprimorar(ritual.id, actor, "base", "dex");
						await castAprimorar(ritual.id, actor, "discente", "dex");

						actor = refetch(actor);
						const aprimorarEffects = [...actor.effects].filter(
							(e) => e.flags?.ordemparanormal?.ritualSourceId === "aprimorar-fisico"
						);
						assert.equal(aprimorarEffects.length, 1, "only one aprimorar AE should remain");
						assert.equal(Number(actor.system.attributes.dex.bonus) || 0, 2, "final bonus is Discente +2");
						assert.equal(aprimorarEffects[0].flags.ordemparanormal.ritualTier, "discente");
					});
				});

				it("getRitualTiers exposes Discente/Verdadeiro even if only Base is stored", async () => {
					await withActor(agentData(), async (actor) => {
						const base = ritualData("aprimorar-fisico", "Aprimorar Físico");
						const [ritual] = await actor.createEmbeddedDocuments("Item", [
							{
								...base,
								system: {
									...base.system,
									tiers: [{ key: "base", label: "Base", peCost: 2, formula: "", kind: "efeito" }],
									description:
										"<p><strong>Aprimoramentos</strong></p><ul><li><strong>Discente (+3 PE):</strong> +2</li><li><strong>Verdadeiro (+7 PE):</strong> +3</li></ul>",
								},
							},
						]);
						actor = refetch(actor);
						const tiers = actor.items.get(ritual.id).getRitualTiers();
						assert.deepEqual(
							tiers.map((t) => t.key),
							["base", "discente", "verdadeiro"]
						);
						assert.equal(tiers.find((t) => t.key === "discente").peCost, 5);
						assert.equal(tiers.find((t) => t.key === "verdadeiro").peCost, 9);
					});
				});
			});
		},
		{ displayName: "OP | Aprimorar Físico/Mente" }
	);
});
