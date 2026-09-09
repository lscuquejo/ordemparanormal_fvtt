/* eslint-disable indent */
/**
 * References and Codes of DND5e system:
 * https://github.com/foundryvtt/dnd5e/blob/a7f1404c7c38afa6d7dcc4f36a5fefd274034691/templates/chat/item-card.hbs
 * https://github.com/foundryvtt/dnd5e/blob/a7f1404c7c38afa6d7dcc4f36a5fefd274034691/module/documents/item.mjs#L1639
 */

import { getConditionDicePenalty } from "../helpers/condition-effects.mjs";
import { resolveAttackProfile } from "../helpers/attack-profiles.mjs";
import { getReactionEligibility } from "../helpers/reaction-helpers.mjs";
import {
	applyEnchantmentToWeapon,
	buildDecadenciaDiscenteEnchantment,
	buildEnchantmentData,
	getRitualSourceId,
	getWeaponFilterForRitual,
	isWeaponEnchantRitual,
	promptPickArmament,
} from "../helpers/ritual-enchantments.mjs";
import {
	allResistancesResolved,
	canUserRollResistance,
	getResistanceResult,
	getRitualResistanceSpec,
	resistanceBlocksEffect,
	upsertResistanceResult,
	resolveRitualTargetOutcome,
	ritualNeedsResistance,
	rollRitualResistanceForTarget,
	splitBuffResistanceTargets,
} from "../helpers/ritual-resistance.mjs";
import {
	applyEmbaralharOnMiss,
	applyRitualInstantEffects,
	buildAprimorarEffectData,
	buildRitualActiveEffectData,
	getAttributeUpcastBonus,
	getEffectiveAttributeValue,
	getEnemyAttackDicePenaltyFromTarget,
	getRitualCombatModifiers,
	getRitualTierEffectSpec,
	promptRitualEffectOptions,
	removeExistingRitualEffect,
} from "../helpers/ritual-effects.mjs";
import { getTierTargetingData, promptRitualTier, ritualHealAgeYears } from "../helpers/ritual-helpers.mjs";
import {
	castCinerariaZone,
	castPersistentRitualZone,
	parseRitualAreaRadiusMeters,
	resolveRitualAreaTargets,
	ritualTierPlacesPersistentZone,
	ritualTierUsesArea,
} from "../helpers/ritual-zones.mjs";
import {
	applyRitualStatusConditions,
	formatConditionList,
	getRitualConditionSpec,
	isNarrativeResistanceRitual,
	resolveRitualConditions,
} from "../helpers/ritual-conditions.mjs";
import {
	getActiveWeaponModifiers,
	getArmamentEnchantmentTotals,
	getEffectiveCriticalFormula,
} from "../helpers/weapon-modifiers.mjs";
import { damageRecipients } from "../helpers/visibility.mjs";

/**
 * Wrapper sobre `damageRecipients` que injeta `game.users` atual. O helper puro
 * vive em helpers/visibility.mjs e é coberto por unit test.
 */
function _damageRecipients(targetActor) {
	return damageRecipients(targetActor, game.users ?? []);
}

/** @param {Actor} actor @param {object|null} spec @param {boolean} passed @param {object} [context] */
async function _applyResolvedRitualConditions(actor, spec, passed, context = {}) {
	const ids = resolveRitualConditions(spec, passed);
	if (!actor || !ids.length) return [];
	const applied = await applyRitualStatusConditions(actor, ids, {
		origin: context.origin ?? "",
		ritualName: context.ritualName ?? "",
		duration: spec?.duration,
	});
	if (applied.length) {
		ChatMessage.create({
			content: game.i18n.format("op.ritualConditionApplied", {
				target: actor.name,
				conditions: formatConditionList(applied),
			}),
			speaker: ChatMessage.getSpeaker({ actor }),
			whisper: _damageRecipients(actor),
		});
	}
	return applied;
}

/** @param {ChatMessage|string|null|undefined} messageOrId */
async function _refreshChatMessage(messageOrId) {
	const message = typeof messageOrId === "string" ? game.messages.get(messageOrId) : messageOrId;
	if (!message?.id || !ui.chat?.updateMessage) return;
	await ui.chat.updateMessage(message);
}

/**
 * Extend the basic Item with some very simple modifications.
 * @extends {Item}
 */
export class OrdemItem extends Item {
	/**
	 * Augment the basic Item data model with additional dynamic data.
	 */
	prepareData() {
		// As with the actor class, items are documents that can have their data
		// preparation methods overridden (such as prepareBaseData()).
		super.prepareData();
	}

	/**
	 * Prepare a data object which is passed to any Roll formulas which are created related to this Item
	 * @private
	 */
	getRollData() {
		if (!this.actor) return { ...super.getRollData() };
		const rollData = this.actor.getRollData();
		rollData.item = foundry.utils.deepClone(this.system);

		return rollData;
	}

	/* -------------------------------------------- */
	/*  Chat Message Helpers                        */
	/* -------------------------------------------- */

	/**
	 * Apply listeners to chat messages.
	 * @param {HTML} html  Rendered chat message.
	 */
	static chatListeners(html) {
		// Remove listener antigo se existir para evitar duplicação
		if (html._ordemListener) {
			html.removeEventListener("click", html._ordemListener);
		}

		// Cria e armazena o listener
		html._ordemListener = (event) => {
			if (!event.target.closest(".card-buttons button")) return;
			// Skip chat command cards (/dt, /oposto) — they have their own click handlers
			const card = event.target.closest(".chat-card");
			if (card?.classList.contains("dt-card") || card?.classList.contains("oposto-request")) return;
			this._onChatCardAction(event);
		};

		html.addEventListener("click", html._ordemListener);
		// html.querySelector('.card-buttons button').addEventListener('click', this._onChatCardAction.bind(this));
		// html.on('click', '.item-name', this._onChatCardToggleContent.bind(this));
	}

	/* -------------------------------------------- */

	/**
	 * Handle execution of a chat card action via a click event on one of the card buttons
	 * @param {Event} event       The originating click event
	 * @returns {Promise}         A promise which resolves once the handler workflow is complete
	 * @private
	 */
	static async _onChatCardAction(event) {
		event.preventDefault();
		// Extract card data — click may land on an <i> inside the button.
		const button = event.target.closest?.("button") ?? event.target;
		button.disabled = true;
		const card = button.closest(".chat-card");
		const messageId = card.closest(".message").dataset.messageId;
		const message = game.messages.get(messageId);
		const action = button.dataset.action;

		// Recover the actor for the chat card
		const actor = await this._getChatCardActor(card);
		if (!actor) {
			button.disabled = false;
			return;
		}

		// Prefer the live actor item over the chat snapshot (snapshot tiers/flags go stale).
		const storedData = message.getFlag("ordemparanormal", "itemData");
		const liveItem = actor.items.get(card.dataset.itemId);
		const item = liveItem ?? (storedData ? new this(storedData, { parent: actor }) : null);

		// Verificar se o item existe antes de tentar usar seus métodos
		if (!item) {
			console.warn("Item não encontrado para ação de chat card.", {
				storedData: !!storedData,
				itemId: card.dataset.itemId,
				actorId: actor?.id,
				hasTokenId: !!card.dataset.tokenId,
			});
			ui.notifications.warn(game.i18n.localize("WARN.itemNotFoundOnActor"));
			button.disabled = false;
			return;
		}

		switch (action) {
			case "attack": {
				const rollAttack = await item.rollAttack({
					event: event,
				});
				item.lastMessageId = messageId;
				item.critical = rollAttack.criticalStatus;
				item.hitResult = rollAttack.hitResult ?? null;
				if (rollAttack.hitResult !== null) {
					game.messages.get(messageId)?.setFlag("ordemparanormal", "hitResult", rollAttack.hitResult);
				}
				break;
			}
			case "damage": {
				const persistedHit = message?.getFlag("ordemparanormal", "hitResult") ?? null;
				const volleyEntries = persistedHit?.attackResults;
				if (volleyEntries?.length) {
					// Multi-attack volley -> one damage roll per revealed attack (hit or
					// miss). Crit multipliers apply only to attacks that actually hit.
					await item.rollVolleyDamage(volleyEntries, { event });
				} else {
					// Single attack (or a chat reload that dropped in-memory state):
					// fall back to the persisted hitResult so apply-damage keeps working,
					// recovering the crit multiplier from the item's critical formula
					// (e.g. "19/x3" => 3) so x3/x4 weapons do not degrade to x2.
					const hitResult = item.hitResult ?? persistedHit;
					let critical = item.critical;
					const landed = hitResult?.hit !== false;
					if (landed && !critical && persistedHit?.isCritical) {
						// `this` is the OrdemItem class itself (static method context).
						critical = { isCritical: true, multiplier: this._parseCriticalMultiplier(item.system.critical) };
					} else if (!critical || !landed) {
						critical = false;
					}
					await item.rollDamage({
						event: event,
						critical,
						lastId: item.lastMessageId ? item.lastMessageId === messageId : true,
						hitResult,
					});
				}
				break;
			}
			case "formula":
				await item.rollFormula({ event });
				break;
			case "ritualRoll":
			case "ritualCast": {
				await item.useRitual({
					tierKey: button.dataset.rollKey || undefined,
					fromChat: true,
				});
				break;
			}
			case "applyDamage": {
				const applyMessage = game.messages.get(messageId);
				const damageTarget = applyMessage?.getFlag("ordemparanormal", "damageTarget");
				if (!damageTarget) break;
				// Guarda de idempotência: se já foi aplicado antes (re-render reabriu o
				// botão ou o GM clicou rápido o suficiente pra burlar o disable local),
				// não duplica. A flag é a source-of-truth persistida.
				if (applyMessage.getFlag("ordemparanormal", "damageApplied")) break;
				const targetActor = await fromUuid(damageTarget.actorUuid);
				if (!targetActor) break;
				const applyRoll = applyMessage.rolls?.[0];
				if (!applyRoll) break;
				const attackMsg = damageTarget.attackMessageId ? game.messages.get(damageTarget.attackMessageId) : null;
				const extraRD = attackMsg?.getFlag("ordemparanormal", "damageBlock")?.amount ?? 0;
				const result = await targetActor.applyDamage(applyRoll.total, {
					damageType: damageTarget.damageType,
					extraRD,
				});
				const blockedMsg = result.blocked > 0 ? game.i18n.format("op.damageBlocked", { blocked: result.blocked }) : "";
				ChatMessage.create({
					content: game.i18n.format("op.applyDamageResult", {
						amount: result.finalDamage,
						target: targetActor.name,
						blocked: blockedMsg,
					}),
					speaker: ChatMessage.getSpeaker({ actor: targetActor }),
					whisper: _damageRecipients(targetActor),
				});
				await applyMessage.setFlag("ordemparanormal", "damageApplied", {
					at: Date.now(),
					by: game.user.id,
					amount: result.finalDamage,
					targetUuid: damageTarget.actorUuid,
				});
				break;
			}
			case "teste":
				break;
		}

		// Re-enable the button
		button.disabled = false;
	}

	/**
	 * Get the Actor which is the author of a chat card
	 * @param {HTMLElement} card    The chat card being used
	 * @returns {Actor|null}        The Actor document or null
	 * @private
	 */
	static async _getChatCardActor(card) {
		// Case 1 - a synthetic actor from a Token
		if (card.dataset.tokenId) {
			const token = await fromUuid(card.dataset.tokenId);
			if (!token) return null;
			return token.actor;
		}

		// Case 2 - use Actor ID directory
		const actorId = card.dataset.actorId;
		const actor = game.actors.get(actorId);

		// Case 3 - Try to get token from current scene if actor is not linked
		// This helps when tokenId wasn't stored but actor has active tokens
		if (actor && !actor.prototypeToken?.actorLink) {
			const tokens = actor.getActiveTokens();
			if (tokens.length > 0) {
				console.log("Usando token ativo para ator não vinculado:", tokens[0].name);
				return tokens[0].actor;
			}
		}

		return actor || null;
	}

	/**
	 * Prepare an object of chat data used to display a card for the Item in the chat log.
	 * @param {object} htmlOptions    Options used by the TextEditor.enrichHTML function.
	 * @returns {object}              An object of chat data to render.
	 */
	async getChatData(htmlOptions = {}) {
		const data = this.toObject().system;

		// Rich text description
		data.description = await foundry.applications.ux.TextEditor.implementation.enrichHTML(data.description, {
			relativeTo: this,
			rollData: this.getRollData(),
			...htmlOptions,
		});

		// Rich text description
		data.chatDescription = await foundry.applications.ux.TextEditor.implementation.enrichHTML(data.chatDescription, {
			relativeTo: this,
			rollData: this.getRollData(),
			...htmlOptions,
		});

		return data;
	}

	/**
	 * Place an attack roll using an item (weapon, feat, spell, or equipment)
	 * Rely upon the d20Roll logic for the core implementation
	 */
	async rollAttack(options = {}) {
		if (!this.system.formulas.attack.attr || !this.system.formulas.attack.skill)
			throw new Error("This Item does not have a formula to roll!");

		// Multi-target + multi-attack scheduling unificado.
		//
		// Antes existiam dois loops separados (um para multi-alvo, outro para
		// numberOfAttacks > 1) e eles se combinavam multiplicativamente: criatura
		// com 2 ataques mirando 2 alvos disparava 4 rolagens, todas concentradas em
		// cada alvo. Pelas regras de Ordem Paranormal, a criatura pode DISTRIBUIR
		// seus ataques entre os alvos disponíveis. A solução é fazer round-robin:
		// `totalRolls = max(numAttacks, alvos)`, e cada ataque `i` vai para
		// `alvos[i % alvos.length]`.
		//
		// `_volleyId` identifica esta sequência de ataques inteira; é usado pelo
		// agregador de hitResult no item card para distinguir uma volley nova de
		// uma anterior, evitando que um miss em N+1 sobrescreva um hit em N.
		const isInnerRecursion = options._forcedTarget !== undefined || options._attackIndex !== undefined;
		if (!isInnerRecursion) {
			const numAttacks = this.system.numberOfAttacks ?? 1;
			const targetList = [...(game.user?.targets ?? new Set())];
			// Regra: numAttacks limita o ato físico; alvos selecionados orientam a
			// distribuição. Para o caso 1-ataque + N-alvos, mantemos o comportamento
			// histórico (N rolagens — uma por alvo).
			const totalRolls = numAttacks > 1 ? numAttacks : Math.max(targetList.length, 1);
			if (totalRolls > 1) {
				const volleyId = `${this.id}-${foundry.utils.randomID(8)}`;
				const showAttackIndex = numAttacks > 1;
				const results = [];
				for (let i = 0; i < totalRolls; i++) {
					const token = targetList.length > 0 ? targetList[i % targetList.length] : null;
					results.push(
						await this.rollAttack({
							...options,
							_forcedTarget: token,
							_attackIndex: showAttackIndex ? i + 1 : undefined,
							_attackTotal: showAttackIndex ? totalRolls : undefined,
							_volleyId: volleyId,
							_volleyFirst: i === 0,
						})
					);
				}
				// Build the volley's per-attack record from the in-memory `results`
				// (the authoritative source for each attack's hit / crit / target) and
				// surface it on `results[0].hitResult`. `_onChatCardAction("attack")`
				// persists it to the card flag; `_onChatCardAction("damage")` then
				// reads `attackResults` to roll damage ONCE PER HITTING ATTACK, each
				// doubled only if THAT attack rolled a critical and each routed to the
				// actor it struck (per OP multi-attack rules). Building from `results`
				// (not a chat-message lookup) makes it correct with or without a
				// target and independent of reveal/reaction state; a no-target attack
				// counts as "landed" (no defense to miss) so its damage still rolls.
				const attackResults = results.map((r, i) => {
					const hr = r?.hitResult ?? null;
					return {
						attackIndex: showAttackIndex ? i + 1 : null,
						attackMessageId: hr?.attackMessageId ?? null,
						hit: hr ? hr.hit === true : true,
						revealed: hr ? hr.revealed !== false : true,
						isCritical: Boolean(r?.criticalStatus?.isCritical),
						targetDefense: hr?.targetDefense ?? null,
						actorUuid: hr?.actorUuid ?? null,
					};
				});
				if (results[0]) {
					const firstHit = attackResults.find((a) => a.hit === true && a.revealed !== false) ?? attackResults[0] ?? null;
					results[0].hitResult = {
						...(results[0].hitResult ?? {}),
						volleyId,
						attackResults,
						hit: attackResults.some((a) => a.hit === true || a.revealed === false),
						revealed: attackResults.every((a) => a.revealed !== false),
						isCritical: attackResults.some((a) => a.isCritical === true && a.hit === true && a.revealed !== false),
						actorUuid: firstHit?.actorUuid ?? results[0].hitResult?.actorUuid ?? null,
						attackMessageId: firstHit?.attackMessageId ?? results[0].hitResult?.attackMessageId ?? null,
						targetDefense: firstHit?.targetDefense ?? results[0].hitResult?.targetDefense ?? null,
					};
				}
				return results[0];
			}
		}

		const profileResolved = options._attackProfile
			? resolveAttackProfile(options._attackProfile, this, this.actor)
			: null;
		const attack = profileResolved?.attack ?? options._formulaOverrides?.attack ?? this.system.formulas.attack;
		const skill = this.parent.system.skills[attack.skill];
		const attributeData = this.parent.system.attributes[attack.attr];
		const attributeDice = getEffectiveAttributeValue(attributeData);
		let attribute = attributeDice;
		let rollMode = "kh";

		if (attributeDice < 1) {
			attribute = 2;
			rollMode = "kl";
		}

		// Resolve target before dice math so defender ritual penalties (e.g. Fortalecimento
		// Sensorial Discente) can reduce attacker d20 count. Quando _forcedTarget veio do
		// scheduler (mesmo `null`), respeitamos a escolha — usar `??` aqui faria um null
		// explícito cair de volta na seleção atual do usuário e quebrar a distribuição
		// round-robin (atribuir alvo errado a um ataque que deveria ficar sem alvo).
		let targetToken;
		if ("_forcedTarget" in options) {
			targetToken = options._forcedTarget;
		} else {
			const _targets = game.user?.targets ?? new Set();
			targetToken = _targets.size === 1 ? [..._targets][0] : null;
		}

		const conditionDice = getConditionDicePenalty(this.actor, {
			skill: attack.skill,
			isAttack: true,
			isMelee: this.system.types?.rangeType?.name !== "ranged",
		});
		const ritualCombat = getRitualCombatModifiers(this.actor);
		const skillDiceMod = Number(skill?.diceMod) || 0;
		const enemyAttackDicePenalty = getEnemyAttackDicePenaltyFromTarget(targetToken?.actor);
		attribute = Math.max(
			1,
			Number(attribute) + conditionDice + (ritualCombat.diceAttack || 0) + skillDiceMod - enemyAttackDicePenalty
		);

		const enchTotals = this.type === "armament" ? getArmamentEnchantmentTotals(this) : { attackBonus: 0 };
		const weaponMods = profileResolved
			? { attackBonus: 0, damageBonuses: [], sources: profileResolved.sources }
			: getActiveWeaponModifiers(this.actor);
		const totalAttackBonus =
			(Number(attack.bonus) || 0) +
			(profileResolved ? 0 : weaponMods.attackBonus) +
			(enchTotals.attackBonus || 0) +
			(ritualCombat.attackBonus || 0) -
			(ritualCombat.attackPenalty || 0);

		const { parts, data } = CONFIG.Dice.BasicRoll.constructParts({
			degree: skill.degree.value || null,
			bonus: skill.value || null,
			modifier: skill.mod || null,
			attackBonus: totalAttackBonus || null,
		});

		const rollConfig = {
			parts: (parts ?? []).join(" + "),
			formula: `${attribute}d20${rollMode}`,
			data: this.getRollData(),
			chatMessage: true,
		};

		// Combina a fórmula do dado com os bônus
		rollConfig.formula = [rollConfig.formula].concat(parts ?? []).join(" + ");
		rollConfig.data = { ...(rollConfig.data ?? {}), ...data };

		// Realiza a rolagem
		const roll = await new Roll(rollConfig.formula, rollConfig.data).evaluate();

		// Verificações de Crítico
		const criticalStatus = this.isCritical({
			crtalFormula: this.type === "armament" ? getEffectiveCriticalFormula(this) : this.system.critical,
			roll,
		});

		const hitResult = targetToken ? this._compareWithDefense(targetToken.actor, roll.total, criticalStatus) : null;

		// Build the pending-reaction descriptor when the defender is an Agent (PCs only — Threats don't react).
		// Skip when the attacker IS the defender (counter-attacks), the attacker has no actor,
		// the defender has already spent their reaction this round, OR the defender has no
		// trained reaction that could legally apply to this attack — otherwise we'd hide the
		// result behind a panel that can never resolve to anything but Skip, needlessly
		// blocking damage application for untrained defenders.
		const defender = targetToken?.actor ?? null;
		const isAgentDefender = defender?.type === "agent";
		const currentRound = game.combat?.round ?? 0;
		const defenderReactionUsed = defender?.getFlag?.("ordemparanormal", "reactionUsedRound") ?? null;
		const defenderHasReaction = currentRound === 0 || defenderReactionUsed !== currentRound;
		const eligibility =
			isAgentDefender && defenderHasReaction
				? getReactionEligibility(defender, this, currentRound, defenderReactionUsed)
				: null;
		// Reaction panel gating:
		//   • Dodge/Block — pre-roll reactions; always relevant when the defender is
		//     trained and has a reaction available.
		//   • Counter-attack — post-roll, only triggers on a melee miss. Per the
		//     rules, the defender has ONE reaction per round and must commit blind
		//     (no peeking at hit/miss before choosing whether to spend it). So we
		//     surface the panel whenever counter-attack is eligible at the eligibility
		//     layer (already accounts for melee + trained + available); the panel's
		//     two-stage flow in chat-message.mjs handles "Skip → reveal → counter-attack
		//     if miss" on its own.
		//   • Ranged attacks against fighting-trained PCs get filtered out by the
		//     `!melee` guard inside getReactionEligibility, so no panel leaks there.
		const dodgeOrBlockEligible = Boolean(eligibility?.dodge.eligible || eligibility?.block.eligible);
		const fightingMatters = Boolean(eligibility?.counterAttack.eligible);
		const hasAnyEligibleReaction = dodgeOrBlockEligible || fightingMatters;
		// Capture the attacker's token at attack time so counter-attacks always target the
		// exact token that swung — for linked actors with multiple tokens on a scene
		// `getActiveTokens()[0]` would otherwise pick an arbitrary one.
		const attackerTokenUuid = this.actor?.token?.uuid ?? this.actor?.getActiveTokens?.()[0]?.document?.uuid ?? null;
		const reactionPending =
			isAgentDefender && defender.uuid !== this.actor?.uuid && defenderHasReaction && hasAnyEligibleReaction
				? {
						defenderUuid: defender.uuid,
						attackerUuid: this.actor?.uuid ?? null,
						attackerTokenUuid,
						itemUuid: this.uuid,
						isMelee: this.system.types?.rangeType?.name !== "ranged",
						round: currentRound,
				  }
				: null;

		// When a reaction is pending, the hit/miss block stays hidden for the defender until they respond.
		if (hitResult) {
			hitResult.baseDefense = hitResult.targetDefense;
			hitResult.revealed = !reactionPending;
		}

		// Envia para o chat
		if (rollConfig.chatMessage) {
			const flags = {
				"ordemparanormal.messageRoll": {
					type: "attack",
					itemId: this.id,
					itemUuid: this.uuid,
					isCritical: criticalStatus.isCritical,
				},
			};
			if (hitResult) flags["ordemparanormal.hitResult"] = hitResult;
			if (reactionPending) flags["ordemparanormal.reactionPending"] = reactionPending;
			// Stamp the attacker user id so the chat renderer can decide who's a
			// participant and thus allowed to see the hit/miss outcome. Without
			// this, the only "attacker" signal is `message.speaker.actor`, which
			// doesn't map 1:1 to a user (GM controlling NPC, shared actors, etc).
			flags["ordemparanormal.attackerUserId"] = game.userId;

			const targetName = targetToken?.name ?? null;
			// Hit/miss is intentionally absent from the flavor — it would leak to
			// every viewer in chat (including third-party agents not in the fight).
			// The result lives in the perspective-gated `.hit-result` DOM block
			// (chat-message.mjs#_renderHitResult) which is restricted to
			// participants (attacker, target owner, GM) via `isAttackParticipant`.
			// We keep the `→ TargetName` arrow as a neutral hint that this attack
			// landed on a specific token.
			const flavorSuffix = targetName ? ` → ${targetName}` : "";
			const attackIndexSuffix = options._attackIndex ? ` (${options._attackIndex}/${options._attackTotal})` : "";
			const attackName = profileResolved?.label ?? this.name;

			// Foundry assina `Roll.toMessage(messageData, { create, rollMode })`. Passar
			// `rollMode` DENTRO de `messageData` é silenciosamente ignorado — `applyRollMode`
			// nunca dispara e a mensagem herda o whisper do MJ atual. Isso era exatamente
			// a causa do bug #10 (contra-ataque do jogador vazando para gmroll do MJ).
			const attackMsg = await roll.toMessage(
				{
					speaker: ChatMessage.getSpeaker({ actor: this.actor }),
					flavor: `${game.i18n.format("op.attackedWith", { name: attackName })}${attackIndexSuffix}${flavorSuffix}`,
					flags,
				},
				{ rollMode: options.rollMode ?? game.settings.get("core", "rollMode") }
			);

			if (options._attackProfile?.id) {
				await attackMsg?.setFlag("ordemparanormal", "attackProfileId", options._attackProfile.id);
			}

			// Track the most recent attack message id on the item instance so a subsequent
			// rollDamage can correlate to the originating attack (used by the Bloqueio reaction).
			this.lastAttackMessageId = attackMsg?.id ?? null;
			if (hitResult) {
				hitResult.attackMessageId = this.lastAttackMessageId;
				// Also write the id onto the attack message's own flag — without this,
				// later mutations that rebroadcast hitResult (e.g. the reaction reveal
				// path syncing back to the item card) would overwrite the id with the
				// pre-toMessage value (null).
				if (attackMsg) await attackMsg.setFlag("ordemparanormal", "hitResult", hitResult);
			}

			// Persist hitResult onto the most-recent item card for this item so the
			// damage button state updates. Em volleys de multi-ataque, AGREGAMOS por
			// `_volleyId`: cada ataque empurra sua entrada para `attackResults` e os
			// campos top-level (hit, revealed, isCritical) refletem o "qualquer
			// acerto ainda em pé / qualquer reação ainda pendente". Sem isso, um miss
			// posterior na mesma volley sobrescrevia um hit anterior e travava o
			// botão de dano, exatamente o sintoma que o reviewer reportou.
			if (hitResult) {
				const itemId = this.id;
				const cardMsg = [...game.messages]
					.reverse()
					.find((m) => m.content?.includes(`data-item-id="${itemId}"`) && m.content?.includes("chat-card item-card"));
				if (cardMsg) {
					const previous = cardMsg.getFlag("ordemparanormal", "hitResult") ?? null;
					const volleyId = options._volleyId ?? null;
					const sameVolley = volleyId && previous?.volleyId === volleyId && !options._volleyFirst;
					const entry = {
						attackMessageId: hitResult.attackMessageId ?? null,
						attackIndex: options._attackIndex ?? null,
						hit: hitResult.hit,
						revealed: hitResult.revealed,
						isCritical: hitResult.isCritical,
						targetDefense: hitResult.targetDefense,
						actorUuid: hitResult.actorUuid,
					};
					const attackResults = sameVolley ? [...(previous.attackResults ?? []), entry] : [entry];
					const anyHitOrPending = attackResults.some((a) => a.hit === true || a.revealed === false);
					const allRevealed = attackResults.every((a) => a.revealed !== false);
					const anyCritical = attackResults.some((a) => a.isCritical === true && a.revealed !== false);
					const toWrite = {
						...hitResult,
						volleyId,
						attackResults,
						hit: anyHitOrPending,
						revealed: allRevealed,
						isCritical: anyCritical,
					};
					await cardMsg.setFlag("ordemparanormal", "hitResult", toWrite);
				}
			}

			if (hitResult?.revealed && hitResult.hit === false && defender) {
				await applyEmbaralharOnMiss(defender, {
					attacker: this.actor,
					message: attackMsg,
				});
			}
		}

		/**
		 * A hook event that fires after a formula has been rolled for an Item.
		 * @function ordemparanormal.rollFormula
		 * @memberof hookEvents
		 * @param {OrdemItem} item  Item for which the roll was performed.
		 * @param {Roll} roll       The resulting roll.
		 */
		Hooks.callAll("ordemparanormal.rollFormula", this, roll);

		return { roll, criticalStatus, hitResult };
	}

	/**
	 * Compare a roll result against a target actor's defense value.
	 * @param {Actor|null} targetActor  The actor being attacked.
	 * @param {number} rollTotal        The attack roll total.
	 * @param {object} criticalStatus   Result of isCritical().
	 * @returns {{hit: boolean, targetDefense: number, actorUuid: string, isCritical: boolean}|null}
	 */
	_compareWithDefense(targetActor, rollTotal, criticalStatus) {
		if (!targetActor) return null;
		const defense = targetActor.system?.defense?.value ?? 0;
		return {
			hit: rollTotal >= defense,
			targetDefense: defense,
			actorUuid: targetActor.uuid,
			isCritical: criticalStatus?.isCritical ?? false,
		};
	}

	/**
	 *
	 */
	/**
	 * Parse a weapon's critical formula (e.g. "19/x3", "x4", "20") into the multiplier.
	 * Defaults to 2 when no explicit multiplier is present.
	 * @param {string} formula
	 * @returns {number}
	 */
	static _parseCriticalMultiplier(formula) {
		const f = (formula ?? "").trim();
		if (!f) return 2;
		const xPart = f.includes("/") ? f.split("/").find((p) => p.includes("x")) : f.includes("x") ? f : null;
		if (!xPart) return 2;
		return Number(xPart.replaceAll("x", "")) || 2;
	}

	isCritical(critical = { isCritical: false }, options = {}) {
		const formulaCritical = (critical.crtalFormula ?? "").trim();

		// Separa os valores no formato 19/x3 pela barra e atribui
		// a variaveis com as respectivas conversões em qualquer ordem.
		if (formulaCritical && formulaCritical.includes("/")) {
			for (const crtalFor of formulaCritical.split("/")) {
				if (crtalFor.includes("x")) critical.multiplier = Number(crtalFor.replaceAll("x", ""));
				else critical.margin = Number(crtalFor);
			}
		} else {
			critical.multiplier = (formulaCritical.includes("x") && Number(formulaCritical.replaceAll("x", ""))) || 2;
			critical.margin = (!formulaCritical.includes("x") && Number(formulaCritical)) || 20;
		}
		critical.isCritical = (Number(critical.roll.result.split("+")[0]) || critical.roll.result) >= critical.margin && true;
		return critical;
	}

	/**
	 * Place an attack roll using an item (weapon, feat, spell, or equipment)
	 * Rely upon the d20Roll logic for the core implementation
	 */
	/**
	 * Roll attack using a saved attack profile (base weapon + manual mods + PE).
	 * @param {object} profile
	 * @param {object} [options]
	 */
	async rollAttackProfile(profile, options = {}) {
		if (!profile?.baseArmamentId || this.id !== profile.baseArmamentId) {
			const baseItem = this.actor?.items.get(profile?.baseArmamentId);
			if (!baseItem) {
				ui.notifications.warn(game.i18n.localize("op.attackProfileMissingWeapon"));
				return null;
			}
			return baseItem.rollAttackProfile(profile, options);
		}

		const peCost = Number(profile.peCost) || 0;
		if (peCost > 0) {
			const spent = await this.actor.spendPE(peCost);
			if (!spent) return null;
		}

		return this.rollAttack({ ...options, _attackProfile: profile });
	}

	/**
	 * @param {object} options
	 * @returns {object|null}
	 */
	_resolveAttackProfileFromOptions(options = {}) {
		if (options._attackProfile) return options._attackProfile;
		let profileId = options.attackProfileId;
		if (!profileId && options.hitResult?.attackMessageId) {
			const attackMessage = game.messages.get(options.hitResult.attackMessageId);
			profileId = attackMessage?.getFlag("ordemparanormal", "attackProfileId");
		}
		if (!profileId && options.attackMessage) {
			profileId = options.attackMessage.getFlag("ordemparanormal", "attackProfileId");
		}
		if (!profileId || !this.actor) return null;
		return (this.actor.system.attackProfiles ?? []).find((entry) => entry.id === profileId) ?? null;
	}

	async rollDamage(options = {}) {
		const profile = this._resolveAttackProfileFromOptions(options);
		const profileResolved = profile ? resolveAttackProfile(profile, this, this.actor) : null;
		const damageSource = profileResolved?.damage ?? options._formulaOverrides?.damage ?? this.system.formulas.damage;

		if (!damageSource?.formula) throw new Error("This Item does not have a formula to roll!");

		const prepareFormula = [];
		const damageTypes = [];

		// Damage Access
		const damage = damageSource;

		// Critical variable — auto-detect from hitResult if not explicitly passed.
		// O multiplier vem da fórmula da arma (e.g. "19/x3" → 3, "x4" → 4); usar `2`
		// hardcoded silenciava o `x3`/`x4` quando o caller passava só `hitResult`
		// (ex.: macros, callers diretos fora do `_onChatCardAction "damage"` que
		// já recupera via `_parseCriticalMultiplier`).
		const hitResult = options.hitResult ?? null;
		const critical =
			options.critical ||
			(hitResult?.isCritical
				? { isCritical: true, multiplier: this.constructor._parseCriticalMultiplier(this.system.critical) }
				: false);

		const split = damage.formula.split("d");
		if ((critical.isCritical && options.lastId) || options.event?.altKey) {
			prepareFormula.push(`${split[0] * (critical.multiplier ?? 2)}d${split[1]}`);
		} else {
			prepareFormula.push(damage.formula);
		}

		// Verify the attributes
		for (const [name, attrObject] of Object.entries(this.parent.system.attributes)) {
			if (name == damage.attr) prepareFormula.push(attrObject.value);
		}

		// Get the main type damage
		damageTypes.push(
			game.i18n.has("op.damageTypeAbv." + damage.type)
				? game.i18n.localize("op.damageTypeAbv." + damage.type)
				: game.i18n.localize("op.undefined")
		);

		// Get all the other formulas
		for (const parts of damage.parts) {
			prepareFormula.push(`(${parts[0] || 0})`);
			damageTypes.push(parts[1] ? game.i18n.localize("op.damageTypeAbv." + parts[1]) : "Indefinido");
		}

		const enchTotals =
			this.type === "armament" ? getArmamentEnchantmentTotals(this) : { damageBonuses: [], damageType: "" };
		for (const bonus of enchTotals.damageBonuses ?? []) {
			prepareFormula.push(`(${bonus})`);
			damageTypes.push(
				enchTotals.damageType && game.i18n.has(`op.damageTypeAbv.${enchTotals.damageType}`)
					? game.i18n.localize(`op.damageTypeAbv.${enchTotals.damageType}`)
					: ""
			);
		}

		if (!profileResolved) {
			const weaponMods = getActiveWeaponModifiers(this.actor);
			for (const bonus of weaponMods.damageBonuses) {
				prepareFormula.push(`(${bonus})`);
				damageTypes.push("");
			}
		}

		const ritualCombat = getRitualCombatModifiers(this.actor);
		if (ritualCombat.meleeDamageBonus && this.system.types?.rangeType?.name !== "ranged") {
			prepareFormula.push(String(ritualCombat.meleeDamageBonus));
			damageTypes.push("");
		}

		// Combine all formulas and types
		const formulas = prepareFormula.join("+");
		const types = damageTypes.join("+").replaceAll("+", " + ");

		const rollConfig = {
			formula: formulas,
			data: this.getRollData(),
			chatMessage: true,
		};

		const roll = await new Roll(rollConfig.formula, rollConfig.data).evaluate();

		if (rollConfig.chatMessage) {
			const flags = {};
			// Only enable auto-apply when the entire roll uses a single damage type.
			// Mixed-type rolls (e.g. 1d6 cutting + 1d6 fire) would resolve incorrectly
			// against a single resistance — leave those for manual GM application.
			const partTypes = (damage.parts ?? []).map((p) => p?.[1]).filter(Boolean);
			const hasMixedTypes = partTypes.some((t) => t !== damage.type);
			if (hitResult?.actorUuid && !hasMixedTypes) {
				flags["ordemparanormal.damageTarget"] = {
					actorUuid: hitResult.actorUuid,
					damageType: damage.type,
					attackMessageId: options.attackMessageId ?? hitResult.attackMessageId ?? this.lastAttackMessageId ?? null,
				};
			}
			// Mesma correção do attack roll: `rollMode` precisa ir no segundo argumento.
			await roll.toMessage(
				{
					speaker: ChatMessage.getSpeaker({ actor: this.actor }),
					flavor:
						game.i18n.format("op.rollDamageChat", { name: this.name, types: types }) +
						(options._attackIndex ? ` (${options._attackIndex}/${options._attackTotal})` : ""),
					flags: Object.keys(flags).length ? flags : undefined,
				},
				{ rollMode: game.settings.get("core", "rollMode") }
			);
		}

		/**
		 * A hook event that fires after a formula has been rolled for an Item.
		 * @function ordemparanormal.rollFormula
		 * @memberof hookEvents
		 * @param {Ordemitem} item  Item for which the roll was performed.
		 * @param {Roll} roll       The resulting roll.
		 */
		Hooks.callAll("ordemparanormal.rollFormula", this, roll);

		return roll;
	}

	/**
	 * Roll damage once per revealed attack in a multi-attack volley (hit or miss).
	 * Crit multipliers apply only when that attack actually hit. Pending reactions
	 * (revealed === false) are skipped until resolved.
	 * @param {Array<object>} attackResults  Per-attack records from the card flag.
	 * @param {object} [options]
	 * @param {Event}  [options.event]       Originating click (altKey forces crit).
	 * @returns {Promise<Roll[]>}            One Roll per revealed attack.
	 */
	async rollVolleyDamage(attackResults, { event } = {}) {
		const entries = attackResults ?? [];
		const rollable = entries.filter((a) => a?.revealed !== false);
		const rolls = [];
		for (const atk of rollable) {
			const landed = atk.hit === true;
			const critical =
				landed && atk.isCritical
					? { isCritical: true, multiplier: this.constructor._parseCriticalMultiplier(this.system.critical) }
					: false;
			rolls.push(
				await this.rollDamage({
					event,
					critical,
					lastId: true,
					hitResult: {
						actorUuid: atk.actorUuid ?? null,
						attackMessageId: atk.attackMessageId ?? null,
						isCritical: landed && Boolean(atk.isCritical),
						hit: landed,
					},
					_attackIndex: atk.attackIndex ?? null,
					_attackTotal: entries.length,
				})
			);
		}
		return rolls;
	}

	/**
	 * Trigger an item usage, optionally creating a chat message with followup actions.
	 **/
	async use(config = {}, options = {}) {
		const item = this;
		// const is = item.system;
		// const as = item.actor.system;

		// options = {
		// 	createMessage: false
		// };

		// Prepare card data & display it if options.createMessage is true
		const cardData = await item.roll(options);
		return cardData;
	}

	/**
	 * Handle clickable rolls.
	 * @param {Event} event   The originating click event
	 * @private
	 */
	async roll() {
		const item = this;

		// Initialize chat data.
		const speaker = ChatMessage.getSpeaker({ actor: this.actor });
		const rollMode = game.settings.get("core", "rollMode");
		// const label = 'Exibindo um(a) ' + game.i18n.localize('TYPES.Item.' + item.type) + ` (${item.name}):`;

		// Render the chat card template
		// Tenta obter o token de várias formas para garantir compatibilidade com tokens vinculados e não vinculados
		const token = this.actor.token || this.actor.getActiveTokens()?.[0] || null;
		const targets = [...(game.user?.targets ?? new Set())];
		const targetNames = targets.map((t) => t?.name).filter(Boolean);
		const targetText =
			targetNames.length === 0
				? null
				: targetNames.length === 1
				? targetNames[0]
				: `${targetNames.length} ${game.i18n.localize("op.targetsLabel")}: ${targetNames.join(", ")}`;
		const templateData = {
			actor: this.actor,
			tokenId: token?.uuid || null,
			item: this,
			data: await this.getChatData(),
			labels: this.labels,
			i18n: {},
			info: [],
			targetName: targetText,
		};

		if (item.type == "armament") {
			if (this.system?.proficiency)
				templateData.info.push(game.i18n.localize("op.proficiencyChoices." + this.system.proficiency));
			if (this.system?.critical) templateData.info.push(this.system.critical);
			if (this.system.types?.gripType)
				templateData.info.push(game.i18n.localize("op.weaponGripTypeChoices." + this.system.types.gripType));
			if (this.system.types?.rangeType?.name)
				templateData.info.push(game.i18n.localize("op.weaponTypeChoices." + this.system.types.rangeType.name));
			if (this.system.types?.damageType)
				templateData.info.push(game.i18n.localize("op.damageTypeChoices." + this.system.types.damageType));
			if (this.system.conditions?.improvised) templateData.info.push(game.i18n.localize("op.improvised"));
			if (this.system.conditions?.throwable) templateData.info.push(game.i18n.localize("op.throwable"));
			if (this.system.conditions?.agile) templateData.info.push(game.i18n.localize("op.agile"));
			if (this.system.conditions?.automatic) templateData.info.push(game.i18n.localize("op.automatic"));
			if (this.system.conditions?.adaptableGrip) templateData.info.push(game.i18n.localize("op.adaptableGrip"));
			if (this.system.conditions?.pistolBlow) templateData.info.push(game.i18n.localize("op.pistolBlow"));
		}

		if (item.type == "ritual") {
			templateData.ritualTiers = item.getRitualTiers();
			templateData.ritualRolls = item.getRitualRolls();
			if (this.system?.area.name && this.system.target == "area") {
				const area = {
					name: game.i18n.localize("op.areaChoices." + this.system.area.name),
					type: game.i18n.localize("op.areaTypeChoices." + this.system.area.type),
					size: this.system.area.size,
				};
				if (this.system?.area.name == "cone" || this.system?.area.name == "sphere") {
					templateData.i18n.areaLabel = game.i18n.format("op.areaLabelSphereCone", area);
				} else {
					templateData.i18n.areaLabel = game.i18n.format("op.areaLabelCubeLine", area);
				}
			}
		}

		const html = await foundry.applications.handlebars.renderTemplate(
			"systems/ordemparanormal/templates/chat/item-card.hbs",
			templateData
		);

		const chatMessageData = {
			speaker: speaker,
			rollMode: rollMode,
			content: html,
			flags: {
				"ordemparanormal.itemData": item.toObject(),
			},
		};

		// Whisper to GM if roll mode is set to GM rolls
		if (rollMode == "blindroll") chatMessageData.whisper = ChatMessage.getWhisperRecipients("GM");
		if (rollMode == "selfroll") chatMessageData.whisper = [game.user.id];
		if (rollMode == "gmroll") {
			const gmUsers = game.users.filter((u) => u.isGM).map((u) => u.id);
			chatMessageData.whisper = [...new Set([...gmUsers, game.user.id])].flat();
		}
		const message = await ChatMessage.create(chatMessageData);

		Hooks.callAll("ordemparanormal.itemUsed", {
			item: this,
			actor: this.actor,
			token,
			message,
			chatMessageData,
		});
	}

	/**
	 * Prepare data needed to roll an attack using an item (weapon, feat, spell, or equipment)
	 * and then pass it off to `d20Roll`.
	 * @param {object} [options]
	 * @param {boolean} [options.spellLevel]  Level at which a spell is cast.
	 * @returns {Promise<Roll>}   A Promise which resolves to the created Roll instance.
	 */
	/**
	 * @param {string|null} [kind]
	 * @returns {object[]}
	 */
	getRitualTiers(kind = null) {
		const basePe = Number(this.system.basePeCost ?? this.getFlag("ordemparanormal")?.peCost ?? 0);
		let raw = this.system.tiers?.length ? [...this.system.tiers] : [...(this.system.rolls ?? [])];
		if (!raw.length) {
			raw = OrdemItem._synthesizeRitualTiers(this, basePe);
		} else {
			// World items often only keep the Base row — still expose Discente/Verdadeiro when enabled.
			raw = OrdemItem._ensureEnhancementTiers(this, raw, basePe);
		}
		const knownKeys = new Set(["base", "discente", "verdadeiro"]);
		return raw
			.filter((entry) => entry && (!kind || entry.kind === kind))
			.map((entry) => {
				const label = entry.label || "Base";
				let key = String(entry.key || "").trim();
				if (!knownKeys.has(key)) {
					const norm = String(label)
						.normalize("NFD")
						.replace(/[\u0300-\u036f]/g, "")
						.toLowerCase();
					if (norm.includes("discente")) key = "discente";
					else if (norm.includes("verdadeiro")) key = "verdadeiro";
					else key = "base";
				}
				return {
					...entry,
					key,
					label,
					peCost: Number.isFinite(Number(entry.peCost)) ? Number(entry.peCost) : basePe,
					kind: entry.kind ?? "efeito",
					damageType: entry.damageType ?? "",
					formula: entry.formula ?? "",
				};
			});
	}

	/**
	 * Ensure Discente/Verdadeiro rows exist when the ritual has those forms.
	 * @param {Item} item
	 * @param {object[]} tiers
	 * @param {number} basePe
	 * @returns {object[]}
	 */
	static _ensureEnhancementTiers(item, tiers, basePe = 0) {
		const list = [...tiers];
		const description = item.system?.description ?? "";
		const hasKey = (key) =>
			list.some((entry) => {
				const k = String(entry?.key || "").trim();
				const label = String(entry?.label || "")
					.normalize("NFD")
					.replace(/[\u0300-\u036f]/g, "")
					.toLowerCase();
				return k === key || label.includes(key);
			});

		const parseEnhCost = (label) => {
			const re = new RegExp(`<strong>\\s*${label}[^<]*\\(\\+(\\d+)\\s*PE\\)`, "i");
			const match = description.match(re);
			return match ? Number(match[1]) || 0 : 0;
		};

		if ((item.system?.studentForm || /<strong>\s*Discente/i.test(description)) && !hasKey("discente")) {
			list.push({
				key: "discente",
				label: "Discente",
				peCost: basePe + parseEnhCost("Discente"),
				formula: "",
				kind: "efeito",
				damageType: "",
			});
		}
		if ((item.system?.trueForm || /<strong>\s*Verdadeiro/i.test(description)) && !hasKey("verdadeiro")) {
			list.push({
				key: "verdadeiro",
				label: "Verdadeiro",
				peCost: basePe + parseEnhCost("Verdadeiro"),
				formula: "",
				kind: "efeito",
				damageType: "",
			});
		}
		return list;
	}

	/**
	 * Fallback when pack/world items lack a populated `system.tiers` array.
	 * @param {Item} item
	 * @param {number} basePe
	 * @returns {object[]}
	 */
	static _synthesizeRitualTiers(item, basePe = 0) {
		const description = item.system?.description ?? "";
		const tiers = [{ key: "base", label: "Base", peCost: basePe, formula: "", kind: "efeito", damageType: "" }];

		const parseEnhCost = (label) => {
			const re = new RegExp(`<strong>\\s*${label}[^<]*\\(\\+(\\d+)\\s*PE\\)`, "i");
			const match = description.match(re);
			return match ? Number(match[1]) || 0 : 0;
		};

		if (item.system?.studentForm || /<strong>\s*Discente/i.test(description)) {
			tiers.push({
				key: "discente",
				label: "Discente",
				peCost: basePe + parseEnhCost("Discente"),
				formula: "",
				kind: "efeito",
				damageType: "",
			});
		}
		if (item.system?.trueForm || /<strong>\s*Verdadeiro/i.test(description)) {
			tiers.push({
				key: "verdadeiro",
				label: "Verdadeiro",
				peCost: basePe + parseEnhCost("Verdadeiro"),
				formula: "",
				kind: "efeito",
				damageType: "",
			});
		}
		return tiers;
	}

	/** @deprecated use getRitualTiers */
	getRitualRolls(kind = null) {
		return this.getRitualTiers(kind).filter((entry) => entry.formula);
	}

	/**
	 * @returns {string[]}
	 */
	_getRitualTargetUuids(rangeOverride = this.system.range) {
		const targets = [...(game.user?.targets ?? [])];
		const uuids = targets.map((t) => t.actor?.uuid).filter(Boolean);
		if (uuids.length) return uuids;
		if (rangeOverride === "personal") return [this.actor.uuid];
		return [];
	}

	/**
	 * @param {object} tier
	 * @param {string[]} targetUuids
	 */
	async _activateRitualBuff(tier, targetUuids, options = {}) {
		const { conditionIds, conditionDuration, ...buffOptions } = options;
		const effectData = buildRitualActiveEffectData(this, tier, buffOptions);
		if (!effectData && !conditionIds?.length) return false;

		const ritualId = getRitualSourceId(this);
		const spec = getRitualTierEffectSpec(ritualId, tier.key);
		if (spec?.attributeChoice?.length && !buffOptions.attributeKey) {
			ui.notifications.warn(game.i18n.localize("op.ritualNeedsAttribute"));
			return false;
		}
		if (spec?.attributeBonus && buffOptions.attributeKey && !effectData?.changes?.length) {
			ui.notifications.error(
				game.i18n.format("op.ritualAttributeEffectFailed", {
					name: this.name,
					tier: tier.label,
				})
			);
			return false;
		}

		const standaloneConditions = conditionIds ?? [];
		const hasChanges = Boolean(effectData?.changes?.length);
		const hasInstant = Boolean(effectData?.flags?.ordemparanormal?.ritualInstant?.tempHP);
		const isDurationTracker = !["instantaneous", ""].includes(this.system.duration);

		for (const actorUuid of targetUuids) {
			const targetActor = await fromUuid(actorUuid);
			if (!targetActor) continue;
			await removeExistingRitualEffect(targetActor, this.uuid, getRitualSourceId(this));

			if (effectData && (hasChanges || hasInstant || isDurationTracker)) {
				await targetActor.createEmbeddedDocuments("ActiveEffect", [effectData]);
				await applyRitualInstantEffects(targetActor, effectData);
			}

			if (standaloneConditions.length) {
				const applied = await applyRitualStatusConditions(targetActor, standaloneConditions, {
					origin: this.uuid,
					ritualName: this.name,
					duration: conditionDuration,
				});
				if (applied.length) {
					ChatMessage.create({
						content: game.i18n.format("op.ritualConditionApplied", {
							target: targetActor.name,
							conditions: formatConditionList(applied),
						}),
						speaker: ChatMessage.getSpeaker({ actor: targetActor }),
						whisper: _damageRecipients(targetActor),
					});
				}
			}
		}

		return true;
	}

	/**
	 * @param {object} tier
	 * @param {string[]} targetUuids
	 * @returns {Promise<Roll|null>}
	 */
	async _rollRitualTier(tier, targetUuids) {
		if (!tier.formula) return null;

		const roll = await new Roll(tier.formula, this.getRollData()).evaluate();
		const targetData = {
			actorUuids: targetUuids,
			kind: tier.kind,
			rollKey: tier.key,
			itemId: this.id,
			ritualId: getRitualSourceId(this),
			ritualName: this.name,
			damageType: tier.damageType ?? "",
		};

		const opFlags = {};
		if (tier.kind === "cura" || tier.kind === "pv_temporarios") {
			opFlags.healTarget = targetData;
		} else if (tier.kind === "dano") {
			const ritualId = getRitualSourceId(this);
			const resistanceSpec = getRitualResistanceSpec(this, tier);
			opFlags.damageTarget = {
				actorUuids: targetUuids,
				damageType: tier.damageType ?? "",
				ritualRoll: true,
				ritualId,
				tierKey: tier.key,
				tierLabel: tier.label,
				casterUuid: this.actor?.uuid ?? "",
				ritualDT: Number(this.actor?.system?.ritual?.DT) || 0,
				ritualName: this.name,
				resistanceSpec,
				conditionSpec: getRitualConditionSpec(this, tier),
				awaitingResistance: ritualNeedsResistance(resistanceSpec),
				grantsCasterTempFromTotal: ritualId === "consumir-manancial" && tier.key === "verdadeiro",
			};
		}

		const message = await roll.toMessage(
			{
				speaker: ChatMessage.getSpeaker({ actor: this.actor }),
				flavor: game.i18n.format("op.rollRitualEffectChat", {
					name: this.name,
					label: tier.label,
					formula: tier.formula,
					pe: tier.peCost,
				}),
				flags: Object.keys(opFlags).length ? { ordemparanormal: opFlags } : undefined,
			},
			{ rollMode: game.settings.get("core", "rollMode") }
		);

		if (tier.kind === "dano" && opFlags.damageTarget?.awaitingResistance) {
			await OrdemItem.createRitualResistanceMessage(message, opFlags.damageTarget);
		}

		Hooks.callAll("ordemparanormal.rollRitualEffect", this, roll, tier);
		return { roll, message };
	}

	/**
	 * Message 2 — resistance tests (separate from the damage roll message).
	 * @param {ChatMessage} damageMessage
	 * @param {object} damageTarget
	 */
	static async createRitualResistanceMessage(damageMessage, damageTarget) {
		const targetNames = [];
		for (const uuid of damageTarget.actorUuids ?? []) {
			const actor = await fromUuid(uuid);
			if (actor) targetNames.push(actor.name);
		}

		const resistMessage = await ChatMessage.create({
			speaker: damageMessage.speaker,
			content: game.i18n.format("op.ritualResistancePrompt", {
				ritual: damageTarget.ritualName,
				tier: damageTarget.tierLabel ?? damageTarget.tierKey ?? "",
				targets: targetNames.join(", "),
				skill: damageTarget.resistanceSpec?.label ?? "",
				dt: damageTarget.ritualDT ?? 0,
			}),
			flags: {
				ordemparanormal: {
					ritualResistancePending: {
						damageMessageId: damageMessage.id,
						...damageTarget,
						targetUuids: damageTarget.actorUuids ?? [],
					},
					resistanceResults: [],
				},
			},
		});

		await damageMessage.setFlag("ordemparanormal", "damageTarget", {
			...damageTarget,
			awaitingResistance: true,
			resistanceMessageId: resistMessage.id,
		});

		return resistMessage;
	}

	/**
	 * Cast a ritual: pick tier, spend PE, roll or activate on target(s).
	 * @param {object} [options]
	 * @param {string} [options.tierKey]
	 * @returns {Promise<object|null>}
	 */
	async useRitual({ tierKey } = {}) {
		if (this.type !== "ritual" || !this.actor) return null;

		const tiers = this.getRitualTiers();
		if (!tiers.length) {
			ui.notifications.warn(game.i18n.localize("op.ritualNoTiers"));
			return null;
		}

		let tier = tierKey ? tiers.find((entry) => entry.key === tierKey) : null;
		if (!tier) tier = await promptRitualTier(this);
		if (!tier) return null;

		if (isWeaponEnchantRitual(this)) {
			return this._useWeaponEnchantRitual(tier);
		}

		const ritualId = getRitualSourceId(this);
		if (ritualId === "cineraria") {
			return this._useCinerariaRitual(tier);
		}
		if (ritualId === "aprimorar-fisico" || ritualId === "aprimorar-mente") {
			return this._useAprimorarRitual(tier, ritualId);
		}
		if (ritualId === "decadencia" && tier.key === "discente") {
			return this._useDecadenciaDiscenteRitual(tier);
		}
		if (ritualTierPlacesPersistentZone(this, tier)) {
			return this._usePersistentZoneRitual(tier);
		}

		const usesArea =
			ritualTierUsesArea(this, tier) && Boolean(tier.formula) && !ritualTierPlacesPersistentZone(this, tier);
		let resolvedTargets = [];
		let areaTemplate = null;

		if (usesArea) {
			const areaResult = await resolveRitualAreaTargets(this, tier, this.actor);
			if (!areaResult) return null;
			resolvedTargets = areaResult.targetUuids;
			areaTemplate = areaResult.templateDoc;
			if (!resolvedTargets.length) {
				ui.notifications.info(game.i18n.localize("op.ritualAreaNoTargets"));
			}
		} else {
			const tierTargeting = getTierTargetingData(this, tier);
			const needsTarget =
				tierTargeting.requiresTargetSelection ||
				(!["personal"].includes(tierTargeting.range) && Boolean(this.system.target) && ritualId !== "cineraria");
			const targetUuids = this._getRitualTargetUuids(tierTargeting.range);
			if (needsTarget && !targetUuids.length) {
				ui.notifications.warn(game.i18n.localize("op.ritualNeedsTarget"));
				return null;
			}
			resolvedTargets = targetUuids.length ? targetUuids : [this.actor.uuid];
		}

		const buffKinds = ["efeito", "auxilio"];
		const willBuff =
			!tier.formula &&
			(buffKinds.includes(tier.kind) || ["scene", "sustained", "setDuration"].includes(this.system.duration));
		let ritualOptions = {};
		if (willBuff) {
			// Persist recovered source id only on real embedded items (chat snapshots can't setFlag).
			if (this.isEmbedded && !this.getFlag("ordemparanormal", "ritualSourceId") && ritualId) {
				await this.setFlag("ordemparanormal", "ritualSourceId", ritualId);
			}
			ritualOptions = await promptRitualEffectOptions(this, tier);
			if (ritualOptions === null) return null;
			const needsAttribute = getRitualTierEffectSpec(ritualId, tier.key)?.attributeChoice?.length;
			if (needsAttribute && !ritualOptions.attributeKey) {
				ui.notifications.warn(game.i18n.localize("op.ritualNeedsAttribute"));
				return null;
			}
		}

		const spent = await this.actor.spendPE(tier.peCost);
		if (!spent) return null;

		const targetNames = [];
		for (const uuid of resolvedTargets) {
			const actor = await fromUuid(uuid);
			if (actor) targetNames.push(actor.name);
		}

		const targetsLabel = usesArea
			? targetNames.length
				? targetNames.join(", ")
				: game.i18n.localize("op.ritualAreaEmpty")
			: targetNames.join(", ");

		await ChatMessage.create({
			speaker: ChatMessage.getSpeaker({ actor: this.actor }),
			content: game.i18n.format("op.ritualCastMessage", {
				ritual: this.name,
				tier: tier.label,
				pe: tier.peCost,
				targets: targetsLabel,
			}),
		});

		if (tier.formula) {
			const rollResult = await this._rollRitualTier(tier, resolvedTargets);
			if (tier.kind === "pv_temporarios" && rollResult?.roll) {
				const applied = await OrdemItem._applyTemporaryFromRoll(this, rollResult.roll, tier, resolvedTargets);
				if (applied.length && rollResult.message) {
					await rollResult.message.setFlag("ordemparanormal", "healApplied", {
						at: Date.now(),
						by: game.user.id,
						amount: rollResult.roll.total,
						targetUuids: resolvedTargets,
						kind: "pv_temporarios",
					});
				}
			}
		} else if (willBuff) {
			const resistanceSpec = getRitualResistanceSpec(this, tier);
			const conditionSpec = getRitualConditionSpec(this, tier);
			const { selfTargets, otherTargets } = splitBuffResistanceTargets(this.actor.uuid, resolvedTargets);
			const buffOptions = {
				...ritualOptions,
				conditionIds: resolveRitualConditions(conditionSpec, false),
				conditionDuration: conditionSpec.duration,
			};

			if (selfTargets.length) {
				const activatedSelf = await this._activateRitualBuff(tier, selfTargets, buffOptions);
				if (activatedSelf && !otherTargets.length) {
					const bonus = getAttributeUpcastBonus(tier.key);
					const attr = ritualOptions.attributeKey;
					ui.notifications.info(
						attr
							? game.i18n.format("op.ritualAttributeApplied", {
									name: this.name,
									tier: tier.label,
									bonus,
									attribute: attr,
							  })
							: game.i18n.format("op.ritualActivated", { name: this.name, tier: tier.label })
					);
				}
			}

			if (!otherTargets.length) {
				// Willing self-buff: no resistance roll.
			} else if (ritualNeedsResistance(resistanceSpec)) {
				const otherNames = [];
				for (const uuid of otherTargets) {
					const actor = await fromUuid(uuid);
					if (actor) otherNames.push(actor.name);
				}
				await ChatMessage.create({
					speaker: ChatMessage.getSpeaker({ actor: this.actor }),
					content: game.i18n.format("op.ritualResistancePrompt", {
						ritual: this.name,
						tier: tier.label,
						targets: otherNames.join(", "),
						skill: resistanceSpec.label,
						dt: Number(this.actor.system.ritual?.DT) || 0,
					}),
					flags: {
						ordemparanormal: {
							ritualEffectPending: {
								itemUuid: this.uuid,
								casterUuid: this.actor.uuid,
								parentActorUuid: this.actor.uuid,
								tierKey: tier.key,
								targetUuids: otherTargets,
								resistanceSpec,
								conditionSpec,
								ritualDT: Number(this.actor.system.ritual?.DT) || 0,
								ritualName: this.name,
								ritualOptions,
							},
							resistanceResults: [],
						},
					},
				});
			} else {
				const activated = await this._activateRitualBuff(tier, otherTargets, buffOptions);
				if (activated) {
					const bonus = getAttributeUpcastBonus(tier.key);
					const attr = ritualOptions.attributeKey;
					ui.notifications.info(
						attr
							? game.i18n.format("op.ritualAttributeApplied", {
									name: this.name,
									tier: tier.label,
									bonus,
									attribute: attr,
							  })
							: game.i18n.format("op.ritualActivated", { name: this.name, tier: tier.label })
					);
				}
			}
		}

		Hooks.callAll("ordemparanormal.ritualUsed", this, tier, resolvedTargets);
		return { tier, targetUuids: resolvedTargets, areaTemplate };
	}

	/**
	 * Aprimorar Físico / Mente — Base +1, Discente +2, Verdadeiro +3 on a chosen attribute.
	 * Dedicated path so upcasts cannot fall back to the Base bonus.
	 * @param {object} tier
	 * @param {string} ritualId
	 */
	async _useAprimorarRitual(tier, ritualId) {
		const attributeChoices = ritualId === "aprimorar-mente" ? ["int", "pre"] : ["dex", "str"];
		const bonus = getAttributeUpcastBonus(tier.key);
		const labels = {
			dex: game.i18n.localize("op.dexAbv"),
			str: game.i18n.localize("op.strAbv"),
			int: game.i18n.localize("op.intAbv"),
			pre: game.i18n.localize("op.preAbv"),
		};

		let attributeKey;
		try {
			attributeKey = await foundry.applications.api.DialogV2.wait({
				window: { title: game.i18n.format("op.ritualAttributePromptTitle", { name: this.name }) },
				content: `<p>${game.i18n.format("op.ritualAttributePromptHint", { bonus })}</p>
<p><em>${tier.label} — ${tier.peCost} PE</em></p>`,
				buttons: attributeChoices.map((key) => ({
					action: key,
					label: `${labels[key] ?? key} (+${bonus})`,
					callback: () => key,
				})),
				rejectClose: false,
			});
		} catch {
			return null;
		}
		if (!attributeKey) return null;

		const targetUuids = this._getRitualTargetUuids(this.system.range);
		if (!targetUuids.length) {
			ui.notifications.warn(game.i18n.localize("op.ritualNeedsTarget"));
			return null;
		}

		const spent = await this.actor.spendPE(tier.peCost);
		if (!spent) return null;

		const originItem = this.isEmbedded ? this : this.actor.items.get(this.id) ?? this;
		const originUuid = originItem.uuid;
		const targetNames = [];

		for (const actorUuid of targetUuids) {
			const targetActor = await fromUuid(actorUuid);
			if (!targetActor) continue;
			targetNames.push(targetActor.name);
			await removeExistingRitualEffect(targetActor, originUuid, ritualId);

			const { effectData } = buildAprimorarEffectData({
				ritualName: this.name,
				ritualId,
				tierKey: tier.key,
				tierLabel: tier.label,
				attributeKey,
				img: this.img,
				origin: originUuid,
				durationKey: this.system.duration || "scene",
				attributeLabel: labels[attributeKey] ?? attributeKey,
			});
			await targetActor.createEmbeddedDocuments("ActiveEffect", [effectData]);
		}

		await ChatMessage.create({
			speaker: ChatMessage.getSpeaker({ actor: this.actor }),
			content: game.i18n.format("op.ritualCastMessage", {
				ritual: this.name,
				tier: tier.label,
				pe: tier.peCost,
				targets: targetNames.join(", "),
			}),
		});

		ui.notifications.info(
			game.i18n.format("op.ritualAttributeApplied", {
				name: this.name,
				tier: tier.label,
				bonus,
				attribute: labels[attributeKey] ?? attributeKey,
			})
		);

		Hooks.callAll("ordemparanormal.ritualUsed", this, tier, targetUuids);
		return { tier, targetUuids, attributeKey, bonus };
	}

	/**
	 * Decadência (Discente) — 1-turn weapon damage bonus + melee attack, no resistance.
	 * @param {object} tier
	 */
	async _useDecadenciaDiscenteRitual(tier) {
		const targetUuids = this._getRitualTargetUuids();
		if (!targetUuids.length) {
			ui.notifications.warn(game.i18n.localize("op.ritualNeedsTarget"));
			return null;
		}

		const weapon = await promptPickArmament(this.actor, { meleeOnly: true });
		if (!weapon) return null;

		const spent = await this.actor.spendPE(tier.peCost);
		if (!spent) return null;

		const enchantment = buildDecadenciaDiscenteEnchantment(this, tier);
		await applyEnchantmentToWeapon(weapon, enchantment);

		const targetNames = [];
		for (const uuid of targetUuids) {
			const actor = await fromUuid(uuid);
			if (actor) targetNames.push(actor.name);
		}

		await ChatMessage.create({
			speaker: ChatMessage.getSpeaker({ actor: this.actor }),
			content: game.i18n.format("op.decadenciaDiscenteCast", {
				ritual: this.name,
				tier: tier.label,
				pe: tier.peCost,
				weapon: weapon.name,
				formula: tier.formula,
				targets: targetNames.join(", "),
			}),
		});

		const attackResult = await weapon.rollAttack({ _forcedTarget: [...(game.user?.targets ?? [])][0] ?? null });

		ui.notifications.info(game.i18n.format("op.decadenciaDiscenteReady", { weapon: weapon.name, formula: tier.formula }));
		Hooks.callAll("ordemparanormal.ritualUsed", this, tier, targetUuids);
		return { tier, weapon, enchantment, attackResult };
	}

	/**
	 * Cinerária — place an area template on the map (+5 ritual DT inside).
	 * @param {object} tier
	 */
	async _useCinerariaRitual(tier) {
		const zoneResult = await castCinerariaZone(this, tier, this.actor);
		if (!zoneResult) return null;

		const spent = await this.actor.spendPE(tier.peCost);
		if (!spent) {
			try {
				await zoneResult.templateDoc.delete();
			} catch (_error) {
				/* template may already be gone */
			}
			return null;
		}

		await ChatMessage.create({
			speaker: ChatMessage.getSpeaker({ actor: this.actor }),
			content: game.i18n.format("op.ritualCastMessage", {
				ritual: this.name,
				tier: tier.label,
				pe: tier.peCost,
				targets: game.i18n.localize("op.cinerariaZoneTarget"),
			}),
		});

		ui.notifications.info(game.i18n.format("op.cinerariaZonePlaced", { radius: parseRitualAreaRadiusMeters(this) }));
		Hooks.callAll("ordemparanormal.ritualUsed", this, tier, [this.actor.uuid]);
		return { tier, zone: zoneResult };
	}

	/**
	 * Persistent AoE rituals (e.g. Nuvem de Cinzas) — place MeasuredTemplate zone on the map.
	 * @param {object} tier
	 */
	async _usePersistentZoneRitual(tier) {
		const ritualId = getRitualSourceId(this);
		if (ritualId === "nuvem-de-cinzas" && tier.key !== "base") {
			ui.notifications.info(game.i18n.localize("op.nuvemDeCinzasSeeThroughHint"));
		}

		const zoneResult = await castPersistentRitualZone(this, tier, this.actor);
		if (!zoneResult) return null;

		const spent = await this.actor.spendPE(tier.peCost);
		if (!spent) {
			try {
				await zoneResult.templateDoc.delete();
			} catch (_error) {
				/* template may already be gone */
			}
			return null;
		}

		const radius = zoneResult.radiusMeters ?? parseRitualAreaRadiusMeters(this, tier);
		const seeThrough = zoneResult.seeThroughActorUuids?.length ? zoneResult.seeThroughActorUuids.length : 0;

		await ChatMessage.create({
			speaker: ChatMessage.getSpeaker({ actor: this.actor }),
			content: game.i18n.format("op.ritualCastMessage", {
				ritual: this.name,
				tier: tier.label,
				pe: tier.peCost,
				targets: game.i18n.localize("op.ritualZoneTarget"),
			}),
		});

		const notifyKey = ritualId === "nuvem-de-cinzas" ? "op.nuvemDeCinzasZonePlaced" : "op.ritualZonePlaced";
		ui.notifications.info(
			game.i18n.format(notifyKey, {
				radius,
				tier: tier.label,
				seeThrough,
			})
		);
		Hooks.callAll("ordemparanormal.ritualUsed", this, tier, [this.actor.uuid]);
		return { tier, zone: zoneResult };
	}

	/**
	 * @param {Item} ritualItem
	 * @param {Roll} roll
	 * @param {object} tier
	 * @param {string[]} targetUuids
	 */
	static async _applyTemporaryFromRoll(ritualItem, roll, tier, targetUuids) {
		const amount = roll.total;
		if (!amount) return [];

		const duration = ritualItem.system.duration === "instantaneous" ? "scene" : ritualItem.system.duration || "scene";
		const label = `${ritualItem.name} (${tier.label})`;
		const results = [];

		for (const actorUuid of targetUuids ?? []) {
			const targetActor = await fromUuid(actorUuid);
			if (!targetActor) continue;
			const result = await targetActor.applyTemporaryResource("PV", amount, {
				duration,
				label,
				icon: ritualItem.img,
			});
			if (result?.amount > 0) {
				results.push({ actor: targetActor, ...result });
				ChatMessage.create({
					content: game.i18n.format("op.applyTemporaryResult", {
						amount: result.amount,
						target: targetActor.name,
					}),
					speaker: ChatMessage.getSpeaker({ actor: targetActor }),
					whisper: _damageRecipients(targetActor),
				});
			}
		}
		return results;
	}

	/**
	 * Enchant an armament item (Arma Atroz, Amaldiçoar Arma/Tecnologia).
	 * @param {object} tier
	 */
	async _useWeaponEnchantRitual(tier) {
		const ritualId = getRitualSourceId(this);
		const filter = getWeaponFilterForRitual(ritualId);
		const weapon = await promptPickArmament(this.actor, filter);
		if (!weapon) return null;

		const enchantment = await buildEnchantmentData(this, tier);
		if (!enchantment) return null;

		const spent = await this.actor.spendPE(tier.peCost);
		if (!spent) return null;

		await applyEnchantmentToWeapon(weapon, enchantment);

		const summaryParts = [];
		if (enchantment.attackBonus) summaryParts.push(`+${enchantment.attackBonus} ${game.i18n.localize("op.attack")}`);
		if (enchantment.critMarginBonus)
			summaryParts.push(`+${enchantment.critMarginBonus} ${game.i18n.localize("op.critMargin")}`);
		if (enchantment.damageBonuses?.length)
			summaryParts.push(
				`+${enchantment.damageBonuses.join("+")} ${enchantment.element || game.i18n.localize("op.damage")}`
			);
		if (enchantment.techModifications?.length) {
			const mods = CONFIG.op?.firearmModifications ?? {};
			summaryParts.push(enchantment.techModifications.map((k) => game.i18n.localize(mods[k]?.label ?? k)).join(", "));
		}

		await ChatMessage.create({
			speaker: ChatMessage.getSpeaker({ actor: this.actor }),
			content: game.i18n.format("op.ritualWeaponEnchantMessage", {
				ritual: this.name,
				tier: tier.label,
				weapon: weapon.name,
				effects: summaryParts.join("; ") || "—",
			}),
		});

		ui.notifications.info(game.i18n.format("op.ritualWeaponEnchantApplied", { weapon: weapon.name }));
		Hooks.callAll("ordemparanormal.ritualWeaponEnchanted", this, tier, weapon, enchantment);
		return { tier, weapon, enchantment };
	}

	/**
	 * @param {ChatMessage} message
	 */
	static async applyHealingFromMessage(message) {
		const healTarget = message.getFlag("ordemparanormal", "healTarget");
		if (!healTarget || !["cura", "pv_temporarios"].includes(healTarget.kind)) return [];
		if (message.getFlag("ordemparanormal", "healApplied")) return [];

		const applyRoll = message.rolls?.[0];
		if (!applyRoll) return [];

		if (healTarget.kind === "pv_temporarios") {
			return OrdemItem.applyTemporaryFromMessage(message);
		}

		const amount = applyRoll.total;
		const ageYears = ritualHealAgeYears(healTarget);
		const results = [];
		for (const actorUuid of healTarget.actorUuids ?? []) {
			const targetActor = await fromUuid(actorUuid);
			if (!targetActor) continue;
			const result = await targetActor.applyHealing(amount, { ageYears });
			results.push({ actor: targetActor, ...result });
			const content =
				result.newAge != null
					? game.i18n.format("op.applyHealingResultAged", {
							amount: result.healed,
							target: targetActor.name,
							age: result.newAge,
					  })
					: game.i18n.format("op.applyHealingResult", {
							amount: result.healed,
							target: targetActor.name,
					  });
			ChatMessage.create({
				content,
				speaker: ChatMessage.getSpeaker({ actor: targetActor }),
				whisper: _damageRecipients(targetActor),
			});
		}

		if (results.length) {
			await message.setFlag("ordemparanormal", "healApplied", {
				at: Date.now(),
				by: game.user.id,
				amount,
				targetUuids: healTarget.actorUuids,
			});
		}

		return results;
	}

	/**
	 * @param {ChatMessage} message
	 */
	static async applyTemporaryFromMessage(message) {
		const healTarget = message.getFlag("ordemparanormal", "healTarget");
		if (!healTarget || healTarget.kind !== "pv_temporarios") return [];
		if (message.getFlag("ordemparanormal", "healApplied")) return [];

		const applyRoll = message.rolls?.[0];
		if (!applyRoll) return [];

		const amount = applyRoll.total;
		const duration = "scene";
		const label = healTarget.ritualName
			? `${healTarget.ritualName} (${healTarget.rollKey ?? "base"})`
			: game.i18n.localize("op.temporaryPV");

		const results = [];
		for (const actorUuid of healTarget.actorUuids ?? []) {
			const targetActor = await fromUuid(actorUuid);
			if (!targetActor) continue;
			const result = await targetActor.applyTemporaryResource("PV", amount, { duration, label });
			if (result?.amount > 0) {
				results.push({ actor: targetActor, ...result });
				ChatMessage.create({
					content: game.i18n.format("op.applyTemporaryResult", {
						amount: result.amount,
						target: targetActor.name,
					}),
					speaker: ChatMessage.getSpeaker({ actor: targetActor }),
					whisper: _damageRecipients(targetActor),
				});
			}
		}

		if (results.length) {
			await message.setFlag("ordemparanormal", "healApplied", {
				at: Date.now(),
				by: game.user.id,
				amount,
				targetUuids: healTarget.actorUuids,
				kind: "pv_temporarios",
			});
		}

		return results;
	}

	/**
	 * @param {ChatMessage} message
	 * @param {string} actorUuid
	 */
	static async rollRitualResistanceFromMessage(message, actorUuid) {
		const resistancePending = message.getFlag("ordemparanormal", "ritualResistancePending");
		const effectPending = message.getFlag("ordemparanormal", "ritualEffectPending");
		const context = resistancePending ?? effectPending;
		if (!context || !ritualNeedsResistance(context.resistanceSpec)) return null;

		const targetUuids = context.targetUuids ?? context.actorUuids ?? [];
		if (!targetUuids.includes(actorUuid)) return null;

		const existingRaw = message.getFlag("ordemparanormal", "resistanceResults");
		const existing = getResistanceResult(existingRaw, actorUuid);
		if (existing) return existing;

		const targetActor = await fromUuid(actorUuid);
		if (!targetActor || !canUserRollResistance(game.user, targetActor)) {
			ui.notifications.warn(game.i18n.localize("op.ritualResistanceNotAllowed"));
			return null;
		}

		const caster = context.casterUuid ? await fromUuid(context.casterUuid) : null;
		const rollResult = await rollRitualResistanceForTarget(targetActor, {
			resistanceSpec: context.resistanceSpec,
			ritualDT: context.ritualDT,
			ritualName: context.ritualName ?? "",
			casterActor: caster,
		});
		if (!rollResult) return null;

		const entry = {
			actorUuid,
			passed: rollResult.passed,
			total: rollResult.total,
			at: Date.now(),
			by: game.user.id,
		};

		await message.setFlag("ordemparanormal", "resistanceResults", upsertResistanceResult(existingRaw, entry));

		await ChatMessage.create({
			content: game.i18n.format(rollResult.passed ? "op.ritualResistanceSuccess" : "op.ritualResistanceFail", {
				target: targetActor.name,
				total: rollResult.total,
				dt: context.ritualDT ?? 0,
				skill: context.resistanceSpec.label,
			}),
			speaker: ChatMessage.getSpeaker({ actor: targetActor }),
			whisper: _damageRecipients(targetActor),
		});

		await _refreshChatMessage(message);

		const linkedDamageId = resistancePending?.damageMessageId ?? effectPending?.damageMessageId;
		if (linkedDamageId) await _refreshChatMessage(linkedDamageId);

		return entry;
	}

	/**
	 * @param {ChatMessage} message
	 */
	static async applyRitualEffectFromMessage(message) {
		const pending = message.getFlag("ordemparanormal", "ritualEffectPending");
		if (!pending || message.getFlag("ordemparanormal", "ritualEffectApplied")) return [];

		const targetUuids = pending.targetUuids ?? [];
		const resistanceResults = message.getFlag("ordemparanormal", "resistanceResults") ?? {};

		if (ritualNeedsResistance(pending.resistanceSpec) && !allResistancesResolved(targetUuids, resistanceResults)) {
			ui.notifications.warn(game.i18n.localize("op.ritualResistancePending"));
			return [];
		}

		let ritualItem = await fromUuid(pending.itemUuid);
		if (!ritualItem && pending.parentActorUuid) {
			const parent = await fromUuid(pending.parentActorUuid);
			const localId = pending.itemUuid?.split(".")?.pop();
			ritualItem = parent?.items?.get(localId) ?? null;
		}
		if (!ritualItem?.actor) return [];

		const tiers = ritualItem.getRitualTiers();
		const tier = tiers.find((entry) => entry.key === pending.tierKey) ?? tiers[0];
		if (!tier) return [];

		const ritualId = getRitualSourceId(ritualItem);
		const narrativeOnly = isNarrativeResistanceRitual(ritualId, tier.key);
		const applied = [];
		for (const actorUuid of targetUuids) {
			const targetActor = await fromUuid(actorUuid);
			const result = getResistanceResult(resistanceResults, actorUuid);
			if (resistanceBlocksEffect(pending.resistanceSpec?.effect, result?.passed)) {
				ChatMessage.create({
					content: game.i18n.format("op.ritualEffectResisted", {
						target: targetActor?.name ?? actorUuid,
						ritual: pending.ritualName,
					}),
				});
				continue;
			}

			if (narrativeOnly) {
				ChatMessage.create({
					content: game.i18n.format("op.ritualCommandObey", {
						target: targetActor?.name ?? actorUuid,
						ritual: pending.ritualName,
					}),
				});
				applied.push(actorUuid);
				continue;
			}

			const conditionIds = resolveRitualConditions(pending.conditionSpec, Boolean(result?.passed));
			await ritualItem._activateRitualBuff(tier, [actorUuid], {
				...(pending.ritualOptions ?? {}),
				conditionIds,
				conditionDuration: pending.conditionSpec?.duration,
			});
			applied.push(actorUuid);
		}

		if (applied.length) {
			await message.setFlag("ordemparanormal", "ritualEffectApplied", {
				at: Date.now(),
				by: game.user.id,
				targetUuids: applied,
			});
			ui.notifications.info(
				narrativeOnly
					? game.i18n.format("op.ritualCommandResolved", { name: pending.ritualName, tier: tier.label })
					: game.i18n.format("op.ritualActivated", { name: pending.ritualName, tier: tier.label })
			);
		}

		await _refreshChatMessage(message);
		return applied;
	}

	/**
	 * Apply ritual damage from the resistance message (message 2), after all tests are done.
	 * @param {ChatMessage} resistanceMessage
	 */
	static async applyRitualDamageAfterResistance(resistanceMessage) {
		const pending = resistanceMessage.getFlag("ordemparanormal", "ritualResistancePending");
		if (!pending) return [];

		const damageMessage = game.messages.get(pending.damageMessageId);
		if (!damageMessage) return [];
		if (damageMessage.getFlag("ordemparanormal", "damageApplied")) return [];
		if (resistanceMessage.getFlag("ordemparanormal", "ritualDamageApplied")) return [];

		const applyRoll = damageMessage.rolls?.[0];
		if (!applyRoll) return [];

		const uuids = pending.targetUuids ?? pending.actorUuids ?? [];
		const resistanceResults = resistanceMessage.getFlag("ordemparanormal", "resistanceResults") ?? {};
		const resistanceSpec = pending.resistanceSpec ?? null;

		if (ritualNeedsResistance(resistanceSpec) && !allResistancesResolved(uuids, resistanceResults)) {
			ui.notifications.warn(game.i18n.localize("op.ritualResistancePending"));
			return [];
		}

		const results = [];
		let handled = 0;
		for (const actorUuid of uuids) {
			const targetActor = await fromUuid(actorUuid);
			if (!targetActor) continue;

			const passed = getResistanceResult(resistanceResults, actorUuid)?.passed ?? false;
			const outcome = resolveRitualTargetOutcome(applyRoll.total, resistanceSpec, passed);

			if (outcome.negated) {
				ChatMessage.create({
					content: game.i18n.format("op.ritualEffectResisted", {
						target: targetActor.name,
						ritual: pending.ritualName ?? "",
					}),
					speaker: ChatMessage.getSpeaker({ actor: targetActor }),
					whisper: _damageRecipients(targetActor),
				});
				await _applyResolvedRitualConditions(targetActor, pending.conditionSpec, passed, {
					ritualName: pending.ritualName,
				});
				handled++;
				continue;
			}

			const result = await targetActor.applyDamage(outcome.damage, {
				damageType: pending.damageType,
			});
			results.push({ actor: targetActor, ...result, outcome: outcome.outcome });

			const outcomeSuffix =
				outcome.outcome === "half"
					? ` — ${game.i18n.format("op.ritualResistanceHalved", {
							original: applyRoll.total,
							final: outcome.damage,
					  })}`
					: "";

			ChatMessage.create({
				content: `${game.i18n.format("op.applyDamageResult", {
					amount: result.finalDamage,
					target: targetActor.name,
					blocked: result.blocked > 0 ? game.i18n.format("op.damageBlocked", { blocked: result.blocked }) : "",
				})}${outcomeSuffix}`,
				speaker: ChatMessage.getSpeaker({ actor: targetActor }),
				whisper: _damageRecipients(targetActor),
			});
			await _applyResolvedRitualConditions(targetActor, pending.conditionSpec, passed, {
				ritualName: pending.ritualName,
			});
			handled++;
		}

		if (handled === uuids.length && handled > 0) {
			await damageMessage.setFlag("ordemparanormal", "damageApplied", {
				at: Date.now(),
				by: game.user.id,
				amount: applyRoll.total,
				targetUuids: uuids,
			});
			await resistanceMessage.setFlag("ordemparanormal", "ritualDamageApplied", {
				at: Date.now(),
				by: game.user.id,
			});

			if (pending.grantsCasterTempFromTotal && pending.casterUuid) {
				const totalDamage = results.reduce((sum, entry) => sum + (Number(entry.finalDamage) || 0), 0);
				if (totalDamage > 0) {
					const caster = await fromUuid(pending.casterUuid);
					if (caster) {
						await caster.applyTemporaryResource("PV", totalDamage, {
							duration: "scene",
							label: game.i18n.localize("op.consumirManancialTempFromDamage"),
						});
					}
				}
			}
		}

		await _refreshChatMessage(resistanceMessage);
		await _refreshChatMessage(damageMessage);
		return results;
	}

	static async applyDamageFromMessage(message) {
		const resistancePending = message.getFlag("ordemparanormal", "ritualResistancePending");
		if (resistancePending) return OrdemItem.applyRitualDamageAfterResistance(message);

		const damageTarget = message.getFlag("ordemparanormal", "damageTarget");
		if (!damageTarget) return [];
		if (damageTarget.awaitingResistance) {
			const resistanceMessage = damageTarget.resistanceMessageId
				? game.messages.get(damageTarget.resistanceMessageId)
				: null;
			if (resistanceMessage) {
				return OrdemItem.applyRitualDamageAfterResistance(resistanceMessage);
			}
			ui.notifications.warn(game.i18n.localize("op.ritualResistancePending"));
			return [];
		}
		if (message.getFlag("ordemparanormal", "damageApplied")) return [];

		const applyRoll = message.rolls?.[0];
		if (!applyRoll) return [];

		const uuids = damageTarget.actorUuids?.length
			? damageTarget.actorUuids
			: damageTarget.actorUuid
			? [damageTarget.actorUuid]
			: [];

		const results = [];
		for (const actorUuid of uuids) {
			const targetActor = await fromUuid(actorUuid);
			if (!targetActor) continue;

			const result = await targetActor.applyDamage(applyRoll.total, {
				damageType: damageTarget.damageType,
			});
			results.push({ actor: targetActor, ...result });
			ChatMessage.create({
				content: game.i18n.format("op.applyDamageResult", {
					amount: result.finalDamage,
					target: targetActor.name,
					blocked: result.blocked > 0 ? game.i18n.format("op.damageBlocked", { blocked: result.blocked }) : "",
				}),
				speaker: ChatMessage.getSpeaker({ actor: targetActor }),
				whisper: _damageRecipients(targetActor),
			});
			await _applyResolvedRitualConditions(targetActor, damageTarget.conditionSpec, false, {
				ritualName: damageTarget.ritualName,
			});
		}

		if (results.length) {
			await message.setFlag("ordemparanormal", "damageApplied", {
				at: Date.now(),
				by: game.user.id,
				amount: applyRoll.total,
				targetUuids: uuids,
			});

			if (damageTarget.grantsCasterTempFromTotal && damageTarget.casterUuid) {
				const totalDamage = results.reduce((sum, entry) => sum + (Number(entry.finalDamage) || 0), 0);
				if (totalDamage > 0) {
					const caster = await fromUuid(damageTarget.casterUuid);
					if (caster) {
						await caster.applyTemporaryResource("PV", totalDamage, {
							duration: "scene",
							label: game.i18n.localize("op.consumirManancialTempFromDamage"),
							icon:
								"systems/ordemparanormal/media/icons/abilities/class/occultist/Graduado/Grim%C3%B3rio%20Ritual%C3%ADstico.svg",
						});
						ChatMessage.create({
							content: game.i18n.format("op.applyTemporaryResult", {
								amount: totalDamage,
								target: caster.name,
							}),
							speaker: ChatMessage.getSpeaker({ actor: caster }),
							whisper: _damageRecipients(caster),
						});
					}
				}
			}
		}

		return results;
	}

	async rollFormula(/* {spellLevel}={} */) {
		if (!this.system.formulas.extraFormula) throw new Error("This Item does not have a formula to roll!");

		const rollConfig = {
			formula: this.system.formulas.extraFormula,
			data: this.getRollData(),
			chatMessage: true,
		};
		// if ( spellLevel ) rollConfig.data.item.level = spellLevel;

		/**
		 * A hook event that fires before a formula is rolled for an Item.
		 * @function ordemparanormal.preRollFormula
		 * @memberof hookEvents
		 * @param {Item5e} item                 Item for which the roll is being performed.
		 * @param {object} config               Configuration data for the pending roll.
		 * @param {string} config.formula       Formula that will be rolled.
		 * @param {object} config.data          Data used when evaluating the roll.
		 * @param {boolean} config.chatMessage  Should a chat message be created for this roll?
		 * @returns {boolean}                   Explicitly return false to prevent the roll from being performed.
		 */

		// if ( Hooks.call('ordemparanormal.preRollFormula', this, rollConfig) === false ) return;

		const roll = await new Roll(rollConfig.formula, rollConfig.data).evaluate();

		if (rollConfig.chatMessage) {
			roll.toMessage(
				{
					speaker: ChatMessage.getSpeaker({ actor: this.actor }),
					flavor: `${this.name}`,
				},
				{ rollMode: game.settings.get("core", "rollMode") }
			);
		}

		/**
		 * A hook event that fires after a formula has been rolled for an Item.
		 * @function ordemparanormal.rollFormula
		 * @memberof hookEvents
		 * @param {Item5e} item  Item for which the roll was performed.
		 * @param {Roll} roll    The resulting roll.
		 */
		Hooks.callAll("ordemparanormal.rollFormula", this, roll);

		return roll;
	}
}
