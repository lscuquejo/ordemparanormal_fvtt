import { describe, it, expect } from "vitest";
import { getTierTargetingData, ritualHealAgeYears, slugifyRitualName } from "../module/helpers/ritual-helpers.mjs";

describe("Cicatrização aging", () => {
	it("slugifies accented ritual names", () => {
		expect(slugifyRitualName("Cicatrização")).toBe("cicatrizacao");
	});

	it("ages the target by 1 year for Cicatrização", () => {
		expect(ritualHealAgeYears({ ritualId: "cicatrizacao" })).toBe(1);
		expect(ritualHealAgeYears({ ritualName: "Cicatrização" })).toBe(1);
	});

	it("does not age for other healing rituals", () => {
		expect(ritualHealAgeYears({ ritualId: "curar", ritualName: "Curar" })).toBe(0);
		expect(ritualHealAgeYears({})).toBe(0);
	});
});

describe("tier targeting overrides", () => {
	const distorcer = {
		system: {
			range: "personal",
			target: "people",
			targetQtd: "1",
			description:
				"<p><strong>Aprimoramentos</strong></p><ul><li><strong>Discente (+2 PE):</strong> muda o alcance para &quot;curto&quot; e o alvo para &quot;1 ser&quot;.</li><li><strong>Verdadeiro (+5 PE):</strong> como em Discente, mas muda o alvo para &quot;seres escolhidos&quot;.</li></ul>",
		},
	};

	it("keeps self targeting on base tier", () => {
		const info = getTierTargetingData(distorcer, { key: "base", label: "Base" });
		expect(info.range).toBe("personal");
		expect(info.selfOnly).toBe(true);
		expect(info.requiresTargetSelection).toBe(false);
	});

	it("uses selected target on discente tier", () => {
		const info = getTierTargetingData(distorcer, { key: "discente", label: "Discente" });
		expect(info.range).toBe("short");
		expect(info.targetText).toBe("1 ser");
		expect(info.selfOnly).toBe(false);
		expect(info.requiresTargetSelection).toBe(true);
	});

	it("uses selected beings on verdadeiro tier", () => {
		const info = getTierTargetingData(distorcer, { key: "verdadeiro", label: "Verdadeiro" });
		expect(info.range).toBe("short");
		expect(info.targetText).toBe("seres escolhidos");
		expect(info.selfOnly).toBe(false);
		expect(info.requiresTargetSelection).toBe(true);
	});

	it("Perturbação verdadeiro allows multiple targeted beings", () => {
		const perturbacao = {
			system: {
				range: "short",
				target: "people",
				targetQtd: "1",
				description:
					"<p><strong>Aprimoramentos</strong></p><ul><li><strong>Verdadeiro (+5 PE):</strong> muda o alvo para &quot;até 5 seres&quot; ou adiciona o comando Ataque.</li></ul>",
			},
		};
		const info = getTierTargetingData(perturbacao, { key: "verdadeiro", label: "Verdadeiro" });
		expect(info.targetText).toBe("até 5 seres");
		expect(info.requiresTargetSelection).toBe(true);
		expect(info.selfOnly).toBe(false);
	});
});
