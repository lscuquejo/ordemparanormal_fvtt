import { describe, it, expect } from "vitest";
import {
	buildTemplateDataFromSpec,
	getCinerariaTierEffects,
	getNuvemDeCinzasTierEffects,
	getRitualSheetTargetLabel,
	normalizeHexColor,
	parseRitualAreaRadiusMeters,
	parseRitualAreaSpec,
	ritualMetersToTemplateDistance,
	ritualTierPlacesPersistentZone,
	ritualTierUsesArea,
} from "../module/helpers/ritual-zones.mjs";

const consumirManancial = {
	system: {
		target: "people",
		range: "personal",
		description: `<p><strong>Custo:</strong> 1 PE</p>
<p>Você suga uma pequena porção...</p>
<p><strong>Aprimoramentos</strong></p><ul>
<li><strong>Verdadeiro (+5 PE):</strong> muda o alvo para "área: esfera com 6m de raio centrada em você" e causa 3d6 de dano.</li>
</ul>`,
		area: { size: "", name: "" },
	},
};

const deflagracao = {
	system: {
		target: "",
		range: "personal",
		duration: "instantaneous",
		description: `<p><strong>Área:</strong> explosão de 15m de raio</p>
<p>Você acumula energia...</p>`,
		area: { size: "", name: "" },
	},
};

const nuvemDeCinzas = {
	system: {
		target: "area",
		range: "short",
		duration: "scene",
		description: `<p><strong>Efeito:</strong> nuvem com 6m de raio e 6m de altura</p>
<p>Uma nuvem de fuligem...</p>`,
		area: { name: "nuvem com 6m de raio e 6m de altura", size: "6", type: "circle" },
	},
};

const cineraria = {
	system: {
		target: "area",
		range: "short",
		duration: "scene",
		description: `<p><strong>Área:</strong> nuvem de 6m de raio</p>
<p>Você manifesta uma névoa...</p>`,
		area: { name: "nuvem de 6m de raio", size: "6", type: "circle" },
	},
};

const tecerIlusao = {
	system: {
		target: "area",
		range: "medium",
		duration: "scene",
		description: `<p><strong>Efeito:</strong> ilusão que se estende a até 4 cubos de 1,5m</p>`,
		area: {
			name: "ilusão que se estende a até 4 cubos de 1,5m",
			size: "1.5",
			type: "cube",
		},
	},
};

describe("parseRitualAreaRadiusMeters", () => {
	it("reads radius from description text", () => {
		const ritual = {
			system: {
				description: "nuvem de 6m de raio",
				area: { size: "", name: "" },
			},
		};
		expect(parseRitualAreaRadiusMeters(ritual)).toBe(6);
	});

	it("defaults to 6m for cloud rituals without explicit size", () => {
		const ritual = {
			system: {
				description: "névoa carregada",
				area: { size: "", name: "nuvem" },
			},
		};
		expect(parseRitualAreaRadiusMeters(ritual)).toBe(6);
	});
});

describe("parseRitualAreaSpec", () => {
	it("detects centered personal explosions", () => {
		const spec = parseRitualAreaSpec(deflagracao, { key: "base", label: "Base" });
		expect(spec.distanceMeters).toBe(15);
		expect(spec.centeredOnCaster).toBe(true);
	});

	it("reads tier-specific area from enhancements", () => {
		const spec = parseRitualAreaSpec(consumirManancial, { key: "verdadeiro", label: "Verdadeiro" });
		expect(spec.distanceMeters).toBe(6);
		expect(spec.centeredOnCaster).toBe(true);
	});

	it("reads Nuvem de Cinzas radius from effect/area", () => {
		const spec = parseRitualAreaSpec(nuvemDeCinzas, { key: "base", label: "Base" });
		expect(spec.distanceMeters).toBe(6);
		expect(spec.centeredOnCaster).toBe(false);
	});

	it("reads Cinerária as a 6m circle cloud", () => {
		const spec = parseRitualAreaSpec(cineraria, { key: "base", label: "Base" });
		expect(spec.type).toBe("circle");
		expect(spec.distanceMeters).toBe(6);
		expect(ritualTierPlacesPersistentZone(cineraria, { key: "base", formula: "" })).toBe(true);
	});

	it("approximates Tecer Ilusão cubes as a rect bounding box", () => {
		const spec = parseRitualAreaSpec(tecerIlusao, { key: "base", label: "Base" });
		expect(spec.type).toBe("rect");
		expect(spec.distanceMeters).toBe(3);
	});
});

describe("ritualMetersToTemplateDistance", () => {
	it("keeps meters as MeasuredTemplate.distance (does not divide by grid scale)", () => {
		expect(ritualMetersToTemplateDistance(6)).toBe(6);
		expect(ritualMetersToTemplateDistance(15)).toBe(15);
		const data = buildTemplateDataFromSpec(
			{ type: "circle", distanceMeters: 6, borderColor: "#000000", fillColor: "#ef444440" },
			{ x: 100, y: 200, userId: "User1" }
		);
		expect(data.t).toBe("circle");
		expect(data.distance).toBe(6);
		expect(data.x).toBe(100);
		expect(data.y).toBe(200);
		expect(data.fillColor).toBe("#ef4444");
	});
});

describe("normalizeHexColor", () => {
	it("strips alpha channel so Foundry ColorField accepts the value", () => {
		expect(normalizeHexColor("#7c3aed40")).toBe("#7c3aed");
		expect(normalizeHexColor("#ef4444")).toBe("#ef4444");
	});
});

describe("ritualTierUsesArea", () => {
	it("uses area only on tiers that change to area", () => {
		expect(ritualTierUsesArea(consumirManancial, { key: "base", label: "Base" })).toBe(false);
		expect(ritualTierUsesArea(consumirManancial, { key: "verdadeiro", label: "Verdadeiro" })).toBe(true);
	});

	it("uses area for rituals with an area header", () => {
		expect(ritualTierUsesArea(deflagracao, { key: "base", label: "Base" })).toBe(true);
	});

	it("uses area when target is area", () => {
		const ritual = { system: { target: "area", description: "", area: { size: "6", name: "sphere" } } };
		expect(ritualTierUsesArea(ritual, { key: "base", label: "Base" })).toBe(true);
	});

	it("detects illusion effect areas", () => {
		expect(ritualTierUsesArea(tecerIlusao, { key: "base", label: "Base" })).toBe(true);
	});
});

describe("ritualTierPlacesPersistentZone", () => {
	it("places persistent zones for scene AoE without treating them as damage bursts", () => {
		expect(ritualTierPlacesPersistentZone(nuvemDeCinzas, { key: "base", formula: "" })).toBe(true);
		expect(ritualTierPlacesPersistentZone(tecerIlusao, { key: "base", formula: "" })).toBe(true);
		expect(ritualTierPlacesPersistentZone(tecerIlusao, { key: "verdadeiro", formula: "6d6" })).toBe(true);
	});

	it("does not place persistent zones for instantaneous explosions", () => {
		expect(ritualTierPlacesPersistentZone(deflagracao, { key: "base", formula: "3d10" })).toBe(false);
	});
});

describe("getNuvemDeCinzasTierEffects", () => {
	it("applies camouflage meta on all tiers", () => {
		expect(getNuvemDeCinzasTierEffects({ key: "base" }).camouflage).toEqual({
			lightMeters: 1.5,
			totalMeters: 3,
		});
	});

	it("applies attack and movement penalties on verdadeiro", () => {
		const fx = getNuvemDeCinzasTierEffects({ key: "verdadeiro" });
		expect(fx.attackPenalty).toBe(2);
		expect(fx.deslocFixed).toBe(3);
	});
});

describe("getRitualSheetTargetLabel", () => {
	it("shows area/effect text when creature target is empty", () => {
		expect(getRitualSheetTargetLabel(tecerIlusao)).toBe("ilusão que se estende a até 4 cubos de 1,5m");
		expect(getRitualSheetTargetLabel(nuvemDeCinzas)).toBe("nuvem com 6m de raio e 6m de altura");
	});

	it("shows creature targets when present", () => {
		const ritual = { system: { target: "people", targetQtd: "1", area: { name: "" } } };
		expect(getRitualSheetTargetLabel(ritual)).toContain("people");
	});
});

describe("getCinerariaTierEffects", () => {
	it("always grants +5 DT", () => {
		expect(getCinerariaTierEffects({ key: "base" }).dtBonus).toBe(5);
		expect(getCinerariaTierEffects({ key: "discente" }).dtBonus).toBe(5);
	});

	it("grants PE discount on discente", () => {
		expect(getCinerariaTierEffects({ key: "discente" }).peDiscount).toBe(2);
		expect(getCinerariaTierEffects({ key: "base" }).peDiscount).toBe(0);
	});

	it("maximizes damage on verdadeiro", () => {
		expect(getCinerariaTierEffects({ key: "verdadeiro" }).maximizeDamage).toBe(true);
	});
});

describe("buildTemplateDataFromSpec", () => {
	it("keeps radius in scene meters (does not divide by grid size)", () => {
		expect(ritualMetersToTemplateDistance(6)).toBe(6);
		const data = buildTemplateDataFromSpec(
			{ type: "circle", distanceMeters: 6, borderColor: "#000", fillColor: "#fff" },
			{ x: 10, y: 20, userId: "tester" }
		);
		expect(data.t).toBe("circle");
		expect(data.distance).toBe(6);
		expect(data.x).toBe(10);
		expect(data.y).toBe(20);
	});

	it("builds Cinerária cloud data at 6m", () => {
		const cineraria = {
			system: {
				target: "area",
				duration: "scene",
				description: "<p><strong>Área:</strong> nuvem de 6m de raio</p>",
				area: { name: "nuvem de 6m de raio", size: "6", type: "circle" },
			},
		};
		expect(ritualTierPlacesPersistentZone(cineraria, { key: "base" })).toBe(true);
		const spec = parseRitualAreaSpec(cineraria, { key: "base", label: "Base" });
		expect(spec.distanceMeters).toBe(6);
		expect(buildTemplateDataFromSpec(spec, { x: 0, y: 0, userId: "u" }).distance).toBe(6);
	});
});
