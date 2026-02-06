/**
 * Provider Registry
 * Factory for creating and managing AI providers
 */

import { ClaudeProvider } from "./claude-provider";
import { CodexProvider } from "./codex-provider";
import { CursorProvider } from "./cursor-provider";
import { GitHubCopilotProvider } from "./github-copilot-provider";
import { OpenCodeProvider } from "./opencode-provider";
import type { IAIProvider, IProviderInfo, ProviderName } from "./types";

/**
 * Default provider when none is specified
 */
export const DEFAULT_PROVIDER: ProviderName = "claude";

/**
 * Registry of all available providers
 */
class ProviderRegistry {
	private providers: Map<ProviderName, IAIProvider> = new Map();

	constructor() {
		// Register all providers
		this.register(new ClaudeProvider());
		this.register(new CodexProvider());
		this.register(new CursorProvider());
		this.register(new GitHubCopilotProvider());
		this.register(new OpenCodeProvider());
	}

	/**
	 * Register a provider
	 */
	private register(provider: IAIProvider): void {
		this.providers.set(provider.name, provider);
	}

	/**
	 * Get a provider by name
	 * @param name - Provider name (defaults to 'claude')
	 * @throws Error if provider is not found
	 */
	get(name?: ProviderName): IAIProvider {
		const providerName = name ?? DEFAULT_PROVIDER;
		const provider = this.providers.get(providerName);

		if (!provider) {
			const available = Array.from(this.providers.keys()).join(", ");
			throw new Error(
				`Unknown provider: '${providerName}'. Available providers: ${available}`,
			);
		}

		return provider;
	}

	/**
	 * List all registered providers
	 */
	list(): ProviderName[] {
		return Array.from(this.providers.keys());
	}

	/**
	 * Get information about all providers including availability
	 */
	async listWithAvailability(): Promise<IProviderInfo[]> {
		const results: IProviderInfo[] = [];

		for (const provider of this.providers.values()) {
			console.log(
				`[ProviderRegistry] Testing CLI: ${provider.displayName} (${provider.name})...`,
			);
			const available = await provider.isAvailable();

			results.push({
				name: provider.name,
				displayName: provider.displayName,
				available,
			});
		}

		return results;
	}

	/**
	 * Check if a provider name is valid
	 */
	isValidProvider(name: string): name is ProviderName {
		return this.providers.has(name as ProviderName) || name === "random";
	}

	/**
	 * Get all providers that are currently available (CLI installed and accessible)
	 */
	async getAvailableProviders(): Promise<IAIProvider[]> {
		const results: IAIProvider[] = [];
		for (const provider of this.providers.values()) {
			if (await provider.isAvailable()) {
				results.push(provider);
			}
		}
		return results;
	}

	/**
	 * Get a random provider from those that are available
	 * Used in cloud mode to automatically select an available provider
	 * @throws Error if no providers are available
	 */
	async getRandomAvailable(): Promise<IAIProvider> {
		const available = await this.getAvailableProviders();
		if (available.length === 0) {
			throw new Error(
				"No AI providers are available. Please ensure at least one provider CLI is installed.",
			);
		}
		const randomIndex = Math.floor(Math.random() * available.length);
		return available[randomIndex]!;
	}
}

/**
 * Singleton instance of the provider registry
 */
export const providerRegistry = new ProviderRegistry();

/**
 * Convenience function to get a provider
 * @param name - Provider name (defaults to 'claude')
 */
export function getProvider(name?: ProviderName): IAIProvider {
	return providerRegistry.get(name);
}

/**
 * Convenience function to list available providers
 */
export function listProviders(): ProviderName[] {
	return providerRegistry.list();
}

/**
 * Convenience function to check if a provider name is valid
 */
export function isValidProviderName(name: string): name is ProviderName {
	return providerRegistry.isValidProvider(name);
}
