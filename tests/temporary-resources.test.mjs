import { describe, it, expect } from "vitest";
import {
	resolveTemporaryResourceAmount,
	shouldReplaceTemporaryResource,
} from "../module/helpers/temporary-resources.mjs";

describe("temporary resource stacking", () => {
	it("keeps the highest temp value", () => {
		expect(resolveTemporaryResourceAmount(10, 15)).toBe(15);
		expect(resolveTemporaryResourceAmount(20, 12)).toBe(20);
		expect(resolveTemporaryResourceAmount(0, 8)).toBe(8);
	});

	it("does not replace when incoming is lower or equal", () => {
		expect(shouldReplaceTemporaryResource(15, 10)).toBe(false);
		expect(shouldReplaceTemporaryResource(15, 15)).toBe(false);
		expect(shouldReplaceTemporaryResource(0, 5)).toBe(true);
		expect(shouldReplaceTemporaryResource(5, 8)).toBe(true);
	});
});
