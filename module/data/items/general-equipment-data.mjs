export class GeneralEquipmentData extends foundry.abstract.TypeDataModel {
	static defineSchema() {
		const fields = foundry.data.fields;
		return {
			description: new fields.HTMLField({ initial: game.i18n.localize("op.itemDescriptionPlaceholder") }),
			chatDescription: new fields.HTMLField({ initial: "" }),
			weight: new fields.NumberField({ required: true, integer: false, initial: 1 }),
			category: new fields.NumberField({ required: true, integer: true, initial: 0 }),
			using: new fields.SchemaField({
				state: new fields.BooleanField({ initial: true }),
				class: new fields.StringField({ initial: "fas" }),
			}),
			type: new fields.StringField({ initial: "" }),
			quantity: new fields.NumberField({ required: true, integer: true, initial: 1 }),
			modifiesWeapons: new fields.BooleanField({ initial: false }),
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
