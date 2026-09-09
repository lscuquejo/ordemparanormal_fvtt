export class AbilityData extends foundry.abstract.TypeDataModel {
	static defineSchema() {
		const fields = foundry.data.fields;
		return {
			id: new fields.NumberField({ required: true, integer: true, initial: 0 }),
			description: new fields.HTMLField({ initial: game.i18n.localize("op.itemDescriptionPlaceholder") }),
			chatDescription: new fields.HTMLField({ initial: "" }),
			abilityType: new fields.StringField({ initial: "" }),
			cost: new fields.NumberField({ integer: true, initial: 0 }),
			preRequisite: new fields.StringField({ initial: "" }),
			activation: new fields.StringField({ initial: "" }),
			costType: new fields.StringField({ initial: "PE" }),
			modifiesWeapons: new fields.BooleanField({ initial: false }),
			using: new fields.SchemaField({
				state: new fields.BooleanField({ initial: false }),
				class: new fields.StringField({ initial: "far" }),
			}),
			weaponMod: new fields.SchemaField({
				attackBonus: new fields.NumberField({ integer: true, initial: 0 }),
				damageBonus: new fields.StringField({ initial: "" }),
			}),
		};
	}

	static migrateData(data) {
		return super.migrateData(data);
	}
}
