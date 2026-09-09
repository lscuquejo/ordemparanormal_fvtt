/* eslint-disable no-prototype-builtins */
/* eslint-disable no-unused-vars */
import BasicRoll from "../dice/basic-roll.mjs";
import SkillToolRollConfigurationDialog from "../applications/skill-tool-configuration-dialog.mjs";
import AttributeRollConfigurationDialog from "../applications/attribute-configuration-dialog.mjs";
import {
	calculateSpaces,
	calculateDefense,
	calculateStatusMaxima,
	calculateRitualDT,
	hasManualOverrides,
} from "../helpers/actor-calculations.mjs";
import {
	applyRitualPhysicalHalfReduction,
	getEffectiveAttributeValue,
	getRitualDamageResistanceBonus,
} from "../helpers/ritual-effects.mjs";
import { getRitualZoneDeslocCap, getRitualZoneDtBonus } from "../helpers/ritual-zones.mjs";
import {
	applyConditionDesloc,
	getActorConditionModifiers,
	getConditionDicePenalty,
} from "../helpers/condition-effects.mjs";
import { ritualDurationToEffectDuration } from "../helpers/ritual-helpers.mjs";
import {
	findTemporaryResourceEffects,
	resolveTemporaryResourceAmount,
	shouldReplaceTemporaryResource,
} from "../helpers/temporary-resources.mjs";

/**
 * Extend the base Actor document by defining a custom roll data structure which is ideal for the Simple system.
 * @extends {Actor}
 */
export class OrdemActor extends Actor {
	/**
	 *
	 */
	get progressRuleIsNivel() {
		const rule = game.settings.get("ordemparanormal", "globalProgressRules");
		return rule === 2;
	}

	/**
	 *
	 */
	get usingWithoutSanityRule() {
		return game.settings.get("ordemparanormal", "globalPlayingWithoutSanity");
	}

	/**
	 *
	 */
	get progressRuleIsNEX() {
		const rule = game.settings.get("ordemparanormal", "globalProgressRules");
		return rule === 1;
	}

	/**
	 *
	 */
	get isSurvivor() {
		return this.system.class === "survivor";
	}

	/** @override */
	prepareData() {
		// Prepare data for the actor. Calling the super version of this executes
		// the following, in order: data reset (to clear active effects),
		// prepareBaseData(), prepareEmbeddedDocuments() (including active effects),
		// prepareDerivedData().
		super.prepareData();
	}

	/**
	 *  Prepare data related to this DataModel itself, before any derived data (including Active Effects)
	 *  is computed. This is especially useful for initializing numbers, arrays, and sets you expect to
	 *  be modified by active effects
	 */
	/** @override */
	prepareBaseData() {
		super.prepareBaseData();
	}

	/** @override */
	prepareDerivedData() {
		super.prepareDerivedData();
		if (this.type === "agent") {
			const sys = this.system;
			if (!sys.disableCalculations) {
				// Always restart from persisted bases so AGI/armor are not stacked
				// on top of an already-derived total (which the sheet displays).
				sys.defense.value = this._getDefenseBaseForCalculation();
				sys.desloc.value = this._getDeslocBaseForCalculation();
				this._prepareItemsDerivedData(this, sys);
			}
			this._prepareActorSpaces(this);
			if (!sys.disableCalculations) {
				const result = calculateDefense(
					sys.defense.value,
					getEffectiveAttributeValue(sys.attributes.dex),
					sys.skills.reflexes.degree.value,
					sys.skills.reflexes.mod || 0
				);
				sys.defense.value = result.value;
				sys.defense.dodge = result.dodge;

				const defenseBonus = Number(sys.defense.bonus) || 0;
				if (defenseBonus) {
					sys.defense.value += defenseBonus;
					sys.defense.dodge += defenseBonus;
				}

				const deslocBonus = Number(sys.desloc.bonus) || 0;
				if (deslocBonus) sys.desloc.value += deslocBonus;
			}

			this._calculateMaxHP();
			this._applyManualOverrides();
			this._applyConditionModifiers();

			if (!sys.disableCalculations && !this._hasManualOverrides()) {
				const isSurvivor = this.itemTypes.class[0]?.system?.isSurvivor ?? false;
				const progress = sys._progress ?? 0;
				const pre = getEffectiveAttributeValue(sys.attributes.pre);
				sys.ritual.DT = calculateRitualDT(isSurvivor, progress, pre);
			}

			if (this.system.ritual?.DT != null) {
				const zoneBonus = getRitualZoneDtBonus(this);
				if (zoneBonus) this.system.ritual.DT = Number(this.system.ritual.DT) + zoneBonus;
			}
		} else {
			this._applyConditionModifiers();
		}
	}

	/**
	 * Manual sheet values always win over derived calculations.
	 * @private
	 */
	_hasManualOverrides() {
		return hasManualOverrides(this.system.overrides);
	}

	_getEquippedArmorDefense() {
		return this.items
			.filter((item) => item.type === "protection" && item.system?.using?.state === true)
			.reduce((sum, item) => sum + (Number(item.system.defense) || 0), 0);
	}

	/**
	 * defense.value in the database is the base (default 10), not base + AGI + armor.
	 * @private
	 */
	_getDefenseBaseForCalculation() {
		const defaultBase = 10;
		const stored = this._source.system.defense?.value ?? defaultBase;
		const dex = getEffectiveAttributeValue(this.system.attributes.dex);
		const armor = this._getEquippedArmorDefense();
		const expectedDerived = defaultBase + dex + armor;

		if (stored === expectedDerived) return defaultBase;
		if (dex > 0 && stored === defaultBase + dex * 2 + armor) return defaultBase;

		return stored;
	}

	/**
	 * desloc.value in the database is the base (default 9), not the overweight-adjusted total.
	 * @private
	 */
	_getDeslocBaseForCalculation() {
		const defaultBase = 9;
		const stored = this._source.system.desloc?.value ?? defaultBase;
		if (stored === defaultBase - 3) return defaultBase;
		return stored;
	}

	/**
	 * Strip accidentally persisted derived totals when restoring automation.
	 * @returns {Record<string, number>}
	 */
	_resetDerivedStatBases() {
		return {
			"system.defense.value": this._getDefenseBaseForCalculation(),
			"system.desloc.value": this._getDeslocBaseForCalculation(),
		};
	}

	_applyManualOverrides() {
		const o = this.system.overrides;
		if (!o) return;
		if (Number.isFinite(o.PVMax)) this.system.PV.max = o.PVMax;
		if (Number.isFinite(o.SANMax)) this.system.SAN.max = o.SANMax;
		if (Number.isFinite(o.PEMax)) this.system.PE.max = o.PEMax;
		if (Number.isFinite(o.PDMax)) this.system.PD.max = o.PDMax;
		if (Number.isFinite(o.PEPerRound)) this.system.PE.perRound = o.PEPerRound;
		if (Number.isFinite(o.PDPerRound)) this.system.PD.perRound = o.PDPerRound;
		if (Number.isFinite(o.defense)) this.system.defense.value = o.defense;
		if (Number.isFinite(o.dodge)) this.system.defense.dodge = o.dodge;
		if (Number.isFinite(o.desloc)) this.system.desloc.value = o.desloc;
		if (typeof o.patentName === "string" && o.patentName.length) this.system.patent.name = o.patentName;
		if (o.itemLimit1 !== null && o.itemLimit1 !== undefined) this.system.patent.itemLimit1 = o.itemLimit1;
		if (o.itemLimit2 !== null && o.itemLimit2 !== undefined) this.system.patent.itemLimit2 = o.itemLimit2;
		if (o.itemLimit3 !== null && o.itemLimit3 !== undefined) this.system.patent.itemLimit3 = o.itemLimit3;
		if (o.itemLimit4 !== null && o.itemLimit4 !== undefined) this.system.patent.itemLimit4 = o.itemLimit4;
	}

	/**
	 * Apply automated Ordem Paranormal status penalties (defense, movement).
	 * @private
	 */
	_applyConditionModifiers() {
		const mods = getActorConditionModifiers(this);
		const defense = this.system.defense;
		if (defense && mods.defense) {
			defense.value = Math.max(0, (Number(defense.value) || 0) + mods.defense);
			if (Number.isFinite(defense.dodge)) {
				defense.dodge = Math.max(0, (Number(defense.dodge) || 0) + mods.defense);
			}
		}
		if (this.system.desloc && (mods.deslocZero || mods.deslocHalf || mods.deslocFixed != null)) {
			this.system.desloc.value = applyConditionDesloc(this.system.desloc.value, mods);
		}
		const walk = this.system.attributes?.movement?.walk;
		if (Number.isFinite(Number(walk)) && (mods.deslocZero || mods.deslocHalf || mods.deslocFixed != null)) {
			this.system.attributes.movement.walk = applyConditionDesloc(walk, mods);
		}

		const zoneDeslocCap = getRitualZoneDeslocCap(this);
		if (Number.isFinite(zoneDeslocCap) && this.system.desloc) {
			this.system.desloc.value = Math.min(Number(this.system.desloc.value) || 0, zoneDeslocCap);
			if (Number.isFinite(Number(this.system.attributes?.movement?.walk))) {
				this.system.attributes.movement.walk = Math.min(Number(this.system.attributes.movement.walk) || 0, zoneDeslocCap);
			}
		}
	}

	_snapshotManualOverrides() {
		const sys = this.system;
		return {
			"system.overrides.PVMax": sys.PV.max,
			"system.overrides.SANMax": sys.SAN.max,
			"system.overrides.PEMax": sys.PE.max,
			"system.overrides.PDMax": sys.PD.max,
			"system.overrides.PEPerRound": sys.PE.perRound,
			"system.overrides.PDPerRound": sys.PD.perRound,
			"system.overrides.defense": sys.defense.value,
			"system.overrides.dodge": sys.defense.dodge,
			"system.overrides.desloc": sys.desloc.value,
			"system.overrides.patentName": sys.patent.name,
			"system.overrides.itemLimit1": sys.patent.itemLimit1,
			"system.overrides.itemLimit2": sys.patent.itemLimit2,
			"system.overrides.itemLimit3": sys.patent.itemLimit3,
			"system.overrides.itemLimit4": sys.patent.itemLimit4,
			"system.PV.max": sys.PV.max,
			"system.SAN.max": sys.SAN.max,
			"system.PE.max": sys.PE.max,
			"system.PD.max": sys.PD.max,
			"system.PE.perRound": sys.PE.perRound,
			"system.PD.perRound": sys.PD.perRound,
			"system.patent.name": sys.patent.name,
			"system.patent.itemLimit1": sys.patent.itemLimit1,
			"system.patent.itemLimit2": sys.patent.itemLimit2,
			"system.patent.itemLimit3": sys.patent.itemLimit3,
			"system.patent.itemLimit4": sys.patent.itemLimit4,
		};
	}

	_clearManualOverrides() {
		return {
			"system.overrides.PVMax": null,
			"system.overrides.SANMax": null,
			"system.overrides.PEMax": null,
			"system.overrides.PDMax": null,
			"system.overrides.PEPerRound": null,
			"system.overrides.PDPerRound": null,
			"system.overrides.defense": null,
			"system.overrides.dodge": null,
			"system.overrides.desloc": null,
			"system.overrides.patentName": null,
			"system.overrides.itemLimit1": null,
			"system.overrides.itemLimit2": null,
			"system.overrides.itemLimit3": null,
			"system.overrides.itemLimit4": null,
		};
	}

	/**
	 * When the user edits a calculated field, store it as an override so it
	 * wins over derived data on the next prepare.
	 * @inheritDoc
	 */
	async _preUpdate(changed, options, user) {
		if (this.type === "agent") {
			const sys = changed.system ?? {};
			const turningCalcsBackOn = sys.disableCalculations === false;
			if (turningCalcsBackOn) {
				// The sheet displays derived totals (base + AGI, etc). Never persist
				// those back as the new base when restoring automation.
				if (sys.defense) {
					delete sys.defense.value;
					delete sys.defense.dodge;
					if (!Object.keys(sys.defense).length) delete sys.defense;
				}
				if (sys.desloc) {
					delete sys.desloc.value;
					if (!Object.keys(sys.desloc).length) delete sys.desloc;
				}
			} else {
				const overrides = {};
				if (sys.PV && Object.prototype.hasOwnProperty.call(sys.PV, "max")) overrides.PVMax = sys.PV.max;
				if (sys.SAN && Object.prototype.hasOwnProperty.call(sys.SAN, "max")) overrides.SANMax = sys.SAN.max;
				if (sys.PE && Object.prototype.hasOwnProperty.call(sys.PE, "max")) overrides.PEMax = sys.PE.max;
				if (sys.PD && Object.prototype.hasOwnProperty.call(sys.PD, "max")) overrides.PDMax = sys.PD.max;
				if (sys.PE && Object.prototype.hasOwnProperty.call(sys.PE, "perRound")) overrides.PEPerRound = sys.PE.perRound;
				if (sys.PD && Object.prototype.hasOwnProperty.call(sys.PD, "perRound")) overrides.PDPerRound = sys.PD.perRound;
				if (sys.defense && Object.prototype.hasOwnProperty.call(sys.defense, "value")) {
					overrides.defense = sys.defense.value;
					delete sys.defense.value;
				}
				if (sys.defense && Object.prototype.hasOwnProperty.call(sys.defense, "dodge")) {
					overrides.dodge = sys.defense.dodge;
					delete sys.defense.dodge;
				}
				if (sys.desloc && Object.prototype.hasOwnProperty.call(sys.desloc, "value")) {
					overrides.desloc = sys.desloc.value;
					delete sys.desloc.value;
				}
				if (sys.patent && Object.prototype.hasOwnProperty.call(sys.patent, "name")) overrides.patentName = sys.patent.name;
				if (sys.patent && Object.prototype.hasOwnProperty.call(sys.patent, "itemLimit1"))
					overrides.itemLimit1 = sys.patent.itemLimit1;
				if (sys.patent && Object.prototype.hasOwnProperty.call(sys.patent, "itemLimit2"))
					overrides.itemLimit2 = sys.patent.itemLimit2;
				if (sys.patent && Object.prototype.hasOwnProperty.call(sys.patent, "itemLimit3"))
					overrides.itemLimit3 = sys.patent.itemLimit3;
				if (sys.patent && Object.prototype.hasOwnProperty.call(sys.patent, "itemLimit4"))
					overrides.itemLimit4 = sys.patent.itemLimit4;
				if (Object.keys(overrides).length) {
					sys.overrides = { ...(sys.overrides ?? {}), ...overrides };
					changed.system = sys;
				}
			}
		}
		return super._preUpdate(changed, options, user);
	}

	/**
	 * Calcula o HP Máximo do Agente baseado na sua Classe e Vitalidade.
	 * @private
	 */
	_calculateMaxHP() {
		// Puxa os dados básicos (include ritual AE bonuses on attributes.*.bonus)
		const vig = getEffectiveAttributeValue(this.system.attributes.vit);
		const pre = getEffectiveAttributeValue(this.system.attributes.pre);
		const progress = this.system._progress;
		const withoutSanity = this.usingWithoutSanityRule || false;

		// Busca a Classe
		const classItem = this.itemTypes.class[0];
		const classStats = classItem ? classItem.system : null;

		const manualMode = this.system.disableCalculations || this._hasManualOverrides();
		const isCalcActive = Boolean(classStats) && !manualMode;

		this.system.isDerivatedCalcsActive = isCalcActive;

		if (isCalcActive) {
			const maxStatus = calculateStatusMaxima(vig, pre, progress, withoutSanity, classStats);
			const pvBonus = Number(this.system.PV.bonus) || 0;
			const peBonus = Number(this.system.PE.bonus) || 0;
			const pdBonus = Number(this.system.PD.bonus) || 0;
			const sanBonus = Number(this.system.SAN.bonus) || 0;

			this.system.PV.max = maxStatus.PV_max + pvBonus;
			this.system.PE.max = maxStatus.PE_max + peBonus;
			this.system.PD.max = maxStatus.PD_max + pdBonus;
			this.system.SAN.max = maxStatus.SAN_max + sanBonus;
		}
	}

	/**
	 * Prepare and calcule the spaces of actors
	 *
	 * @param {Object} actorData The actor to prepare.
	 *
	 * @return {undefined}
	 */
	_prepareActorSpaces(ActorData) {
		const system = ActorData.system;
		const spaces = (system.spaces ??= {});
		const FOR = getEffectiveAttributeValue(system.attributes.str);

		const physicalItems = ["armament", "generalEquipment", "protection"];
		const weight = ActorData.items.reduce((w, i) => {
			if (!physicalItems.includes(i.type)) return w;
			const q = i.system.quantity || 0;
			const iw = i.system.using.state ? i.system.weight || 0 : 0;
			return w + q * iw;
		}, 0);

		const result = calculateSpaces(weight, FOR, spaces.bonus);
		spaces.value = result.value;
		spaces.max = result.max;
		spaces.pct = result.pct;
		spaces.over = result.over;
		spaces.pctMax = result.pctMax;

		if (result.isOverweight && !system.disableCalculations) {
			system.desloc.value += -3;
			system.defense.value += -5;
		}
		if (result.isDoubleOverweight) ui.notifications.warn(game.i18n.localize("WARN.overWeight"));
	}

	/**
	 * Prepare and calcule the data of items
	 *
	 * @param {Object} actorData The actor to prepare.
	 *
	 * @return {undefined}
	 */
	_prepareItemsDerivedData(actorData, system) {
		const protections = actorData.items.filter((item) => item.type === "protection");
		for (const p of protections) {
			if (typeof p.system.defense === "number" && p.system.using.state === true) {
				system.defense.value += p.system.defense;
			}
		}
	}

	/** @inheritDoc */
	applyActiveEffects(phase) {
		// 1. Preparar dados para rolagem (para resolver variáveis como @NEX.value)
		// Atenção: Aqui só estarão disponíveis os dados base (prepareBaseData),
		// pois os dados derivados ainda não foram calculados.
		const rollData = this.getRollData();

		// 2. Iterar sobre todos os efeitos aplicáveis ao ator
		// (Isso inclui efeitos do próprio ator e efeitos transferidos de itens)
		const effects = this.allApplicableEffects();

		for (const effect of effects) {
			if (effect.disabled) continue;

			// Iterar sobre as mudanças (changes) de cada efeito
			for (const change of effect.changes) {
				// Verifica se o valor é uma string e contém "@" indicando uma variável
				if (typeof change.value === "string" && change.value.includes("@")) {
					try {
						// Substitui as variáveis pelos valores reais do ator
						// Ex: "@NEX.value" vira "50"
						const formula = Roll.replaceFormulaData(change.value, rollData);

						// Avalia a expressão matemática com segurança
						// Ex: "50 * 1" vira 50
						const result = Roll.safeEval(formula);

						// Atualiza o valor na memória para ser aplicado corretamente pelo Foundry
						change.value = result;
					} catch (e) {
						console.error(`Ordem Paranormal | Erro ao calcular fórmula no efeito "${effect.name}":`, e);
					}
				}
			}
		}

		// 3. Executa a lógica padrão do sistema (hook prepareEmbeddedData)
		if (game.release.generation < 14) phase ??= "initial";
		if (this.system?.prepareEmbeddedData instanceof Function && phase === "initial") {
			this.system.prepareEmbeddedData();
		}

		// 4. Chama o método original para aplicar os valores já calculados
		return super.applyActiveEffects(phase);
	}

	/**
	 * Override getRollData() that's supplied to rolls.
	 */
	getRollData() {
		const actorData = this;
		const system = super.getRollData();

		// Cálculo da Formula de Iniciativa (@rollInitiative)
		const agi = system.attributes?.dex?.value || 0;
		const diceFormula = agi > 0 ? `${agi}d20kh` : "2d20kl";

		let bonus = 0;
		// Verifica se a perícia de iniciativa existe (vale para Agente e Ameaça)
		if (system.skills?.initiative) {
			const degree = system.skills.initiative.degree?.value || 0;
			const mod = Number(system.skills.initiative.mod) || 0; // Modificador manual (opcional)
			const flatValue = Number(system.skills.initiative.value) || 0;
			bonus = (degree > 0 ? degree : flatValue) + mod;
		}

		system.rollInitiative = `${diceFormula} + ${bonus}`;

		// Adiciona referências diretas para Active Effects
		// Isso permite que variáveis como @NEX.value, @PV.value, etc. funcionem nos efeitos ativos
		return {
			...system,
			NEX: system.NEX,
			PV: system.PV,
			PE: system.PE,
			PD: system.PD,
			SAN: system.SAN,
			defense: system.defense,
			desloc: system.desloc,
			attributes: system.attributes,
			skills: system.skills,
		};
	}

	/**
	 * Apply damage to this actor, respecting damage resistances.
	 *
	 * @param {number} amount                      Total damage amount before resistances.
	 * @param {object} [options={}]
	 * @param {string} [options.damageType]        Key from system.resistances (e.g. "cuttingDamage").
	 * @param {boolean} [options.ignoreRD=false]   Bypass damage resistance (Perda de Vida rule).
	 * @param {boolean} [options.nonLethal=false]  Apply as non-lethal damage (tracked separately).
	 * @param {number} [options.extraRD=0]         Extra DR (e.g. from a Bloqueio reaction) added to base RD.
	 * @returns {Promise<{finalDamage: number, blocked: number, newPV: number, conditions: string[]}>}
	 */
	async applyDamage(amount, { damageType, ignoreRD = false, nonLethal = false, extraRD = 0 } = {}) {
		const isThreat = this.type === "threat";
		const resource = isThreat ? this.system.attributes?.hp : this.system.PV;
		const resistances = this.system.resistances ?? {};

		let workingAmount = Math.max(0, amount);
		let tempAbsorbed = 0;

		if (!isThreat && !nonLethal) {
			const tempHP = Number(resource.temp ?? 0);
			if (tempHP > 0) {
				tempAbsorbed = Math.min(tempHP, workingAmount);
				workingAmount -= tempAbsorbed;
			}
		}

		if (!ignoreRD && damageType) {
			workingAmount = applyRitualPhysicalHalfReduction(this, workingAmount, damageType);
		}

		const baseRd = (!ignoreRD && damageType && resistances[damageType]?.value) || 0;
		const ritualRd = !ignoreRD ? getRitualDamageResistanceBonus(this, damageType) : 0;
		const conditionRd = !ignoreRD ? getActorConditionModifiers(this).rdAll : 0;
		const totalRd = baseRd + ritualRd + conditionRd + Math.max(0, extraRD || 0);
		const finalDamage = Math.max(0, workingAmount - totalRd);
		const blocked = amount - finalDamage;

		// Delegate to GM via socket when the current user doesn't own this actor
		if (!this.isOwner) {
			// No-GM guard (Foundry docs: GM-authoritative socket pattern) — without this,
			// emit silently drops if no GM is connected.
			const gmOnline = game.users.some((u) => u.isGM && u.active);
			if (!gmOnline) {
				ui.notifications.warn(game.i18n.localize("op.applyDamageNeedsGM"));
				return { finalDamage: 0, blocked: 0, newPV: null, conditions: [] };
			}
			game.socket.emit("system.ordemparanormal", {
				type: "applyDamage",
				actorUuid: this.uuid,
				amount,
				options: { damageType, ignoreRD, nonLethal, extraRD },
				userId: game.user.id,
			});
			// newPV is unknown here — update happens asynchronously on the GM client
			return { finalDamage, blocked, newPV: null, conditions: [] };
		}

		const conditions = [];

		if (!isThreat && nonLethal) {
			const newNonLethal = (resource.nonLethal ?? 0) + finalDamage;
			await this.update({ "system.PV.nonLethal": newNonLethal });
			return { finalDamage, blocked, newPV: resource.value, conditions };
		}

		const updateData = {};
		if (tempAbsorbed > 0) updateData["system.PV.temp"] = Math.max(0, Number(resource.temp ?? 0) - tempAbsorbed);

		const newPV = Math.max(0, resource.value - finalDamage);
		const hpKey = isThreat ? "system.attributes.hp.value" : "system.PV.value";
		updateData[hpKey] = newPV;
		await this.update(updateData);

		if (newPV <= 0) conditions.push("morrendo");
		if (newPV <= resource.max / 2) conditions.push("machucado");

		return { finalDamage, blocked, newPV, conditions };
	}

	/**
	 * Apply healing to this actor, capped at maximum PV/HP.
	 *
	 * @param {number} amount
	 * @returns {Promise<{healed: number, newPV: number|null}>}
	 */
	/**
	 * @param {number} amount
	 * @returns {Promise<boolean>}
	 */
	/**
	 * Roll a saved attack profile by id or name (for macros).
	 * @param {string} profileIdOrName
	 */
	async rollAttackProfile(profileIdOrName) {
		const profiles = this.system.attackProfiles ?? [];
		const profile = profiles.find((entry) => entry.id === profileIdOrName || entry.name === profileIdOrName);
		if (!profile) {
			ui.notifications.warn(game.i18n.localize("op.attackProfileMissingWeapon"));
			return null;
		}
		const baseItem = this.items.get(profile.baseArmamentId);
		if (!baseItem) {
			ui.notifications.warn(game.i18n.localize("op.attackProfileMissingWeapon"));
			return null;
		}
		return baseItem.rollAttackProfile(profile);
	}

	async spendPE(amount) {
		let cost = Math.max(0, Number(amount) || 0);
		if (!cost) return true;
		cost += getActorConditionModifiers(this).peCostExtra;

		const pe = this.system.PE ?? {};
		const temp = Number(pe.temp ?? 0);
		const current = Number(pe.value ?? 0);
		const fromTemp = Math.min(temp, cost);
		const fromValue = cost - fromTemp;

		if (current < fromValue) {
			ui.notifications.warn(game.i18n.format("op.notEnoughPE", { cost, current: current + temp }));
			return false;
		}

		if (!this.isOwner) {
			const gmOnline = game.users.some((u) => u.isGM && u.active);
			if (!gmOnline) {
				ui.notifications.warn(game.i18n.localize("op.applyHealingNeedsGM"));
				return false;
			}
			game.socket.emit("system.ordemparanormal", {
				type: "spendPE",
				actorUuid: this.uuid,
				amount: cost,
				userId: game.user.id,
			});
			return true;
		}

		const updateData = {};
		if (fromTemp) updateData["system.PE.temp"] = temp - fromTemp;
		if (fromValue) updateData["system.PE.value"] = current - fromValue;
		await this.update(updateData);
		return true;
	}

	/**
	 * Grant temporary PV/SAN/PE/PD via an ActiveEffect (shown as (N) on the sheet).
	 * @param {"PV"|"SAN"|"PE"|"PD"} resourceKey
	 * @param {number} amount
	 * @param {object} [options]
	 * @param {string} [options.duration]
	 * @param {string} [options.label]
	 * @param {string} [options.icon]
	 * @returns {Promise<{ amount: number, resourceKey: string }|null>}
	 */
	async applyTemporaryResource(resourceKey, amount, { duration = "scene", label = "", icon = "" } = {}) {
		const key = String(resourceKey ?? "").toUpperCase();
		const valid = new Set(["PV", "SAN", "PE", "PD"]);
		if (!valid.has(key)) return null;

		const grant = Math.max(0, Number(amount) || 0);
		if (grant <= 0) return { amount: 0, resourceKey: key };

		const current = Number(this.system[key]?.temp ?? 0);
		if (!shouldReplaceTemporaryResource(current, grant)) {
			return { amount: 0, resourceKey: key, kept: current };
		}

		const nextTemp = resolveTemporaryResourceAmount(current, grant);

		if (!this.isOwner) {
			const gmOnline = game.users.some((u) => u.isGM && u.active);
			if (!gmOnline) {
				ui.notifications.warn(game.i18n.localize("op.applyHealingNeedsGM"));
				return null;
			}
			game.socket.emit("system.ordemparanormal", {
				type: "applyTemporaryResource",
				actorUuid: this.uuid,
				resourceKey: key,
				amount: grant,
				options: { duration, label, icon },
				userId: game.user.id,
			});
			return { amount: nextTemp, resourceKey: key };
		}

		const path = `system.${key}.temp`;
		const legacyEffects = findTemporaryResourceEffects(this, key);
		if (legacyEffects.length) {
			await this.deleteEmbeddedDocuments(
				"ActiveEffect",
				legacyEffects.map((effect) => effect.id),
				{ ordemparanormal: { skipTemporaryResourceClear: true } }
			);
		}

		await this.update({ [path]: nextTemp });

		const effectDuration = ritualDurationToEffectDuration(duration === "instantaneous" ? "scene" : duration);
		const resourceLabel = game.i18n.localize(`op.${key === "SAN" ? "San" : key}`);
		await this.createEmbeddedDocuments("ActiveEffect", [
			{
				name: label || game.i18n.format("op.temporaryResourceEffect", { resource: resourceLabel, amount: nextTemp }),
				icon: icon || "icons/svg/upgrade.svg",
				duration: effectDuration,
				flags: { ordemparanormal: { temporaryResource: key } },
			},
		]);

		return { amount: nextTemp, resourceKey: key };
	}

	async applyHealing(amount, { ageYears = 0 } = {}) {
		const isThreat = this.type === "threat";
		const resource = isThreat ? this.system.attributes?.hp : this.system.PV;
		if (!resource) return { healed: 0, newPV: null, newAge: null };

		const healed = Math.max(0, Number(amount) || 0);
		const years = this.type === "agent" ? Math.max(0, Number(ageYears) || 0) : 0;
		if (healed <= 0 && !years) return { healed: 0, newPV: resource.value, newAge: null };

		if (!this.isOwner) {
			const gmOnline = game.users.some((u) => u.isGM && u.active);
			if (!gmOnline) {
				ui.notifications.warn(game.i18n.localize("op.applyHealingNeedsGM"));
				return { healed: 0, newPV: null, newAge: null };
			}
			game.socket.emit("system.ordemparanormal", {
				type: "applyHealing",
				actorUuid: this.uuid,
				amount: healed,
				options: { ageYears: years },
				userId: game.user.id,
			});
			return { healed, newPV: null, newAge: null };
		}

		const max = Number(resource.max ?? resource.value);
		const newPV = Math.min(max, (Number(resource.value) || 0) + healed);
		const actualHeal = newPV - (Number(resource.value) || 0);
		const hpKey = isThreat ? "system.attributes.hp.value" : "system.PV.value";
		const updates = {};
		if (actualHeal > 0) updates[hpKey] = newPV;
		let newAge = null;
		if (years) {
			newAge = (Number(this.system.age) || 0) + years;
			updates["system.age"] = newAge;
		}
		if (!Object.keys(updates).length) {
			return { healed: 0, newPV: resource.value, newAge: null };
		}
		await this.update(updates);
		return { healed: actualHeal, newPV, newAge };
	}

	/**
	 * Roll an Ability Check.
	 * @param {Partial<AbilityRollProcessConfiguration>} config  Configuration information for the roll.
	 * @param {Partial<BasicRollDialogConfiguration>} dialog     Configuration for the roll dialog.
	 * @param {Partial<BasicRollMessageConfiguration>} message   Configuration for the roll message.
	 * @returns {Promise<D20Roll[]|null>}                        A Promise which resolves to the created Roll instance.
	 */
	async #rollAttributeCheck(type, config = {}, dialog = {}, message = {}) {
		const attributeLabel = game.i18n.localize(CONFIG.op.attributes[config.attribute] ?? "");
		const dialogConfig = foundry.utils.mergeObject(
			{
				options: {
					window: {
						title: game.i18n.format("op.AttributePromptTitle", { attribute: attributeLabel }),
						subtitle: this.name,
					},
				},
			},
			dialog
		);
		return this.#rollD20Test("check", config, dialogConfig, message);
	}

	/**
	 * @typedef {D20RollProcessConfiguration} AbilityRollProcessConfiguration
	 * @property {string} [ability]  ID of the ability to roll as found in `CONFIG.op.abilities`.
	 */

	/**
	 * Shared rolling functionality between ability checks & saving throws.
	 * @param {"check"} type                     								 D20 test type.
	 * @param {Partial<AbilityRollProcessConfiguration>} config  Configuration information for the roll.
	 * @param {Partial<BasicRollDialogConfiguration>} dialog     Configuration for the roll dialog.
	 * @param {Partial<BasicRollMessageConfiguration>} message   Configuration for the roll message.
	 * @returns {Promise<D20Roll[]|null>}               A Promise which resolves to the created Roll instance.
	 */
	async #rollD20Test(type, config = {}, dialog = {}, message = {}) {
		const name = "AttributeCheck";
		const oldName = "AttributeTest";

		const attribute = this.system.attributes?.[config.attribute];
		const attributeConfig = game.i18n.localize(CONFIG.op.attributes[config.attribute]);

		const rollData = this.getRollData();
		const { parts, data } = CONFIG.Dice.BasicRoll.constructParts(
			{
				// bonus: attribute?.bonus,
				// prof: ability?.[`${type}Prof`].hasProficiency ? ability[`${type}Prof`].term : null,
				// [`${config.ability}${type.capitalize()}Bonus`]: ability?.bonuses[type],
				// [`${type}Bonus`]: this.system.bonuses?.abilities?.[type],
				// cover: (config.ability === 'dex') && (type === 'save') ? this.system.attributes?.ac?.cover : null
			},
			rollData
		);
		const options = {};

		const buildConfig = this._buildAttributesConfig.bind(this, type);

		const rollConfig = foundry.utils.mergeObject(
			{
				attributeId: config.attribute,
			},
			config
		);
		// const rollConfig = config;
		rollConfig.hookNames = [...(config.hookNames ?? []), name, "d20Test"];
		rollConfig.rolls = [BasicRoll.mergeConfigs({ parts, data, options }, config.rolls?.shift())].concat(
			config.rolls ?? []
		);
		// rollConfig.rolls.forEach(({ parts, data }) => this.addRollExhaustion(parts, data));
		rollConfig.subject = this;

		// const dialogConfig = foundry.utils.deepClone(dialog);
		const dialogConfig = foundry.utils.mergeObject(
			{
				applicationClass: AttributeRollConfigurationDialog,
				options: {
					buildConfig,
					chooseAbility: false,
				},
			},
			dialog
		);

		const messageConfig = foundry.utils.mergeObject(
			{
				create: true,
				data: {
					flags: {
						ordemparanormal: {
							messageType: "roll",
							roll: {
								attribute: config.attribute,
								type: "attribute",
							},
						},
					},
					flavor: game.i18n.format("op.AttributePromptTitle", { attribute: attributeConfig ?? "" }),
					speaker: ChatMessage.getSpeaker({ actor: this }),
				},
			},
			message
		);

		const rolls = await CONFIG.Dice.D20Roll.build(rollConfig, dialogConfig, messageConfig);

		message.rollMode = messageConfig.rollMode;

		if (!rolls.length) return null;

		return rolls;
	}

	/* -------------------------------------------- */

	/**
	 * Roll a generic ability test or saving throw.
	 * Prompt the user for input on which variety of roll they want to do.
	 * @param {Partial<AbilityRollProcessConfiguration>} config  Configuration information for the roll.
	 * @param {Partial<BasicRollDialogConfiguration>} dialog     Configuration for the roll dialog.
	 * @param {Partial<BasicRollMessageConfiguration>} message   Configuration for the roll message.
	 */
	rollAttribute(config = {}, dialog = {}, message = {}) {
		const attributeId = config.attribute;
		const attributeLabel = game.i18n.localize(CONFIG.op.attributes[attributeId] ?? "");
		// new foundry.applications.api.Dialog({
		// 	window: { title: `${game.i18n.format('op.AbilityPromptTitle', { ability: label })}: ${this.name}` },
		// 	position: { width: 400 },
		// 	content: `<p>${game.i18n.format('op.AbilityPromptText', { ability: label })}</p>`,
		// 	buttons: [
		// 		{
		// 			action: 'test',
		// 			label: game.i18n.localize('op.ActionAbil'),
		// 			callback: () => this.rollAttributeCheck(config, dialog, message)
		// 		}
		// 	]
		// }).render({ force: true });

		const dialogConfig = foundry.utils.mergeObject(
			{
				options: {
					window: {
						title: game.i18n.format("op.AttributePromptTitle", { attribute: attributeLabel }),
						subtitle: this.name,
					},
				},
			},
			dialog
		);

		return this.#rollAttributeCheck("attribute", config, dialogConfig, message);
	}

	/* -------------------------------------------- */

	/**
	 * Roll an ability check with a skill.
	 * @param {Partial<SkillToolRollProcessConfiguration>} config  Configuration information for the roll.
	 * @param {Partial<SkillToolRollDialogConfiguration>} dialog   Configuration for the roll dialog.
	 * @param {Partial<BasicRollMessageConfiguration>} message     Configuration for the roll message.
	 * @returns {Promise<D20Roll[]|null>}                          A Promise which resolves to the created Roll instance.
	 */
	async rollSkill(config = {}, dialog = {}, message = {}) {
		const skillLabel = game.i18n.localize(CONFIG.op.skills[config.skill] ?? "");
		const ability = this.system.skills[config.skill]?.attr[0] ?? "";
		const abilityLabel = game.i18n.localize(CONFIG.op.attributes[ability] ?? "");
		const dialogConfig = foundry.utils.mergeObject(
			{
				options: {
					window: {
						title: game.i18n.format("op.SkillPromptTitle", { skill: skillLabel, ability: abilityLabel }),
						subtitle: this.name,
					},
				},
			},
			dialog
		);

		return this.#rollSkillTool("skill", config, dialogConfig, message);
	}

	/**
	 * Shared rolling functionality between skill & tool checks.
	 * @param {"skill"|"tool"} type                                Type of roll.
	 * @param {Partial<SkillToolRollProcessConfiguration>} config  Configuration information for the roll.
	 * @param {Partial<SkillToolRollDialogConfiguration>} dialog   Configuration for the roll dialog.
	 * @param {Partial<BasicRollMessageConfiguration>} message     Configuration for the roll message.
	 * @returns {Promise<D20Roll[]|null>}                          A Promise which resolves to the created Roll instance.
	 */
	async #rollSkillTool(type, config = {}, dialog = {}, message = {}) {
		// const name = type === 'skill' ? 'Skill' : 'ToolCheck';
		const name = "Skill";

		const skillConfig = game.i18n.localize(CONFIG.op.skills[config.skill]);

		// const toolConfig = CONFIG.op.tools[config.tool];
		if (type === "skill" && !skillConfig) {
			return this.#rollAttributeCheck(type, config, dialog, message);
		}

		const relevant = this.system.skills[config.skill];
		const buildConfig = this._buildSkillToolConfig.bind(this, type);

		const rollConfig = foundry.utils.mergeObject(
			{
				attributeId: relevant?.attr[0] ?? skillConfig.ability,
				advantage: false /* relevant?.roll.mode === CONFIG.Dice.D20Roll.ADV_MODE.ADVANTAGE, */,
				disadvantage: false /* relevant?.roll.mode === CONFIG.Dice.D20Roll.ADV_MODE.DISADVANTAGE, */,
				// halflingLucky: this.getFlag('ordemparanormal', 'halflingLucky'),
				// reliableTalent: (relevant?.value >= 1) && this.getFlag('ordemparanormal', 'reliableTalent')
			},
			config
		);
		rollConfig.hookNames = [...(config.hookNames ?? []), type, "abilityCheck", "d20Test"];
		rollConfig.rolls = [
			BasicRoll.mergeConfigs(
				{
					options: {
						advantage: rollConfig.advantage || false,
						disadvantage: rollConfig.disadvantage || false,
					},
				},
				config.rolls?.shift()
			),
		].concat(config.rolls ?? []);
		rollConfig.subject = this;

		const dialogConfig = foundry.utils.mergeObject(
			{
				applicationClass: SkillToolRollConfigurationDialog,
				options: {
					buildConfig,
					chooseAbility: true,
				},
			},
			dialog
		);

		const abilityLabel = game.i18n.localize(CONFIG.op.attributes[relevant?.attr[0] ?? ""]);
		const messageConfig = foundry.utils.mergeObject(
			{
				create: true,
				data: {
					flags: {
						ordemparanormal: {
							messageType: "roll",
							roll: {
								[`${type}Id`]: config[type],
								type,
							},
						},
					},
					flavor: game.i18n.format("op.SkillPromptTitle", { skill: skillConfig, ability: abilityLabel }),
					speaker: ChatMessage.getSpeaker({ actor: this }),
				},
			},
			message
		);

		const rolls = await CONFIG.Dice.D20Roll.build(rollConfig, dialogConfig, messageConfig);

		if (!rolls.length) return null;

		return rolls;
	}

	/**
	 * Configure a roll config for each roll performed as part of the skill or tool check process. Will be called once
	 * per roll in the process each time an option is changed in the roll configuration interface.
	 * @param {"skill"|"tool"} type                          Type of roll.
	 * @param {D20RollProcessConfiguration} process          Configuration for the entire rolling process.
	 * @param {D20RollConfiguration} config                  Configuration for a specific roll.
	 * @param {FormDataExtended} [formData]                  Any data entered into the rolling prompt.
	 * @param {number} index                                 Index of the roll within all rolls being prepared.
	 */
	_buildSkillToolConfig(type, process, config, formData, index) {
		const skill = this.system.skills?.[process.skill];
		const rollData = this.getRollData();
		const attributeId = formData?.get("attribute") ?? process.attributeId;
		const attribute = this.system.attributes?.[attributeId];
		const prof = skill.degree.value; // this.system.calculateAbilityCheckProficiency(relevant?.effectValue ?? 0, attributeId);
		const hasProficiency = skill.degree.value > 0;

		// TODO: Local para adicionar possíveis partes adicionais de bônus. É preciso aprofundamento no método de constructParts;
		const { parts, data } = CONFIG.Dice.BasicRoll.constructParts(
			{
				prof: hasProficiency ? prof : null,
				mod: skill?.mod || null,
				extraBonus: skill.value || null,
			},
			{ ...rollData }
		);

		// Add exhaustion reduction
		// this.addRollExhaustion(parts, data);

		config.parts = [...(config.parts ?? []), ...parts];
		config.data = { ...data, ...(config.data ?? {}) };
		config.data.attributeId = attributeId;
		const diceMod = Number(skill?.diceMod) || 0;
		const conditionDice = getConditionDicePenalty(this, {
			skill: process.skill,
			attributeId,
		});
		config.data.diceMod = diceMod + conditionDice;
		if (diceMod !== 0) console.log(`[OP DEV] Skill "${process.skill}" diceMod = ${diceMod}`);
	}

	/** */
	_buildAttributesConfig(type, process, config, formData, index) {
		const rollData = this.getRollData();
		const attributeId = formData?.get("attribute") ?? process.attributeId;
		const attribute = this.system.attributes?.[attributeId];

		// TODO: Local para adicionar possíveis partes adicionais de bônus. É preciso aprofundamento no método de constructParts;
		const { parts, data } = CONFIG.Dice.BasicRoll.constructParts(
			{
				// prof: hasProficiency ? prof : null,
				// mod: skill?.mod || null,
				// extraBonus: skill.value || null,
				// [`${config[type]}Bonus`]: relevant?.bonuses?.check,
				// [`${abilityId}CheckBonus`]: ability?.bonuses?.check,
				// [`${type}Bonus`]: this.system.bonuses?.abilities?.[type],
				// abilityCheckBonus: this.system.bonuses?.abilities?.check
			},
			{ ...rollData }
		);

		config.parts = [...(config.parts ?? []), ...parts];
		config.data = { ...data, ...(config.data ?? {}) };
		config.data.attributeId = attributeId;
		config.data.diceMod = getConditionDicePenalty(this, { attributeId });
	}
}
