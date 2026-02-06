import { useEffect, useState } from "react";

/**
 * Hook to fetch application version from the health endpoint
 *
 * Caches version in sessionStorage to avoid repeated requests.
 * Falls back to "1.0.0" if fetch fails.
 */
export function useVersion() {
	const [version, setVersion] = useState<string>("1.0.0");
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const fetchVersion = async () => {
			// Check cache first
			const cached = sessionStorage.getItem("app-version");
			if (cached) {
				setVersion(cached);
				setIsLoading(false);
				return;
			}

			try {
				const response = await fetch("/api/health");
				if (!response.ok) {
					throw new Error(`Health check failed: ${response.status}`);
				}

				const data = await response.json();
				const fetchedVersion = data.version || "1.0.0";

				// Cache the version
				sessionStorage.setItem("app-version", fetchedVersion);
				setVersion(fetchedVersion);
				setError(null);
			} catch (err) {
				const errorMsg =
					err instanceof Error ? err.message : "Failed to fetch version";
				console.warn(`[useVersion] ${errorMsg}, using fallback version`);
				setError(errorMsg);
				setVersion("1.0.0");
			} finally {
				setIsLoading(false);
			}
		};

		fetchVersion();
	}, []);

	return { version, isLoading, error };
}
