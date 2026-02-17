/**
 * Collapsible container for past remediation history.
 * Accordion behavior: expanding one card collapses others.
 */

import { useCallback, useState } from "react";
import type { RemediationHistoryItem } from "../types/remediation";
import { RemediationHistoryCard } from "./RemediationHistoryCard";
import { Modal } from "./shared/Modal";

interface RemediationHistoryProps {
	remediations: RemediationHistoryItem[];
	onDelete: (id: string) => void;
	cloudMode?: boolean;
}

export function RemediationHistory({
	remediations,
	onDelete,
	cloudMode = false,
}: RemediationHistoryProps) {
	const [collapsed, setCollapsed] = useState(true);
	const [expandedId, setExpandedId] = useState<string | null>(null);
	const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
	const [isDeleting, setIsDeleting] = useState(false);

	const handleToggleCard = useCallback((id: string) => {
		setExpandedId((prev) => (prev === id ? null : id));
	}, []);

	const handleConfirmDelete = useCallback(async () => {
		if (!deleteTargetId) return;
		setIsDeleting(true);
		try {
			await onDelete(deleteTargetId);
			if (expandedId === deleteTargetId) {
				setExpandedId(null);
			}
		} finally {
			setIsDeleting(false);
			setDeleteTargetId(null);
		}
	}, [deleteTargetId, expandedId, onDelete]);

	if (remediations.length === 0) return null;

	return (
		<div className="card">
			<button
				onClick={() => setCollapsed(!collapsed)}
				className="w-full flex items-center justify-between text-left"
			>
				<span className="text-sm font-semibold text-slate-200">
					Past Remediations ({remediations.length})
				</span>
				<svg
					className={`w-4 h-4 text-slate-400 transition-transform ${collapsed ? "" : "rotate-180"}`}
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth={2}
						d="M19 9l-7 7-7-7"
					/>
				</svg>
			</button>

			{!collapsed && (
				<div className="mt-3 space-y-2">
					{remediations.map((item, idx) => (
						<RemediationHistoryCard
							key={item.id}
							item={item}
							index={idx}
							total={remediations.length}
							expanded={expandedId === item.id}
							onToggle={() => handleToggleCard(item.id)}
							onDelete={() => setDeleteTargetId(item.id)}
							cloudMode={cloudMode}
						/>
					))}
				</div>
			)}

			{/* Delete Confirmation Modal */}
			<Modal
				isOpen={deleteTargetId !== null}
				onClose={() => setDeleteTargetId(null)}
				title="Delete Remediation"
				maxWidth="max-w-md"
			>
				<div className="space-y-4">
					<p className="text-sm text-slate-300">
						This will permanently delete this remediation record and its patch.
						This action cannot be undone.
					</p>
					<div className="flex justify-end gap-3 pt-2">
						<button
							onClick={() => setDeleteTargetId(null)}
							className="btn-secondary"
							disabled={isDeleting}
						>
							Cancel
						</button>
						<button
							onClick={handleConfirmDelete}
							disabled={isDeleting}
							className="btn-primary bg-red-600 hover:bg-red-500"
						>
							{isDeleting ? "Deleting..." : "Delete"}
						</button>
					</div>
				</div>
			</Modal>
		</div>
	);
}
