import { describe, it, expect } from "vitest";
import {
	calculateProgress,
	canLevelUpNex,
	getNextNexValue,
	NEX_MAX,
} from "../../../module/helpers/actor-calculations.mjs";

describe("calculateProgress", () => {
	describe("survivor", () => {
		it("always returns stageValue regardless of rule", () => {
			expect(calculateProgress(true, 1, 50, 10, 7)).toBe(7);
			expect(calculateProgress(true, 2, 50, 10, 7)).toBe(7);
		});
	});

	describe("rule 1 (NEX)", () => {
		it("NEX=50 → 10", () => {
			expect(calculateProgress(false, 1, 50, 0, 0)).toBe(10);
		});

		it("NEX=0 → 0", () => {
			expect(calculateProgress(false, 1, 0, 0, 0)).toBe(0);
		});

		it("NEX=98 → 19", () => {
			expect(calculateProgress(false, 1, 98, 0, 0)).toBe(19);
		});

		it("NEX=99 → 20 (max clamped)", () => {
			expect(calculateProgress(false, 1, 99, 0, 0)).toBe(20);
		});
	});

	describe("rule 2 (nivel)", () => {
		it("returns nivelValue", () => {
			expect(calculateProgress(false, 2, 50, 8, 0)).toBe(8);
		});
	});

	describe("unknown rule", () => {
		it("returns 0", () => {
			expect(calculateProgress(false, 99, 50, 10, 5)).toBe(0);
		});
	});

	describe("getNextNexValue", () => {
		it("steps by 5% from 0 to 99", () => {
			expect(getNextNexValue(0)).toBe(5);
			expect(getNextNexValue(5)).toBe(10);
			expect(getNextNexValue(10)).toBe(15);
			expect(getNextNexValue(1)).toBe(5);
			expect(getNextNexValue(95)).toBe(99);
			expect(getNextNexValue(99)).toBe(99);
		});

		it("canLevelUpNex is false at cap", () => {
			expect(canLevelUpNex(98)).toBe(true);
			expect(canLevelUpNex(99)).toBe(false);
			expect(NEX_MAX).toBe(99);
		});
	});
});
