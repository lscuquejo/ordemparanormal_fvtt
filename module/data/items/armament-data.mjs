export class ArmamentData extends foundry.abstract.TypeDataModel {
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
			quantity: new fields.NumberField({ required: true, integer: true, initial: 1 }),
			proficiency: new fields.StringField({ required: true, initial: "" }),
			types: new fields.SchemaField({
				rangeType: new fields.SchemaField({
					name: new fields.StringField({ initial: "" }),
					subRangeType: new fields.StringField({ initial: "" }),
				}),
				ammunitionType: new fields.StringField({ initial: "" }),
				gripType: new fields.StringField({ initial: "" }),
			}),
			critical: new fields.StringField({ initial: "" }),
			range: new fields.StringField({ initial: "" }),
			formulas: new fields.SchemaField({
				attack: new fields.SchemaField({
					formula: new fields.StringField({ initial: "1d4" }),
					attr: new fields.StringField({ initial: "" }),
					skill: new fields.StringField({ initial: "" }),
					bonus: new fields.StringField({ initial: "" }),
				}),
				damage: new fields.SchemaField({
					formula: new fields.StringField({ initial: "1d4" }),
					attr: new fields.StringField({ initial: "" }),
					bonus: new fields.StringField({ initial: "" }),
					type: new fields.StringField({ initial: "" }),
					parts: new fields.ArrayField(new fields.ArrayField(new fields.StringField())),
				}),
				extraFormula: new fields.StringField({ initial: "1d4" }),
			}),
			penalty: new fields.StringField({ initial: "" }),
			actionType: new fields.StringField({ initial: "standard" }),
			numberOfAttacks: new fields.NumberField({ required: false, integer: true, initial: 1, min: 1, max: 8 }),
			rangeCategory: new fields.StringField({ initial: "" }),
			conditions: new fields.SchemaField({
				improvised: new fields.BooleanField({ initial: false }),
				throwable: new fields.BooleanField({ initial: false }),
				agile: new fields.BooleanField({ initial: false }),
				automatic: new fields.BooleanField({ initial: false }),
				adaptableGrip: new fields.BooleanField({ initial: false }),
				pistolBlow: new fields.BooleanField({ initial: false }),
			}),
			enchantments: new fields.ArrayField(
				new fields.SchemaField({
					id: new fields.StringField({ required: true }),
					ritualId: new fields.StringField({ initial: "" }),
					ritualName: new fields.StringField({ initial: "" }),
					tierKey: new fields.StringField({ initial: "base" }),
					tierLabel: new fields.StringField({ initial: "Base" }),
					active: new fields.BooleanField({ initial: true }),
					attackBonus: new fields.NumberField({ integer: true, initial: 0 }),
					critMarginBonus: new fields.NumberField({ integer: true, initial: 0 }),
					critMultiplierBonus: new fields.NumberField({ integer: true, initial: 0 }),
					damageBonuses: new fields.ArrayField(new fields.StringField()),
					damageType: new fields.StringField({ initial: "" }),
					techModifications: new fields.ArrayField(new fields.StringField()),
					element: new fields.StringField({ initial: "" }),
					duration: new fields.StringField({ initial: "" }),
					icon: new fields.StringField({ initial: "" }),
				}),
				{ initial: [] }
			),
		};
	}

	static migrateData(data) {
		return super.migrateData(data);
	}
}
