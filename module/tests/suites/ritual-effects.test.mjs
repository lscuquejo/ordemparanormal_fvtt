import { installBatchGuards } from "../helpers/fixtures.mjs";

Hooks.once("quenchReady", (quench) => {
	quench.registerBatch(
		"ordemparanormal.ritualEffects",
		(context) => {
			const { describe, it, assert, before, after } = context;
			installBatchGuards(context, { prefix: "[Quench]" });

			function refetch(actor) {
				return game.actors.get(actor.id);
			}

			describe("Armadura de Sangue — defense bonus via ActiveEffect", () => {
				let actor;

				before(async () => {
					actor = await Actor.create({
						name: "[Quench] Armadura de Sangue",
						type: "agent",
						system: {
							class: "fighter",
							attributes: {
								vit: { value: 1 },
								pre: { value: 1 },
								dex: { value: 2 },
								str: { value: 1 },
								int: { value: 1 },
							},
							defense: { value: 10, bonus: 0, dodge: 0 },
						},
					});
					actor = refetch(actor);
				});

				after(async () => {
					await actor?.delete();
				});

				it("base tier +5 increases defense.value and dodge", async () => {
					const baseDefense = actor.system.defense.value;

					await actor.createEmbeddedDocuments("ActiveEffect", [
						{
							name: "Armadura de Sangue (Base)",
							changes: [{ key: "system.defense.bonus", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "5" }],
						},
					]);

					actor = refetch(actor);
					assert.equal(actor.system.defense.value, baseDefense + 5);
					assert.equal(actor.system.defense.dodge, actor.system.defense.value);
				});
			});

			describe("Ritual RD — applyDamage respects ritualRd flags", () => {
				let actor;

				before(async () => {
					actor = await Actor.create({
						name: "[Quench] Ritual RD",
						type: "agent",
						system: {
							class: "fighter",
							attributes: {
								vit: { value: 1 },
								pre: { value: 1 },
								dex: { value: 1 },
								str: { value: 1 },
								int: { value: 1 },
							},
							PV: { value: 20, max: 20 },
						},
					});
					actor = refetch(actor);
				});

				after(async () => {
					await actor?.delete();
				});

				it("physical ritual RD reduces incoming cutting damage", async () => {
					await actor.createEmbeddedDocuments("ActiveEffect", [
						{
							name: "Armadura de Sangue (Discente)",
							flags: {
								ordemparanormal: {
									ritualRd: {
										ballisticDamage: 5,
										cuttingDamage: 5,
										impactDamage: 5,
										piercingDamage: 5,
									},
								},
							},
						},
					]);
					actor = refetch(actor);

					const result = await actor.applyDamage(12, { damageType: "cuttingDamage" });
					assert.equal(result.finalDamage, 7);
					assert.equal(result.blocked, 5);
				});
			});

			describe("Fortalecimento Sensorial — skill dice, defense, reflexes", () => {
				let actor;

				before(async () => {
					actor = await Actor.create({
						name: "[Quench] Fortalecimento Sensorial",
						type: "agent",
						system: {
							class: "fighter",
							attributes: {
								vit: { value: 1 },
								pre: { value: 1 },
								dex: { value: 2 },
								str: { value: 1 },
								int: { value: 1 },
							},
							defense: { value: 10, bonus: 0, dodge: 0 },
						},
					});
					actor = refetch(actor);
				});

				after(async () => {
					await actor?.delete();
				});

				it("verdadeiro AE raises defense and skill diceMod / reflexes mod", async () => {
					const baseDefense = actor.system.defense.value;
					const baseReflexes = Number(actor.system.skills?.reflexes?.mod) || 0;

					await actor.createEmbeddedDocuments("ActiveEffect", [
						{
							name: "Fortalecimento Sensorial (Verdadeiro)",
							changes: [
								{ key: "system.defense.bonus", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "10" },
								{ key: "system.skills.investigation.diceMod", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "1" },
								{ key: "system.skills.fighting.diceMod", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "1" },
								{ key: "system.skills.perception.diceMod", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "1" },
								{ key: "system.skills.aim.diceMod", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "1" },
								{ key: "system.skills.reflexes.mod", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "10" },
							],
							flags: {
								ordemparanormal: {
									ritualMeta: { enemyAttackPenalty: 1, immuneSurprise: true },
								},
							},
						},
					]);

					actor = refetch(actor);
					assert.equal(actor.system.defense.value, baseDefense + 10);
					assert.equal(Number(actor.system.skills.investigation.diceMod) || 0, 1);
					assert.equal(Number(actor.system.skills.fighting.diceMod) || 0, 1);
					assert.equal(Number(actor.system.skills.perception.diceMod) || 0, 1);
					assert.equal(Number(actor.system.skills.aim.diceMod) || 0, 1);
					assert.equal(Number(actor.system.skills.reflexes.mod) || 0, baseReflexes + 10);
				});
			});
		},
		{ displayName: "OP | Ritual Effects" }
	);
});
