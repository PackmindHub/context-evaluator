import React, { useEffect, useRef, useState } from "react";

export interface TabItem {
	id: string;
	label: string;
	icon?: React.ReactNode;
	count?: number;
}

interface TabsProps {
	tabs: TabItem[];
	activeTab: string;
	onTabChange: (tabId: string) => void;
}

interface TabPanelProps {
	id: string;
	activeTab: string;
	children: React.ReactNode;
}

export const Tabs: React.FC<TabsProps> = ({ tabs, activeTab, onTabChange }) => {
	const tabsRef = useRef<HTMLDivElement>(null);
	const [indicatorStyle, setIndicatorStyle] = useState<{
		left: number;
		width: number;
	}>({ left: 0, width: 0 });

	// Update indicator position when active tab changes
	useEffect(() => {
		if (!tabsRef.current) return;

		const activeTabElement = tabsRef.current.querySelector(
			`[data-tab-id="${activeTab}"]`,
		) as HTMLButtonElement | null;

		if (activeTabElement) {
			const containerRect = tabsRef.current.getBoundingClientRect();
			const tabRect = activeTabElement.getBoundingClientRect();

			setIndicatorStyle({
				left: tabRect.left - containerRect.left,
				width: tabRect.width,
			});
		}
	}, [activeTab]);

	return (
		<div ref={tabsRef} className="tab-navigation relative" role="tablist">
			{/* Animated indicator */}
			<div
				className="tab-indicator"
				style={{
					left: indicatorStyle.left,
					width: indicatorStyle.width,
					height: "calc(100% - 12px)",
					top: "6px",
				}}
			/>

			{tabs.map((tab) => {
				const isActive = tab.id === activeTab;
				return (
					<button
						key={tab.id}
						role="tab"
						data-tab-id={tab.id}
						aria-selected={isActive}
						aria-controls={`tabpanel-${tab.id}`}
						className={`tab-button ${isActive ? "tab-button-active" : ""}`}
						onClick={() => onTabChange(tab.id)}
					>
						{tab.icon && <span className="tab-icon">{tab.icon}</span>}
						<span>{tab.label}</span>
						{tab.count !== undefined && (
							<span
								className={`tab-count ${isActive ? "tab-count-active" : ""}`}
							>
								{tab.count}
							</span>
						)}
					</button>
				);
			})}
		</div>
	);
};

export const TabPanel: React.FC<TabPanelProps> = ({
	id,
	activeTab,
	children,
}) => {
	if (id !== activeTab) return null;

	return (
		<div
			id={`tabpanel-${id}`}
			role="tabpanel"
			aria-labelledby={`tab-${id}`}
			className="tab-content-enter"
		>
			{children}
		</div>
	);
};
