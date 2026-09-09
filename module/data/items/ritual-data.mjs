export class RitualData extends foundry.abstract.TypeDataModel {
	static defineSchema() {
		const fields = foundry.data.fields;
		return {
			description: new fields.HTMLField({ initial: game.i18n.localize("op.itemDescriptionPlaceholder") }),
			chatDescription: new fields.HTMLField({ initial: "" }),
			circle: new fields.NumberField({ required: true, integer: true, initial: 1 }),
			element: new fields.StringField({ initial: "" }),
			target: new fields.StringField({ initial: "" }),
			execution: new fields.StringField({ initial: "" }),
			range: new fields.StringField({ initial: "" }),
			area: new fields.SchemaField({
				name: new fields.StringField({ initial: "" }),
				size: new fields.StringField({ initial: "" }),
				type: new fields.StringField({ initial: "" }),
			}),
			duration: new fields.StringField({ initial: "" }),
			resistance: new fields.StringField({ initial: "" }),
			skillResis: new fields.StringField({ initial: "" }),
			targetQtd: new fields.StringField({ initial: "" }),
			studentForm: new fields.BooleanField({ initial: false }),
			trueForm: new fields.BooleanField({ initial: false }),
			basePeCost: new fields.NumberField({ integer: true, initial: 0 }),
			tiers: new fields.ArrayField(
				new fields.SchemaField({
					key: new fields.StringField({ initial: "base" }),
					label: new fields.StringField({ initial: "" }),
					peCost: new fields.NumberField({ integer: true, initial: 0 }),
					formula: new fields.StringField({ initial: "" }),
					kind: new fields.StringField({ initial: "efeito" }),
					damageType: new fields.StringField({ initial: "" }),
					mode: new fields.StringField({ initial: "" }),
				}),
				{ initial: [] }
			),
			rolls: new fields.ArrayField(
				new fields.SchemaField({
					key: new fields.StringField({ initial: "base" }),
					label: new fields.StringField({ initial: "" }),
					formula: new fields.StringField({ initial: "" }),
					kind: new fields.StringField({ initial: "" }),
				}),
				{ initial: [] }
			),
		};
	}

	static migrateData(data) {
		return super.migrateData(data);
	}
}
