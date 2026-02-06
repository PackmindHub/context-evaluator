/**
 * Embedded Assets Module
 *
 * Provides access to frontend assets and prompts embedded at compile time.
 * This enables single-binary deployment without external files.
 */

export * from "./asset-server";
export * from "./prompt-server";

// Check if we're running in embedded mode
export async function isEmbeddedMode(): Promise<boolean> {
	try {
		// Try to access embedded assets
		const frontendModule = await import("./frontend-assets");
		const promptsModule = await import("./prompts-assets");
		return (
			Object.keys(frontendModule.frontendAssets).length > 0 &&
			Object.keys(promptsModule.evaluatorPrompts).length > 0
		);
	} catch {
		return false;
	}
}
