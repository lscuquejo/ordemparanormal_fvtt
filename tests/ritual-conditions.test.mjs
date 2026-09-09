import { describe, it, expect, beforeEach } from "vitest";
import {
	extractConditionIds,
	getRitualConditionSpec,
	isNarrativeResistanceRitual,
	parseConditionDuration,
	resolveRitualConditions,
	splitResistanceClauses,
} from "../module/helpers/ritual-conditions.mjs";

describe("ritual condition parsing", () => {
	beforeEach(() => {
		global.game = { i18n: { localize: (key) => key } };
	});

	it("reads Definhar base: fail fatigued, pass vulnerable", () => {
		const item = {
			system: {
				duration: "scene",
				description: `<p>O alvo fica fatigado. Se passar no teste de resistência, em vez disso fica vulnerável.</p>
<p><strong>Aprimoramentos</strong></p><ul>
<li><strong>Discente (+2 PE):</strong> em vez do normal, o alvo fica exausto. Se passar na resistência, fica fatigado.</li>
</ul>`,
			},
			getFlag: () => "definhar",
		};

		const spec = getRitualConditionSpec(item, { key: "base", label: "Base" });
		expect(spec.fail).toEqual(["fatigado"]);
		expect(spec.pass).toEqual(["vulneravel"]);
		expect(resolveRitualConditions(spec, false)).toEqual(["fatigado"]);
		expect(resolveRitualConditions(spec, true)).toEqual(["vulneravel"]);
	});

	it("reads Definhar discente from the enhancement snippet", () => {
		const item = {
			system: {
				duration: "scene",
				description: `<p>O alvo fica fatigado. Se passar no teste de resistência, em vez disso fica vulnerável.</p>
<p><strong>Aprimoramentos</strong></p><ul>
<li><strong>Discente (+2 PE):</strong> em vez do normal, o alvo fica exausto. Se passar na resistência, fica fatigado.</li>
</ul>`,
			},
			getFlag: () => "definhar",
		};

		const spec = getRitualConditionSpec(item, { key: "discente", label: "Discente" });
		expect(spec.fail).toEqual(["exausto"]);
		expect(spec.pass).toEqual(["fatigado"]);
	});

	it("skips the condition when resistance avoids it (Eletrocussão)", () => {
		const spec = getRitualConditionSpec(
			{
				system: {
					duration: "instantaneous",
					description:
						"<p>sofre 3d6 pontos de dano de eletricidade e fica vulnerável por uma rodada. Se passar no teste de resistência, sofre apenas metade do dano e evita a condição.</p>",
				},
				getFlag: () => "eletrocussao",
			},
			{ key: "base", label: "Base" }
		);
		expect(spec.fail).toEqual(["vulneravel"]);
		expect(spec.pass).toEqual([]);
		expect(spec.duration.rounds).toBe(1);
	});

	it("parses Zerar Entropia paralisado / lento", () => {
		const spec = getRitualConditionSpec(
			{
				system: {
					duration: "scene",
					description: "<p>deixando-o paralisado. Se passar na resistência, em vez disso fica lento.</p>",
				},
				getFlag: () => "zerar-entropia",
			},
			{ key: "base", label: "Base" }
		);
		expect(spec.fail).toEqual(["paralisado"]);
		expect(spec.pass).toEqual(["lento"]);
	});

	it("maps hemorragia to sangrando", () => {
		expect(extractConditionIds("o alvo fica com uma hemorragia severa")).toEqual(["sangrando"]);
	});

	it("splits pass/fail clauses", () => {
		const { fail, pass } = splitResistanceClauses(
			"O alvo fica fatigado. Se passar no teste de resistência, em vez disso fica vulnerável."
		);
		expect(extractConditionIds(fail)).toEqual(["fatigado"]);
		expect(extractConditionIds(pass)).toEqual(["vulneravel"]);
	});

	it("uses one-round duration when the text says so", () => {
		expect(parseConditionDuration("fica ofuscado por uma rodada", "scene").rounds).toBe(1);
	});

	it("Perturbação: base/verdadeiro are narrative-only; discente applies Abalado", () => {
		const item = {
			system: {
				duration: "setDuration",
				description: `<p>Você dá uma ordem. Escolha um dos efeitos.</p>
<p><strong>Modos</strong></p><ul>
<li>Pare: O alvo fica pasmo (não pode realizar ações, só reações).</li>
</ul>
<p><strong>Aprimoramentos</strong></p><ul>
<li><strong>Discente (+2 PE):</strong> adiciona o comando Sofra. Ele sofre 3d8 e fica abalado por uma rodada.</li>
<li><strong>Verdadeiro (+5 PE):</strong> muda o alvo para &quot;até 5 seres&quot;.</li>
</ul>`,
			},
			getFlag: () => "perturbacao",
		};

		expect(getRitualConditionSpec(item, { key: "base", label: "Base" })).toEqual({
			fail: [],
			pass: [],
			duration: { rounds: null, seconds: null },
		});
		expect(getRitualConditionSpec(item, { key: "verdadeiro", label: "Verdadeiro" })).toEqual({
			fail: [],
			pass: [],
			duration: { rounds: null, seconds: null },
		});
		expect(getRitualConditionSpec(item, { key: "discente", label: "Discente" })).toEqual({
			fail: ["abalado"],
			pass: [],
			duration: { rounds: 1, seconds: null },
		});
		expect(isNarrativeResistanceRitual("perturbacao", "base")).toBe(true);
		expect(isNarrativeResistanceRitual("perturbacao", "verdadeiro")).toBe(true);
		expect(isNarrativeResistanceRitual("perturbacao", "discente")).toBe(false);
	});
});
