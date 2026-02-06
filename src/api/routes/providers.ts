/**
 * Provider Routes
 * API endpoints for provider detection and management
 */

import { providerRegistry } from "@shared/providers/registry";
import { internalErrorResponse, okResponse } from "../utils/response-builder";

/**
 * Provider routes handler
 */
export class ProviderRoutes {
	private cloudMode: boolean;

	constructor(cloudMode = false) {
		this.cloudMode = cloudMode;
	}

	/**
	 * Detect available providers
	 * GET /api/providers/detect
	 *
	 * In cloud mode, returns an empty list since CLI detection is not useful
	 * for public users who can't access the server's CLI.
	 */
	async detect(_req: Request): Promise<Response> {
		// In cloud mode, return empty providers list
		if (this.cloudMode) {
			console.log("[ProviderRoutes] Cloud mode - skipping CLI agent detection");
			return okResponse({ providers: [] });
		}

		try {
			console.log("[ProviderRoutes] Starting CLI agent detection...");
			const providers = await providerRegistry.listWithAvailability();

			// Log results for each provider
			for (const provider of providers) {
				const status = provider.available ? "✓ Available" : "✗ Not found";
				console.log(`[ProviderRoutes] ${provider.displayName}: ${status}`);
			}

			const availableCount = providers.filter((p) => p.available).length;
			console.log(
				`[ProviderRoutes] Detection complete: ${availableCount}/${providers.length} agents available`,
			);

			return okResponse({ providers });
		} catch (error) {
			console.error("[ProviderRoutes] Detection failed:", error);
			return internalErrorResponse(
				"Failed to detect providers",
				"PROVIDER_DETECTION_FAILED",
			);
		}
	}
}
