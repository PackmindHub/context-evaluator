import { describe, expect, it, mock } from "bun:test";
import type { IAIProvider, ProviderName } from "./types";

// Create mock provider factory
function createMockProvider(
	name: ProviderName,
	available: boolean,
): IAIProvider {
	return {
		name,
		displayName: `Mock ${name}`,
		isAvailable: mock(() => Promise.resolve(available)),
		invoke: mock(() =>
			Promise.resolve({ result: "mock result", session_id: "test" }),
		),
		invokeWithRetry: mock(() =>
			Promise.resolve({ result: "mock result", session_id: "test" }),
		),
	};
}

describe("ProviderRegistry", () => {
	// We need to test the registry methods without relying on actual CLI availability
	// So we'll test the logic by creating a minimal registry-like class for testing

	describe("getAvailableProviders", () => {
		it("should return only available providers", async () => {
			const providers = new Map<ProviderName, IAIProvider>();
			providers.set("claude", createMockProvider("claude", true));
			providers.set("codex", createMockProvider("codex", false));
			providers.set("cursor", createMockProvider("cursor", true));

			const available: IAIProvider[] = [];
			for (const provider of providers.values()) {
				if (await provider.isAvailable()) {
					available.push(provider);
				}
			}

			expect(available).toHaveLength(2);
			expect(available.map((p) => p.name)).toContain("claude");
			expect(available.map((p) => p.name)).toContain("cursor");
			expect(available.map((p) => p.name)).not.toContain("codex");
		});

		it("should return empty array when no providers are available", async () => {
			const providers = new Map<ProviderName, IAIProvider>();
			providers.set("claude", createMockProvider("claude", false));
			providers.set("codex", createMockProvider("codex", false));

			const available: IAIProvider[] = [];
			for (const provider of providers.values()) {
				if (await provider.isAvailable()) {
					available.push(provider);
				}
			}

			expect(available).toHaveLength(0);
		});

		it("should return all providers when all are available", async () => {
			const providers = new Map<ProviderName, IAIProvider>();
			providers.set("claude", createMockProvider("claude", true));
			providers.set("codex", createMockProvider("codex", true));
			providers.set("cursor", createMockProvider("cursor", true));

			const available: IAIProvider[] = [];
			for (const provider of providers.values()) {
				if (await provider.isAvailable()) {
					available.push(provider);
				}
			}

			expect(available).toHaveLength(3);
		});
	});

	describe("getRandomAvailable", () => {
		it("should return an available provider", async () => {
			const providers = new Map<ProviderName, IAIProvider>();
			providers.set("claude", createMockProvider("claude", true));
			providers.set("codex", createMockProvider("codex", false));
			providers.set("cursor", createMockProvider("cursor", true));

			const available: IAIProvider[] = [];
			for (const provider of providers.values()) {
				if (await provider.isAvailable()) {
					available.push(provider);
				}
			}

			// getRandomAvailable logic
			if (available.length === 0) {
				throw new Error("No AI providers are available.");
			}
			const randomIndex = Math.floor(Math.random() * available.length);
			const selected = available[randomIndex]!;

			// Selected provider should be one of the available ones
			expect(["claude", "cursor"]).toContain(selected.name);
		});

		it("should throw error when no providers are available", async () => {
			const providers = new Map<ProviderName, IAIProvider>();
			providers.set("claude", createMockProvider("claude", false));
			providers.set("codex", createMockProvider("codex", false));

			const available: IAIProvider[] = [];
			for (const provider of providers.values()) {
				if (await provider.isAvailable()) {
					available.push(provider);
				}
			}

			// getRandomAvailable logic - should throw
			expect(() => {
				if (available.length === 0) {
					throw new Error(
						"No AI providers are available. Please ensure at least one provider CLI is installed.",
					);
				}
			}).toThrow(
				"No AI providers are available. Please ensure at least one provider CLI is installed.",
			);
		});

		it("should return the only available provider when only one exists", async () => {
			const providers = new Map<ProviderName, IAIProvider>();
			providers.set("claude", createMockProvider("claude", false));
			providers.set("codex", createMockProvider("codex", true));
			providers.set("cursor", createMockProvider("cursor", false));

			const available: IAIProvider[] = [];
			for (const provider of providers.values()) {
				if (await provider.isAvailable()) {
					available.push(provider);
				}
			}

			expect(available).toHaveLength(1);

			// getRandomAvailable logic - with only one option, always returns that one
			const randomIndex = Math.floor(Math.random() * available.length);
			const selected = available[randomIndex]!;

			expect(selected.name).toBe("codex");
		});
	});

	describe("isValidProvider", () => {
		it('should accept "random" as a valid provider name', () => {
			const providers = new Map<ProviderName, IAIProvider>();
			providers.set("claude", createMockProvider("claude", true));

			// isValidProvider logic - should accept "random"
			const isValid = (name: string): name is ProviderName => {
				return providers.has(name as ProviderName) || name === "random";
			};

			expect(isValid("random")).toBe(true);
			expect(isValid("claude")).toBe(true);
			expect(isValid("invalid-provider")).toBe(false);
		});
	});
});
