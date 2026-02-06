import React, { createContext, useContext, useEffect, useState } from "react";

export interface FeatureFlags {
	assessmentEnabled: boolean;
	groupSelectEnabled: boolean;
	cloudMode: boolean;
}

const FeatureFlagContext = createContext<FeatureFlags>({
	assessmentEnabled: false,
	groupSelectEnabled: false,
	cloudMode: false,
});

export function FeatureFlagProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	const [flags, setFlags] = useState<FeatureFlags>({
		assessmentEnabled: false,
		groupSelectEnabled: false,
		cloudMode: false,
	});

	useEffect(() => {
		// Fetch feature flags from API
		const fetchFlags = async () => {
			try {
				const response = await fetch("/api/config");
				if (response.ok) {
					const data = await response.json();
					setFlags({
						assessmentEnabled: data.assessmentEnabled ?? false,
						groupSelectEnabled: data.groupSelectEnabled ?? false,
						cloudMode: data.cloudMode ?? false,
					});
				}
			} catch (error) {
				console.error("Failed to fetch feature flags:", error);
			}
		};

		fetchFlags();
	}, []);

	return (
		<FeatureFlagContext.Provider value={flags}>
			{children}
		</FeatureFlagContext.Provider>
	);
}

export function useFeatureFlags(): FeatureFlags {
	return useContext(FeatureFlagContext);
}
