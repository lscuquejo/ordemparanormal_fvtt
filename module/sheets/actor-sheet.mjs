/* eslint-disable new-cap */
// TABS: https://foundryvtt.wiki/en/development/guides/Tabs-and-Templates/Tabs-in-AppV2

import { AgentConfigApp } from "../applications/agent-config-app.mjs";
import { createAttackProfileId, prepareAttackProfileRows } from "../helpers/attack-profiles.mjs";
import { prepareActiveEffectCategories } from "../helpers/effects.mjs";
import {
	canLevelUpNex,
	canLevelUpNivel,
	canLevelUpStage,
	getNextNexValue,
	getNextNivelValue,
	getNextStageValue,
	NEX_MAX,
} from "../helpers/actor-calculations.mjs";
import { prepareConditionSheetDisplay } from "../helpers/condition-effects.mjs";
import { getActiveStatBonuses, prepareActiveRdDisplay } from "../helpers/ritual-effects.mjs";
import { removeEnchantmentFromWeapon, toggleEnchantmentOnWeapon } from "../helpers/ritual-enchantments.mjs";
import { getRitualSheetTargetLabel, getRitualZoneDtBonus } from "../helpers/ritual-zones.mjs";
import {
	getActiveWeaponModifiers,
	getEffectiveCriticalFormula,
	itemModifiesWeapons,
} from "../helpers/weapon-modifiers.mjs";

const { api, sheets } = foundry.applications;
// const TextEditor = foundry.applications.ux.TextEditor.implementation;

/**
 * Extend the basic ActorSheet with some very simple modifications
 * @extends {ActorSheet}
 */
export class OrdemActorSheet extends api.HandlebarsApplicationMixin(sheets.ActorSheetV2) {
	/** @override */
	static DEFAULT_OPTIONS = {
		classes: ["ordemparanormal", "sheet", "actor", "themed", "theme-light"],
		tag: "form",
		roll: this._onRoll,
		dragDrop: [{ dragSelector: "[data-drag]", dropSelector: null }],
		position: {
			width: 600,
			height: 820,
		},
		window: {
			resizable: true,
			title: "DCC.ActorSheetTitle", // Just the localization key
		},
		form: {
			submitOnChange: true,
		},
		actions: {
			onEditImage: this.#onEditImage,
			onSendChat: this.#onSendChat,
			onMarkItem: this.#onMarkItem,
			onItemCreate: this.#onItemCreate,
			viewDoc: this._viewDoc,
			createDoc: this._createDoc,
			deleteDoc: this._deleteDoc,
			toggleEffect: this._toggleEffect,
			onRoll: this.#onRoll,
			ritualCast: this.#onRitualCast,
			toggleWeaponMod: this.#onToggleWeaponMod,
			createAttackProfile: this.#onCreateAttackProfile,
			editAttackProfile: this.#onEditAttackProfile,
			deleteAttackProfile: this.#onDeleteAttackProfile,
			rollAttackProfile: this.#onRollAttackProfile,
			toggleWeaponEnchantment: this.#onToggleWeaponEnchantment,
			removeWeaponEnchantment: this.#onRemoveWeaponEnchantment,
			onRollSkillCheck: this.#onRollSkillCheck,
			onRollAttributeTest: this.#onRollAttributeTest,
			diceModIncrement: this.#onDiceModChange,
			diceModDecrement: this.#onDiceModChange,
			toggleResources: this._onToggleResources,
			toggleManualEdit: this.#onToggleManualEdit,
			enableManualEdit: this.#onEnableManualEdit,
			restoreAutomation: this.#onRestoreAutomation,
			levelUpProgress: this.#onLevelUpProgress,
			openConfig: this.#openConfig,
			findItem: this.#findItem,
		},
	};

	/** @inheritDoc */
	static PARTS = {
		agent: { id: "agent", template: "systems/ordemparanormal/templates/actor/actor-agent-sheet.hbs", scrollable: [""] },
		tabs: { id: "tabs", template: "templates/generic/tab-navigation.hbs", scrollable: [""] },
		skills: {
			id: "skills",
			template: "systems/ordemparanormal/templates/actor/parts/actor-skills.hbs",
			scrollable: [""],
		},
		inventory: {
			id: "inventory",
			template: "systems/ordemparanormal/templates/actor/parts/actor-inventory.hbs",
			scrollable: [""],
		},
		attacks: {
			id: "attacks",
			template: "systems/ordemparanormal/templates/actor/parts/actor-attacks.hbs",
			scrollable: [""],
		},
		abilities: {
			id: "abilities",
			template: "systems/ordemparanormal/templates/actor/parts/actor-abilities.hbs",
			scrollable: [""],
		},
		rituals: {
			id: "rituals",
			template: "systems/ordemparanormal/templates/actor/parts/actor-rituals.hbs",
			scrollable: [""],
		},
		biography: {
			id: "biography",
			template: "systems/ordemparanormal/templates/actor/parts/actor-biography.hbs",
			scrollable: [""],
		},
		effects: { id: "effects", template: "systems/ordemparanormal/templates/shared/effects.hbs", scrollable: [""] },
	};

	/** @inheritDoc */
	static TABS = {
		primary: {
			// This is the group name
			tabs: [
				{ id: "skills", label: "op.tab.skills" },
				{ id: "inventory", label: "op.tab.inventory" },
				{ id: "attacks", label: "op.tab.attacks" },
				{ id: "abilities", label: "op.tab.abilities" },
				{ id: "rituals", label: "op.tab.rituals" },
				{ id: "biography", label: "op.tab.biography" },
				{ id: "effects", label: "op.tab.effects" },
			],
			initial: "skills",
		},
	};

	/** @override */
	_configureRenderOptions(options) {
		super._configureRenderOptions(options);
		// Not all parts always render
		options.parts = ["agent", "tabs"];
		// Don't show the other tabs if only limited view
		if (this.document.limited) return;
		// Control which parts show based on document subtype
		switch (this.document.type) {
			case "agent":
				options.parts.push("skills", "inventory", "attacks", "abilities", "rituals", "biography", "effects");
				break;
		}
	}

	/* -------------------------------------------- */

	/** @override */
	async _prepareContext(options) {
		const context = await super._prepareContext(options);

		context.mostrarRecursos = this.actor.getFlag("ordemparanormal", "showResources") || false;

		foundry.utils.mergeObject(context, {
			editable: this.isEditable,
			owner: this.document.isOwner,
			limited: this.document.limited,
			system: this.options.document.system,
			flags: this.actor.flags,
			actor: this.options.document,
			config: CONFIG.op,
			// Add roll data for TinyMCE editors.
			// rollData: context.actor.getRollData(),
			// Return all effects stored on the actor.
			effects: prepareActiveEffectCategories(this.actor.allApplicableEffects()),
			// Dropdown options.
			optionDegree: CONFIG.op.dropdownDegree,
			optionClass: CONFIG.op.dropdownClass,
			optionTrilhas: CONFIG.op.dropdownTrilha,
			optionOrigins: CONFIG.op.dropdownOrigins,
			// Rules & Conditions
			progressRuleIsNivel: this.progressRuleIsNivel,
			progressRuleIsNEX: this.progressRuleIsNEX,
			usingWithoutSanityRule: this.usingWithoutSanityRule,
			isSurvivor: this.isSurvivor,
			tabs: this._getTabs(options.parts),
			costLabel: this.usingWithoutSanityRule ? "PD" : "PE",
			skillTotals: this._prepareSkillTotals(this.options.document.system.skills),
			lockDerivedFields: !this.actor.system.fieldsUnlocked,
			statBonuses: getActiveStatBonuses(this.actor),
			conditionDisplay: prepareConditionSheetDisplay(this.actor),
			activeRd: prepareActiveRdDisplay(this.actor),
			progressControl: this._prepareProgressControl(),
			resourceTemps: this._prepareResourceTemps(this.options.document.system),
			ritualDtZoneBonus: getRitualZoneDtBonus(this.actor),
		});

		// Prepara os dados do Agente e seus Items.
		await this._prepareItems(context);

		return context;
	}

	/**
	 * @returns {object}
	 */
	/**
	 * @param {object} sys
	 * @returns {Record<string, string>}
	 */
	_prepareResourceTemps(sys) {
		const format = (resource) => {
			const temp = Number(resource?.temp ?? 0);
			return temp > 0 ? `(${temp})` : "";
		};
		return {
			PV: format(sys.PV),
			SAN: format(sys.SAN),
			PE: format(sys.PE),
			PD: format(sys.PD),
		};
	}

	_prepareProgressControl() {
		const sys = this.actor.system;
		const nexValue = Number(sys.NEX?.value) || 0;
		const nivelValue = Number(sys.nivel?.value) || 0;
		const stageValue = Number(sys.stage?.value) || 0;

		return {
			nex: {
				value: nexValue,
				display: `${nexValue}%`,
				canLevelUp: canLevelUpNex(nexValue),
				next: getNextNexValue(nexValue),
			},
			nivel: {
				value: nivelValue,
				display: String(nivelValue),
				canLevelUp: canLevelUpNivel(nivelValue),
				next: getNextNivelValue(nivelValue),
			},
			stage: {
				value: stageValue,
				display: String(stageValue),
				canLevelUp: canLevelUpStage(stageValue),
				next: getNextStageValue(stageValue),
			},
		};
	}

	/** */
	async _preparePartContext(partId, context) {
		switch (partId) {
			// Enrich biography info for display
			// Enrichment turns text like `[[/r 1d20]]` into buttons
			case "biography":
				context.tab = context.tabs[partId];
				context.enrichedBiography = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
					this.actor.system.biography,
					{
						// Whether to show secret blocks in the finished html
						secrets: this.document.isOwner,
						// Data to fill in for inline rolls
						rollData: this.actor.getRollData(),
						// Relative UUID resolution
						relativeTo: this.actor,
					}
				);
				// Enrich biography info for display
				// Enrichment turns text like `[[/r 1d20]]` into buttons
				context.enrichedGoals = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
					this.actor.system.goals,
					{
						// Whether to show secret blocks in the finished html
						secrets: this.document.isOwner,
						// Data to fill in for inline rolls
						rollData: this.actor.getRollData(),
						// Relative UUID resolution
						relativeTo: this.actor,
					}
				);

				break;
			case "skills":
			case "abilities":
			case "inventory":
			case "attacks":
			case "rituals":
				context.tab = context.tabs[partId];
				if (partId === "attacks") this._prepareAttackProfiles(context);
				break;
			case "effects":
				context.tab = context.tabs[partId];
				// Prepare active effects
				context.effects = prepareActiveEffectCategories(
					// A generator that returns all effects stored on the actor
					// as well as any items
					this.actor.allApplicableEffects()
				);
				break;
		}
		return context;
	}

	/**
	 * Generates the data for the generic tab navigation template
	 * @param {string[]} parts An array of named template parts to render
	 * @returns {Record<string, Partial<ApplicationTab>>}
	 * @protected
	 */
	_getTabs(parts) {
		// If you have sub-tabs this is necessary to change
		const tabGroup = "primary";
		// Default tab for first time it's rendered this session
		if (!this.tabGroups[tabGroup]) this.tabGroups[tabGroup] = "skills";
		return parts.reduce((tabs, partId) => {
			const tab = {
				cssClass: "",
				group: tabGroup,
				// Matches tab property to
				id: "",
				// FontAwesome Icon, if you so choose
				icon: "",
				// Run through localization
				label: "op.tab.",
			};
			switch (partId) {
				case "agent":
				case "tabs":
					return tabs;
				case "skills":
					tab.id = "skills";
					tab.label += "skills";
					break;
				case "abilities":
					tab.id = "abilities";
					tab.label += "abilities";
					break;
				case "effects":
					tab.id = "effects";
					tab.label += "effects";
					break;
				case "rituals":
					tab.id = "rituals";
					tab.label += "rituals";
					break;
				case "biography":
					tab.id = "biography";
					tab.label += "biography";
					break;
				case "inventory":
					tab.id = "inventory";
					tab.label += "inventory";
					break;
			}
			if (this.tabGroups[tabGroup] === tab.id) tab.cssClass = "active";
			tabs[partId] = tab;
			return tabs;
		}, {});
	}

	/**
	 *
	 */
	get progressRuleIsNivel() {
		const rule = game.settings.get("ordemparanormal", "globalProgressRules");
		return rule == 2 ? true : false;
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
		return rule == 1 ? true : false;
	}

	/**
	 *
	 */
	get isSurvivor() {
		return this.document.system._isSurvivor ?? false;
	}

	/**
	 * Organize and classify Items for Character sheets.
	 *
	 * @param {Object} actorData The actor to prepare.
	 *
	 * @return {undefined}
	 */
	async _prepareItems(context) {
		const details = { origin: null, class: null, path: null };
		const protection = [];
		const generalEquipment = [];
		const armament = [];
		const rituals = {
			valid: { 1: [], 2: [], 3: [], 4: [] },
			invalid: [],
		};
		const abilities = {
			// 1 = Origem 2 = Classe 3 = Trilha 4 = Geral 5 = Paranormal 6 = Habilidade/Complicação
			valid: { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] },
			invalid: [],
		};

		// Pega o rótulo global (PE ou PD) que já foi definido no _prepareContext com base na configuração
		const labelCusto = context.custoLabel || "PE";

		this.expanded ??= new Set();

		// Iterate through items, allocating to containers
		for (const i of this.document.items) {
			i.img = i.img || DEFAULT_TOKEN;

			// Sinaliza para o HTML se este item está aberto
			i.isExpanded = this.expanded.has(i.id);

			if (i.isExpanded && i.system.description) {
				if (!i.enrichedDescription || i._cachedDescriptionText !== i.system.description) {
					i.enrichedDescription = await foundry.applications.ux.TextEditor.implementation.enrichHTML(i.system.description, {
						secrets: this.document.isOwner,
						rollData: this.actor.getRollData(),
						relativeTo: this.actor,
					});

					i._cachedDescriptionText = i.system.description;
				}
			}

			// Creating the data to use an item
			i.system.using = !i.system.using ? [true, "fas"] : i.system.using;

			// Append to protections.
			if (i.type === "protection") {
				protection.push(i);
			}
			// Append to general equipment.
			else if (i.type === "generalEquipment") {
				generalEquipment.push(i);
			}
			// Append to armament.
			else if (i.type === "armament") {
				const activeEnchants = (i.system.enchantments ?? []).filter((e) => e.active);
				i.enchantmentLabels = activeEnchants.map((e) => e.ritualName);
				i.effectiveCritical = getEffectiveCriticalFormula(i);
				i.hasEnchantments = (i.system.enchantments ?? []).length > 0;
				i.enchantmentsList = (i.system.enchantments ?? []).map((e) => ({
					...e,
					summary: [
						e.attackBonus ? `+${e.attackBonus} atk` : null,
						e.critMarginBonus ? `+${e.critMarginBonus} crit` : null,
						e.damageBonuses?.length ? `+${e.damageBonuses.join("+")}` : null,
					]
						.filter(Boolean)
						.join(", "),
				}));
				armament.push(i);
			}
			// Append to item.
			else if (i.type === "item") {
				gear.push(i);
			}
			// Append to rituals.
			else if (i.type === "ritual") {
				i.sheetTargetLabel = getRitualSheetTargetLabel(i);
				if (i.system.circle != 5) rituals.valid[i.system.circle].push(i);
				else rituals.invalid.push(i);
			}
			// Append to abilities.
			else if (i.type === "ability") {
				const abilityType = i.system.abilityType;
				const costVal = i.system.cost || "";

				// Em vez de ler i.system.costType, usamos a configuração global (labelCusto)
				i.displayCost = costVal !== "" ? `${costVal} ${labelCusto}` : "—";

				if (i.system.activation) {
					i.activationLabel = game.i18n.localize(`op.executionChoices.${i.system.activation}`);
				} else {
					i.activationLabel = "—";
				}

				i.modifiesWeapons = itemModifiesWeapons(i);
				if (i.modifiesWeapons) {
					i.weaponModActive = Boolean(i.system.using?.state);
					const atk = Number(i.system.weaponMod?.attackBonus) || 0;
					const dmg = i.system.weaponMod?.damageBonus || "";
					i.weaponModSummary = [atk ? `+${atk} ${game.i18n.localize("op.attack")}` : null, dmg ? `+${dmg}` : null]
						.filter(Boolean)
						.join(", ");
				}

				if (abilityType === "origin") abilities.valid[1].push(i);
				else if (abilityType === "class") abilities.valid[2].push(i);
				else if (abilityType === "path") abilities.valid[3].push(i);
				else if (abilityType === "general") abilities.valid[4].push(i);
				else if (abilityType === "paranormal") abilities.valid[5].push(i);
				else if (abilityType === "ability" || abilityType === "complication") abilities.valid[6].push(i);
				else if (!abilityType) abilities.invalid.push(i);
			} else if (i.type === "origin") {
				details.origin = i;
			} else if (i.type === "class") {
				details.class = i;
			} else if (i.type === "path") {
				details.path = i;
			}
		}

		for (const s of Object.values(rituals.valid)) {
			s.sort((a, b) => (a.sort || 0) - (b.sort || 0));
		}

		for (const s of Object.values(abilities.valid)) {
			s.sort((a, b) => (a.sort || 0) - (b.sort || 0));
		}

		context.details = details;
		context.rituals = rituals;
		context.abilities = abilities;
		context.protection = protection.sort((a, b) => (a.sort || 0) - (b.sort || 0));
		context.generalEquip = generalEquipment.sort((a, b) => (a.sort || 0) - (b.sort || 0));
		context.armament = armament.sort((a, b) => (a.sort || 0) - (b.sort || 0));
	}

	/** @param {object} context */
	_prepareAttackProfiles(context) {
		const rows = prepareAttackProfileRows(this.actor);
		context.attackProfiles = rows.map((row) => {
			const baseItem = this.actor.items.get(row.baseArmamentId);
			return {
				...row,
				img: baseItem?.img ?? "icons/svg/sword.svg",
			};
		});

		const mods = getActiveWeaponModifiers(this.actor);
		context.activeWeaponMods = this.actor.items
			.filter((item) => itemModifiesWeapons(item) && item.system.using?.state)
			.map((item) => {
				const atk = Number(item.system.weaponMod?.attackBonus) || 0;
				const dmg = item.system.weaponMod?.damageBonus || "";
				const parts = [atk ? `+${atk} atk` : null, dmg ? `+${dmg}` : null].filter(Boolean);
				return { name: item.name, summary: parts.join(", ") || "—" };
			});
		if (!context.activeWeaponMods.length && mods.sources.length) {
			context.activeWeaponMods = mods.sources.map((name) => ({ name, summary: "—" }));
		}
	}

	/**
	 * Calculates skill totals for sheet display only.
	 *
	 * @param {Record<string, object>} skills Actor skills.
	 * @returns {Record<string, number>} Skill totals indexed by skill key.
	 */
	_prepareSkillTotals(skills = {}) {
		return Object.fromEntries(
			Object.entries(skills).map(([key, skill]) => {
				const degree = Number(skill.degree?.value ?? 0);
				const bonuses = Number(skill.value ?? 0);
				const modifier = Number(skill.mod ?? 0);

				return [key, degree + bonuses + modifier];
			})
		);
	}

	/**
	 * Actions performed after any render of the Application.
	 * Post-render steps are not awaited by the render process.
	 * @param {ApplicationRenderContext} context      Prepared context data
	 * @param {RenderOptions} options                 Provided render options
	 * @protected
	 * @override
	 */
	async _onRender(context, options) {
		await super._onRender(context, options);
		this.#disableOverrides();

		for (const input of this.element.querySelectorAll("input[type='number']")) {
			input.addEventListener("change", this._onChangeInputOP.bind(this));
		}

		for (const button of this.element.querySelectorAll(".adjustment-button")) {
			button.addEventListener("click", this._onAdjustInput.bind(this));
		}

		// V13 DOM API (no jQuery)
		for (const toggle of this.element.querySelectorAll(".item-toggle")) {
			toggle.addEventListener("click", this._onToggleDescription.bind(this));
		}

		for (const compendium of this.element.querySelectorAll(".compendium-event-contextmenu")) {
			compendium.addEventListener("contextmenu", this._onOpenCompendiumEntry.bind(this));
		}

		for (const compendium of this.element.querySelectorAll(".compendium-event-click")) {
			compendium.addEventListener("click", this._onOpenCompendiumEntry.bind(this));
		}
	}

	/**
	 * Define os controles extras no cabeçalho (header) da janela.
	 * @returns {ApplicationHeaderControlsEntry[]}
	 */
	_getHeaderControls() {
		// Puxa os controles padrões do Foundry (Fechar, Configurar Ficha, etc.)
		const controls = super._getHeaderControls();

		if (this.actor.isOwner) {
			// unshift() coloca o botão no começo da fila (mais à esquerda entre os botões da direita).
			controls.unshift({
				action: "restoreAutomation",
				icon: "fas fa-calculator",
				label: game.i18n.localize("op.restoreAutomation"),
			});
			controls.unshift({
				action: "enableManualEdit",
				icon: "fas fa-unlock",
				label: game.i18n.localize("op.manualEdit"),
			});
			controls.unshift({
				action: "openConfig",
				icon: "fas fa-id-card",
				label: game.i18n.localize("op.agentConfigTitleWindowNoName"),
			});
		}

		return controls;
	}

	/** ************
	 *
	 *   ACTIONS
	 *
	 **************/

	/**
	 * Handle changing a Document's image.
	 *
	 * @this BoilerplateActorSheet
	 * @param {PointerEvent} event   The originating click event
	 * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
	 * @returns {Promise}
	 * @protected
	 */
	static async #onEditImage(event, target) {
		const attr = target.dataset.edit;
		const current = foundry.utils.getProperty(this.document, attr);
		const { img } = this.document.constructor.getDefaultArtwork?.(this.document.toObject()) ?? {};
		// V13: Use namespaced FilePicker
		const fp = new foundry.applications.apps.FilePicker({
			current,
			type: "image",
			redirectToRoot: img ? [img] : [],
			callback: (path) => {
				this.document.update({ [attr]: path });
			},
			top: this.position.top + 40,
			left: this.position.left + 10,
		});
		return fp.browse();
	}

	/**
	 * Open the agent configuration dialog.
	 *
	 * @this OrdemActorSheet
	 * @param {PointerEvent} event
	 * @param {HTMLElement} target
	 */
	static #openConfig(event, target) {
		event.preventDefault();
		new AgentConfigApp(this.document).render({ force: true });
	}

	/**
	 * Read unsaved form values for derived fields before locking the sheet.
	 * @returns {Record<string, unknown>}
	 */
	_collectFormOverrides() {
		if (!this.form) return {};
		const formData = new FormDataExtended(this.form);
		const sys = foundry.utils.expandObject(formData.object).system;
		if (!sys) return {};

		const update = {};
		const addNumber = (overrideKey, value, systemKey) => {
			if (value === undefined || value === null || value === "") return;
			const num = Number(value);
			if (!Number.isFinite(num)) return;
			update[`system.overrides.${overrideKey}`] = num;
			update[`system.${systemKey}`] = num;
		};
		const addOverrideNumber = (overrideKey, value) => {
			if (value === undefined || value === null || value === "") return;
			const num = Number(value);
			if (!Number.isFinite(num)) return;
			update[`system.overrides.${overrideKey}`] = num;
		};
		const addString = (overrideKey, value, systemKey) => {
			if (typeof value !== "string" || !value.length) return;
			update[`system.overrides.${overrideKey}`] = value;
			update[`system.${systemKey}`] = value;
		};

		if (sys.PV) addNumber("PVMax", sys.PV.max, "PV.max");
		if (sys.SAN) addNumber("SANMax", sys.SAN.max, "SAN.max");
		if (sys.PE) {
			addNumber("PEMax", sys.PE.max, "PE.max");
			addNumber("PEPerRound", sys.PE.perRound, "PE.perRound");
		}
		if (sys.PD) {
			addNumber("PDMax", sys.PD.max, "PD.max");
			addNumber("PDPerRound", sys.PD.perRound, "PD.perRound");
		}
		// Defense/dodge/desloc on the sheet are derived totals — persist only as overrides.
		if (sys.defense) {
			addOverrideNumber("defense", sys.defense.value);
			addOverrideNumber("dodge", sys.defense.dodge);
		}
		if (sys.desloc) addOverrideNumber("desloc", sys.desloc.value);
		if (sys.patent) {
			addString("patentName", sys.patent.name, "patent.name");
			addNumber("itemLimit1", sys.patent.itemLimit1, "patent.itemLimit1");
			addNumber("itemLimit2", sys.patent.itemLimit2, "patent.itemLimit2");
			addNumber("itemLimit3", sys.patent.itemLimit3, "patent.itemLimit3");
			addNumber("itemLimit4", sys.patent.itemLimit4, "patent.itemLimit4");
		}
		return update;
	}

	async _setFieldsUnlocked(unlocked) {
		const actor = this.actor;
		if (Boolean(actor.system.fieldsUnlocked) === unlocked) return;
		const update = {
			"system.fieldsUnlocked": unlocked,
			"system.disableCalculations": true,
		};
		Object.assign(update, actor._snapshotManualOverrides());
		if (!unlocked && actor.system.fieldsUnlocked) {
			Object.assign(update, this._collectFormOverrides());
		}
		await actor.update(update);
		ui.notifications.info(game.i18n.localize(unlocked ? "op.manualEditEnabled" : "op.fieldsLocked"));
	}

	async _setManualEditMode(enabled) {
		const actor = this.actor;
		if (enabled) return this._setFieldsUnlocked(true);
		const update = actor._clearManualOverrides();
		update["system.disableCalculations"] = false;
		update["system.fieldsUnlocked"] = false;
		Object.assign(update, actor._resetDerivedStatBases());
		await actor.update(update);
		ui.notifications.info(game.i18n.localize("op.manualEditDisabled"));
	}

	static async #onEnableManualEdit(event) {
		event.preventDefault();
		event.stopPropagation();
		await this._setFieldsUnlocked(!this.actor.system.fieldsUnlocked);
	}

	static async #onRestoreAutomation(event) {
		event.preventDefault();
		event.stopPropagation();
		await this._setManualEditMode(false);
	}

	static async #onToggleManualEdit(event) {
		event.preventDefault();
		event.stopPropagation();
		await this._setFieldsUnlocked(!this.actor.system.fieldsUnlocked);
	}

	/**
	 * Renders an embedded document's sheet
	 *
	 * @this BoilerplateActorSheet
	 * @param {PointerEvent} event   The originating click event
	 * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
	 * @protected
	 */
	static async _viewDoc(event, target) {
		const doc = this._getEmbeddedDocument(target);
		doc.sheet.render(true);
	}

	/**
	 * Handles item deletion
	 *
	 * @this BoilerplateActorSheet
	 * @param {PointerEvent} event   The originating click event
	 * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
	 * @protected
	 */
	static async _deleteDoc(event, target) {
		const doc = this._getEmbeddedDocument(target);
		await doc.delete();
	}

	/**
	 * Handle creating a new Owned Item or ActiveEffect for the actor using initial data defined in the HTML dataset
	 *
	 * @this BoilerplateActorSheet
	 * @param {PointerEvent} event   The originating click event
	 * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
	 * @private
	 */
	static async _createDoc(event, target) {
		// Retrieve the configured document class for Item or ActiveEffect
		const docCls = getDocumentClass(target.dataset.documentClass);

		// Prepare the document creation data by initializing it a default name.
		const docData = {
			name: docCls.defaultName({
				// defaultName handles an undefined type gracefully
				type: target.dataset.type,
				parent: this.actor,
			}),
		};
		// Loop through the dataset and add it to our docData
		for (const [dataKey, value] of Object.entries(target.dataset)) {
			// These data attributes are reserved for the action handling
			if (["action", "documentClass"].includes(dataKey)) continue;
			foundry.utils.setProperty(docData, dataKey, value);
		}

		// Finally, create the embedded document!
		await docCls.create(docData, { parent: this.actor });
	}

	/**
	 * Handle creating a new Owned Item for the actor using initial data defined in the HTML dataset
	 * @param {Event} event   The originating click event
	 * @private
	 */
	static async #onItemCreate(event) {
		event.preventDefault();
		const header = event.currentTarget;
		// Get the type of item to create.
		const type = header.dataset.type;
		// Grab any data associated with this control.
		const data = foundry.utils.duplicate(header.dataset);
		// Initialize a default name.
		const name = game.i18n.localize("op.newItem") + " " + game.i18n.localize("TYPES.Item." + type);
		// Prepare the item object.
		const itemData = {
			name: name,
			type: type,
			system: data,
		};
		// Remove the type from the dataset since it's in the itemData.type prop.
		delete itemData.system["type"];

		// Finally, create the item!
		return await Item.create(itemData, { parent: this.actor });
	}

	/**
	 * Determines effect parent to pass to helper
	 *
	 * @this BoilerplateActorSheet
	 * @param {PointerEvent} event   The originating click event
	 * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
	 * @private
	 */
	static async _toggleEffect(event, target) {
		const effect = this._getEmbeddedDocument(target);
		await effect.update({ disabled: !effect.disabled });
	}

	/**
	 * Disables inputs subject to active effects
	 */
	#disableOverrides() {
		const flatOverrides = foundry.utils.flattenObject(this.actor.overrides);
		for (const override of Object.keys(flatOverrides)) {
			const input = this.element.querySelector(`[name="${override}"]`);
			if (input) {
				input.disabled = true;
			}
		}
	}

	/**
	 * Handle opening a skill's compendium entry
	 * @param {Event} event	 The originating click event
	 * @private
	 */
	async _onOpenCompendiumEntry(event) {
		const parent = event.currentTarget.closest("li") ?? event.currentTarget;
		const key = parent.dataset.key ?? null;
		console.log(parent, key);
		if (!key || !CONFIG.op.CompendiumEntries[key]) return;
		const entryKey = CONFIG.op.CompendiumEntries[key];
		await foundry.documents.collections.Journal._showEntry(entryKey, true);
	}

	/** */
	static async _onToggleResources(event, target) {
		event.preventDefault();
		// Pega o estado atual (ou false se não existir)
		const currentState = this.actor.getFlag("ordemparanormal", "showResources") || false;
		// Salva o inverso (!currentState)
		await this.actor.setFlag("ordemparanormal", "showResources", !currentState);
	}

	/** */
	_onToggleDescription(event) {
		event.preventDefault();
		const li = event.currentTarget.closest(".item");
		const itemId = li.dataset.itemId;

		// Garante que o Set existe na primeira vez que for clicado
		this.expanded ??= new Set();

		if (this.expanded.has(itemId)) {
			this.expanded.delete(itemId);
		} else {
			this.expanded.add(itemId);
		}
		// Força a re-renderização da ficha para que o _prepareItems processe o HTML
		this.render();
	}

	/**
	 *
	 * @param {*} event
	 * @returns
	 */
	async _onAdjustInput(event) {
		const button = event.currentTarget;
		const { action } = button.dataset;
		const input = button.parentElement.querySelector("input");
		const min = input.min ? Number(input.min) : -Infinity;
		const max = input.max ? Number(input.max) : Infinity;
		let value = Number(input.value);
		if (isNaN(value)) return;
		value += action === "increase" ? 1 : -1;
		input.value = Math.clamp(value, min, max);
		input.dispatchEvent(new Event("change"));
	}

	/**
	 *
	 * @param {*} event
	 * @returns
	 */
	async _onChangeInputOP(event, target) {
		const itemId = event.currentTarget.closest("[data-item-id]")?.dataset.itemId;
		if (!itemId) return;

		event.stopImmediatePropagation();
		const item = this.document.items.get(itemId);
		const min = event.target.min !== "" ? Number(event.target.min) : -Infinity;
		const max = event.target.max !== "" ? Number(event.target.max) : Infinity;
		const value = Math.clamp(event.target.valueAsNumber, min, max);

		if (!item || Number.isNaN(value)) return;

		event.target.value = value;
		item.update({ [event.target.dataset.name]: value });
	}

	/* -------------------------------------------- */

	/** @inheritdoc */
	async _onDropActiveEffect(event, data) {
		// const effect = await ActiveEffect.implementation.fromDropData(data);
		// if (effect?.target === this.actor) return false;
		// return super._onDropActiveEffect(event, data);
		const aeCls = getDocumentClass("ActiveEffect");
		const effect = await aeCls.fromDropData(data);
		if (!this.actor.isOwner || !effect) return false;
		if (effect.target === this.actor) return this._onSortActiveEffect(event, effect);
		return aeCls.create(effect, { parent: this.actor });
	}

	/**
	 * Handle a drop event for an existing embedded Active Effect to sort that Active Effect relative to its siblings
	 *
	 * @param {DragEvent} event
	 * @param {ActiveEffect} effect
	 */
	async _onSortActiveEffect(event, effect) {
		/** @type {HTMLElement} */
		const dropTarget = event.target.closest("[data-effect-id]");
		if (!dropTarget) return;
		const target = this._getEmbeddedDocument(dropTarget);

		// Don't sort on yourself
		if (effect.uuid === target.uuid) return;

		// Identify sibling items based on adjacent HTML elements
		const siblings = [];
		for (const el of dropTarget.parentElement.children) {
			const siblingId = el.dataset.effectId;
			const parentId = el.dataset.parentId;
			if (siblingId && parentId && (siblingId !== effect.id || parentId !== effect.parent.id))
				siblings.push(this._getEmbeddedDocument(el));
		}

		// Perform the sort
		const sortUpdates = SortingHelpers.performIntegerSort(effect, {
			target,
			siblings,
		});

		// Split the updates up by parent document
		const directUpdates = [];

		const grandchildUpdateData = sortUpdates.reduce((items, u) => {
			const parentId = u.target.parent.id;
			const update = { _id: u.target.id, ...u.update };
			if (parentId === this.actor.id) {
				directUpdates.push(update);
				return items;
			}
			if (items[parentId]) items[parentId].push(update);
			else items[parentId] = [update];
			return items;
		}, {});

		// Effects-on-items updates
		for (const [itemId, updates] of Object.entries(grandchildUpdateData)) {
			await this.actor.items.get(itemId).updateEmbeddedDocuments("ActiveEffect", updates);
		}

		// Update on the main actor
		return this.actor.updateEmbeddedDocuments("ActiveEffect", directUpdates);
	}

	/**
	 * Handle dropping of an Actor data onto another Actor sheet
	 * @param {DragEvent} event            The concluding DragEvent which contains drop data
	 * @param {object} data                The data transfer extracted from the event
	 * @returns {Promise<object|boolean>}  A data object which describes the result of the drop, or false if the drop was
	 *                                     not permitted.
	 * @protected
	 */
	async _onDropActor(event, data) {
		if (!this.actor.isOwner) return false;
	}

	/* -------------------------------------------- */

	/**
	 * Handle creating a new message with data of item for send to chat.
	 * @param {Event} event   The originating click event
	 * @private
	 */
	static async #onSendChat(event, target) {
		event.preventDefault();

		const itemId = target.closest(".item").dataset.itemId;
		const item = this.actor.items.get(itemId);

		if (item.system.description) ChatMessage.create({ content: item.system.chatDescription || item.system.description });
	}

	/**
	 * Handle marks an item whether it is used or not and changes the icon
	 * @param {Event} event   The originating click event
	 * @private
	 */
	static async #onMarkItem(event, target) {
		event.preventDefault();

		const itemId = target.closest(".item").dataset.itemId;
		const item = this.actor.items.get(itemId);

		if (!item.system.using || item.system.using.state === false) {
			return item.update({ "system.using": { state: true, class: "fas" } });
		} else {
			return item.update({ "system.using": { state: false, class: "far" } });
		}
	}

	/**
	 * Handle clickable rolls.
	 * @param {Event} event   The originating click event
	 * @private
	 */
	static async #onRoll(event, target) {
		event.preventDefault();
		const dataset = target.dataset;

		// Handle item rolls.
		if (dataset.rollType) {
			if (dataset.rollType == "item") {
				const itemId = target.closest(".item").dataset.itemId;
				const item = this.actor.items.get(itemId);
				if (!item) return;
				if (item.type === "ritual") return item.useRitual();
				return item.roll();
			}
		}
	}

	static async #onRitualCast(event, target) {
		event.preventDefault();
		const itemId = target.closest(".item")?.dataset.itemId;
		const item = itemId ? this.actor.items.get(itemId) : null;
		if (item?.type === "ritual") await item.useRitual();
	}

	static #buildAttackProfileDialogContent(actor, existing = null) {
		const armaments = actor.items.filter((i) => i.type === "armament");
		const weaponOpts = armaments
			.map(
				(item) =>
					`<option value="${item.id}" ${existing?.baseArmamentId === item.id ? "selected" : ""}>${item.name}</option>`
			)
			.join("");
		const damageTypes = CONFIG.op?.dropdownDamageType ?? {};
		const dmgTypeOpts = Object.entries(damageTypes)
			.map(
				([key, label]) =>
					`<option value="${key}" ${existing?.damageTypeOverride === key ? "selected" : ""}>${game.i18n.localize(
						label
					)}</option>`
			)
			.join("");

		return `
<div class="attack-profile-dialog" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:4px;">
  <label style="grid-column:1/-1;">${game.i18n.localize("op.name")}<input name="name" type="text" value="${
			existing?.name ?? ""
		}" style="width:100%;margin-top:2px;" /></label>
  <label style="grid-column:1/-1;">${game.i18n.localize(
			"op.baseWeapon"
		)}<select name="baseArmamentId" style="width:100%;margin-top:2px;"><option value="">—</option>${weaponOpts}</select></label>
  <label>${game.i18n.localize("op.attackBonus")}<input name="attackBonus" type="number" value="${
			existing?.attackBonus ?? 0
		}" style="width:100%;margin-top:2px;" /></label>
  <label>${game.i18n.localize("op.peCost")}<input name="peCost" type="number" min="0" value="${
			existing?.peCost ?? 0
		}" style="width:100%;margin-top:2px;" /></label>
  <label>${game.i18n.localize("op.damageBonusFormula")}<input name="damageBonus" type="text" value="${
			existing?.damageBonus ?? ""
		}" placeholder="1d6" style="width:100%;margin-top:2px;" /></label>
  <label>${game.i18n.localize("op.damageFormulaOverride")}<input name="damageFormulaOverride" type="text" value="${
			existing?.damageFormulaOverride ?? ""
		}" placeholder="2d8+2" style="width:100%;margin-top:2px;" /></label>
  <label>${game.i18n.localize(
			"op.damageTypeOverride"
		)}<select name="damageTypeOverride" style="width:100%;margin-top:2px;"><option value="">—</option>${dmgTypeOpts}</select></label>
  <label style="grid-column:1/-1;">${game.i18n.localize("op.notes")}<input name="notes" type="text" value="${
			existing?.notes ?? ""
		}" style="width:100%;margin-top:2px;" /></label>
</div>`;
	}

	static #attackProfileFormToData(data, existingId = null) {
		return {
			id: existingId ?? createAttackProfileId(),
			name: data.name || game.i18n.localize("op.attack"),
			baseArmamentId: data.baseArmamentId || "",
			attackBonus: Number(data.attackBonus) || 0,
			damageBonus: data.damageBonus || "",
			damageFormulaOverride: data.damageFormulaOverride || "",
			damageTypeOverride: data.damageTypeOverride || "",
			peCost: Number(data.peCost) || 0,
			notes: data.notes || "",
		};
	}

	static async #onCreateAttackProfile(event) {
		event.preventDefault();
		const result = await foundry.applications.api.DialogV2.prompt({
			window: { title: game.i18n.localize("op.addAttackProfile") },
			content: OrdemActorSheet.#buildAttackProfileDialogContent(this.actor),
			ok: {
				label: game.i18n.localize("op.addAttackProfile"),
				callback: (_event, button) => new FormDataExtended(button.form).object,
			},
		});
		if (!result?.name) return;
		const profiles = [...(this.actor.system.attackProfiles ?? [])];
		profiles.push(OrdemActorSheet.#attackProfileFormToData(result));
		await this.actor.update({ "system.attackProfiles": profiles });
	}

	static async #onEditAttackProfile(event, target) {
		event.preventDefault();
		const profileId = target.closest("[data-profile-id]")?.dataset.profileId;
		const profiles = [...(this.actor.system.attackProfiles ?? [])];
		const index = profiles.findIndex((entry) => entry.id === profileId);
		if (index < 0) return;

		const result = await foundry.applications.api.DialogV2.prompt({
			window: { title: game.i18n.localize("op.editAttackProfile") },
			content: OrdemActorSheet.#buildAttackProfileDialogContent(this.actor, profiles[index]),
			ok: {
				label: game.i18n.localize("op.saveChanges"),
				callback: (_event, button) => new FormDataExtended(button.form).object,
			},
		});
		if (!result) return;
		profiles[index] = OrdemActorSheet.#attackProfileFormToData(result, profiles[index].id);
		await this.actor.update({ "system.attackProfiles": profiles });
	}

	static async #onDeleteAttackProfile(event, target) {
		event.preventDefault();
		const profileId = target.closest("[data-profile-id]")?.dataset.profileId;
		const profiles = (this.actor.system.attackProfiles ?? []).filter((entry) => entry.id !== profileId);
		await this.actor.update({ "system.attackProfiles": profiles });
	}

	static async #onRollAttackProfile(event, target) {
		event.preventDefault();
		const profileId = target.closest("[data-profile-id]")?.dataset.profileId;
		const profile = (this.actor.system.attackProfiles ?? []).find((entry) => entry.id === profileId);
		if (!profile) return;
		const baseItem = this.actor.items.get(profile.baseArmamentId);
		if (!baseItem) {
			ui.notifications.warn(game.i18n.localize("op.attackProfileMissingWeapon"));
			return;
		}
		await baseItem.rollAttackProfile(profile);
	}

	static async #onToggleWeaponEnchantment(event, target) {
		event.preventDefault();
		const itemId = target.closest(".item")?.dataset.itemId;
		const enchantId = target.closest("[data-enchant-id]")?.dataset.enchantId;
		const item = itemId ? this.actor.items.get(itemId) : null;
		if (!item || !enchantId) return;
		await toggleEnchantmentOnWeapon(item, enchantId);
	}

	static async #onLevelUpProgress(event, target) {
		event.preventDefault();
		if (!this.isEditable) return;

		const field = target.dataset.progressField;
		const sys = this.actor.system;

		if (field === "stage" || (this.isSurvivor && !field)) {
			const current = Number(sys.stage?.value) || 0;
			if (!canLevelUpStage(current)) {
				ui.notifications.warn(game.i18n.localize("op.progressMaxReached"));
				return;
			}
			const next = getNextStageValue(current);
			await this.actor.update({ "system.stage.value": next });
			ui.notifications.info(game.i18n.format("op.levelUpStageMessage", { value: next }));
			return;
		}

		if (field === "nivel" || (this.progressRuleIsNivel && !field)) {
			const current = Number(sys.nivel?.value) || 0;
			if (!canLevelUpNivel(current)) {
				ui.notifications.warn(game.i18n.localize("op.progressMaxReached"));
				return;
			}
			const next = getNextNivelValue(current);
			await this.actor.update({ "system.nivel.value": next });
			ui.notifications.info(game.i18n.format("op.levelUpNivelMessage", { value: next }));
			return;
		}

		const current = Number(sys.NEX?.value) || 0;
		if (!canLevelUpNex(current)) {
			ui.notifications.warn(game.i18n.format("op.nexMaxReached", { max: NEX_MAX }));
			return;
		}
		const next = getNextNexValue(current);
		await this.actor.update({ "system.NEX.value": next });
		ui.notifications.info(game.i18n.format("op.levelUpNexMessage", { value: next }));
	}

	static async #onRemoveWeaponEnchantment(event, target) {
		event.preventDefault();
		event.stopPropagation();
		const itemId = target.closest(".item")?.dataset.itemId;
		const enchantId = target.closest("[data-enchant-id]")?.dataset.enchantId;
		const item = itemId ? this.actor.items.get(itemId) : null;
		if (!item || !enchantId) return;

		const enchantment = (item.system.enchantments ?? []).find((e) => e.id === enchantId);
		const confirmed = await Dialog.confirm({
			title: game.i18n.localize("op.removeWeaponEnchantmentTitle"),
			content: `<p>${game.i18n.format("op.removeWeaponEnchantmentConfirm", {
				weapon: item.name,
				enchant: enchantment?.ritualName ?? "",
				tier: enchantment?.tierLabel ?? "",
			})}</p>`,
		});
		if (!confirmed) return;

		await removeEnchantmentFromWeapon(item, enchantId);
		ui.notifications.info(
			game.i18n.format("op.removeWeaponEnchantmentDone", {
				enchant: enchantment?.ritualName ?? "",
				weapon: item.name,
			})
		);
	}

	static async #onToggleWeaponMod(event, target) {
		event.preventDefault();
		const itemId = target.closest(".item")?.dataset.itemId;
		const item = itemId ? this.actor.items.get(itemId) : null;
		if (!item || !itemModifiesWeapons(item)) return;
		const active = Boolean(item.system.using?.state);
		await item.update({
			"system.using": { state: !active, class: !active ? "fas" : "far" },
		});
	}

	/**
	 * Handle rolling an Ability test or saving throw.
	 * @param {Event} event      The originating click event.
	 * @private
	 */
	static #onRollAttributeTest(event, target) {
		event.preventDefault();
		const attribute = target.closest("[data-key]").dataset.key;
		this.actor.rollAttribute({ attribute, event });
	}

	/**
	 * Handle rolling a Skill check.
	 * @param {Event} event      The originating click event.
	 * @returns {Promise<Roll>}  The resulting roll.
	 * @private
	 */
	static #onRollSkillCheck(event, target) {
		event.preventDefault();
		const skill = target.closest("[data-key]").dataset.key;
		return this.actor.rollSkill({ skill, event });
	}

	static async #onDiceModChange(event, target) {
		event.preventDefault();
		const skillKey = target.dataset.skill;
		const isIncrement = target.dataset.action === "diceModIncrement";
		const current = Number(this.actor.system.skills?.[skillKey]?.diceMod) || 0;
		const newVal = isIncrement ? current + 1 : current - 1;
		await this.actor.update({ [`system.skills.${skillKey}.diceMod`]: newVal });
	}

	/* -------------------------------------------- */

	/** Helper Functions */

	/**
	 * Fetches the embedded document representing the containing HTML element
	 *
	 * @param {HTMLElement} target    The element subject to search
	 * @returns {Item | ActiveEffect} The embedded Item or ActiveEffect
	 */
	_getEmbeddedDocument(target) {
		const docRow = target.closest("[data-document-class]");
		if (!docRow) return console.warn("Element with data-document-class not found in the DOM hierarchy.");
		if (docRow.dataset.documentClass === "Item") {
			return this.actor.items.get(docRow.dataset.itemId);
		} else if (docRow.dataset.documentClass === "ActiveEffect") {
			const parent =
				docRow.dataset.parentId === this.actor.id ? this.actor : this.actor.items.get(docRow?.dataset.parentId);
			return parent.effects.get(docRow?.dataset.effectId);
		} else return console.warn("Could not find document class");
	}

	/**
	 * Callback actions which occur when a dragged element is dropped on a target.
	 * @param {DragEvent} event       The originating DragEvent
	 * @protected
	 */
	async _onDrop(event) {
		// V13: Use namespaced TextEditor
		const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
		const actor = this.actor;
		// CANCELABLE HOOK — `dropActorSheetData` listeners MUST be synchronous;
		// async listeners return a Promise (truthy) and cannot block the drop.
		const allowed = Hooks.call("dropActorSheetData", actor, this, data);
		if (allowed === false) return;

		// Handle different data types
		switch (data.type) {
			case "ActiveEffect":
				return this._onDropActiveEffect(event, data);
			case "Actor":
				return this._onDropActor(event, data);
			case "Item":
				return this._onDropItem(event, data);
			case "Folder":
				return this._onDropFolder(event, data);
		}
	}

	// -------------------------------------

	/* -------------------------------------------- */

	/**
	 * Handle dropping of an item reference or item data onto an Actor Sheet
	 * @param {DragEvent} event            The concluding DragEvent which contains drop data
	 * @param {object} data                The data transfer extracted from the event
	 * @returns {Promise<Item[]|boolean>}  The created or updated Item instances, or false if the drop was not permitted.
	 * @protected
	 */
	async _onDropItem(event, data) {
		if (!this.actor.isOwner) return false;

		const actor = this.actor;
		const item = await Item.implementation.fromDropData(data);
		const details = ["class", "origin", "path"];

		if (details.includes(item.type)) {
			const dataModel = CONFIG.Item.dataModels[item.type];
			const singleton = dataModel?.metadata?.singleton ?? false;
			const existingItems = actor.itemTypes[item.type];

			if (singleton && actor.itemTypes[item.type].length) {
				const existingItem = existingItems[0]; // Pega o item atual da ficha

				// Pausa o código e abre a janela de confirmação do Foundry
				const typeLabel = game.i18n.localize(`TYPES.Item.${item.type}`);
				const confirmar = await Dialog.confirm({
					title: game.i18n.format("op.dialogReplaceItemTitle", { type: typeLabel.toUpperCase() }),
					content: game.i18n.format("op.dialogReplaceItemContent", {
						existing: existingItem.name,
						replacement: item.name,
					}),
					yes: () => true,
					no: () => false,
					defaultYes: false,
				});

				if (confirmar) {
					await actor.deleteEmbeddedDocuments("Item", [existingItem.id]);
					ui.notifications.info(`${existingItem.name} foi removido.`);
				} else {
					return false;
				}
			}
		}

		// Handle item sorting within the same Actor
		if (this.actor.uuid === item.parent?.uuid) {
			return this._onSortItem(event, item);
		}

		// Create the owned item
		try {
			return await this._onDropItemCreate(item.toObject(), event);
		} catch (error) {
			console.error("Erro ao criar item no ator:", error);
			ui.notifications.error(`Erro ao adicionar item: ${error.message}`);
			throw error;
		}
	}

	/**
	 * Handle dropping of a Folder on an Actor Sheet.
	 * The core sheet currently supports dropping a Folder of Items to create all items as owned items.
	 * @param {DragEvent} event     The concluding DragEvent which contains drop data
	 * @param {object} data         The data transfer extracted from the event
	 * @returns {Promise<Item[]>}
	 * @protected
	 */
	async _onDropFolder(event, data) {
		if (!this.actor.isOwner) return [];
		const folder = await Folder.implementation.fromDropData(data);
		if (folder.type !== "Item") return [];
		const droppedItemData = await Promise.all(
			folder.contents.map(async (item) => {
				if (!(document instanceof Item)) item = await fromUuid(item.uuid);
				return item;
			})
		);
		return this._onDropItemCreate(droppedItemData, event);
	}

	/**
	 * Handle the final creation of dropped Item data on the Actor.
	 * This method is factored out to allow downstream classes the opportunity to override item creation behavior.
	 * @param {object[]|object} itemData      The item data requested for creation
	 * @param {DragEvent} event               The concluding DragEvent which provided the drop data
	 * @returns {Promise<Item[]>}
	 * @private
	 */
	async _onDropItemCreate(itemData, event) {
		itemData = itemData instanceof Array ? itemData : [itemData];

		// Converter objetos Item para dados antes de criar
		const itemDataArray = itemData.map((item) => {
			if (item instanceof Item) return item.toObject();
			return item;
		});

		return this.actor.createEmbeddedDocuments("Item", itemDataArray);
	}

	/**
	 * Open compendium when clicking on an empty item slot.
	 * @param {PointerEvent} event
	 * @param {HTMLElement} target
	 */
	static #findItem(event, target) {
		event.preventDefault();

		const reference = target.dataset.reference;

		const compendiumMap = CONFIG.op.CompendiumEntries;

		const packKey = compendiumMap[reference];

		if (packKey) {
			const pack = game.packs.get(packKey);
			if (pack) {
				// Abre a janela do compêndio na tela do jogador
				pack.render(true);
			} else {
				ui.notifications.warn(`O compêndio de ${reference} (${packKey}) não foi encontrado no sistema.`);
			}
		}
	}

	/** ******************
	 *
	 * Actor Override Handling
	 *
	 ********************/

	/**
	 * Submit a document update based on the processed form data.
	 * @param {SubmitEvent} event                   The originating form submission event
	 * @param {HTMLFormElement} form                The form element that was submitted
	 * @param {object} submitData                   Processed and validated form data to be used for a document update
	 * @returns {Promise<void>}
	 * @protected
	 * @override
	 */
	async _processSubmitData(event, form, submitData) {
		const overrides = foundry.utils.flattenObject(this.actor.overrides);
		for (const k of Object.keys(overrides)) delete submitData[k];
		await this.document.update(submitData);
	}

	/* -------------------------------------------- */
	/*  Form Submission                             */
	/* -------------------------------------------- */

	/** @inheritdoc */
	async _onSubmit(...args) {
		await super._onSubmit(...args);
	}

	/* -------------------------------------------- */
}
