/**
 * Collapsible container for past remediation history.
 * Accordion behavior: expanding one card collapses others.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useEvaluationApi } from "../hooks/useEvaluationApi";
import type { RemediationHistoryItem } from "../types/remediation";
import {
	type ImpactEvalStatus,
	RemediationHistoryCard,
} from "./RemediationHistoryCard";
import { Modal } from "./shared/Modal";

interface ImpactEvalState {
	jobId?: string;
	status: ImpactEvalStatus;
	score?: number;
	grade?: string;
}

interface RemediationHistoryProps {
	remediations: RemediationHistoryItem[];
	onDelete: (id: string) => void;
	onRefresh?: () => void;
	cloudMode?: boolean;
	autoExpandId?: string | null;
	onAutoExpandHandled?: () => void;
	parentScore?: number;
	parentGrade?: string;
	hasRepoUrl?: boolean;
}

export function RemediationHistory({
	remediations,
	onDelete,
	onRefresh,
	cloudMode = false,
	autoExpandId,
	onAutoExpandHandled,
	parentScore,
	hasRepoUrl = true,
}: RemediationHistoryProps) {
	const api = useEvaluationApi();
	const [collapsed, setCollapsed] = useState(true);
	const [expandedId, setExpandedId] = useState<string | null>(null);
	const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
	const [isDeleting, setIsDeleting] = useState(false);
	const [impactEvals, setImpactEvals] = useState<Map<string, ImpactEvalState>>(
		new Map(),
	);
	const sseCleanupRef = useRef<Map<string, () => void>>(new Map());

	// Auto-expand a specific card when requested (e.g., after remediation completes)
	useEffect(() => {
		if (autoExpandId) {
			setCollapsed(false);
			setExpandedId(autoExpandId);
			onAutoExpandHandled?.();
		}
	}, [autoExpandId, onAutoExpandHandled]);

	// Load scores for remediations that already have a result evaluation
	useEffect(() => {
		for (const item of remediations) {
			if (item.resultEvaluationId) {
				// Skip if we already have score for this one
				const existing = impactEvals.get(item.id);
				if (existing?.score !== undefined) continue;

				api.getEvaluationScore(item.resultEvaluationId).then((data) => {
					if (data.contextScore !== undefined) {
						setImpactEvals((prev) => {
							const next = new Map(prev);
							next.set(item.id, {
								status: "completed",
								score: data.contextScore,
								grade: data.contextGrade,
							});
							return next;
						});
					}
				});
			}
		}
	}, [remediations, api, impactEvals]);

	// Cleanup SSE connections on unmount
	useEffect(() => {
		return () => {
			for (const cleanup of sseCleanupRef.current.values()) {
				cleanup();
			}
		};
	}, []);

	const handleEvaluateImpact = useCallback(
		async (remediationId: string) => {
			try {
				const result = await api.evaluateRemediationImpact(remediationId);

				// Update state with jobId immediately so the card can show a progress link
				setImpactEvals((prev) => {
					const next = new Map(prev);
					next.set(remediationId, { status: "running", jobId: result.jobId });
					return next;
				});

				if (result.status === "already_exists") {
					// Fetch score directly
					const scoreData = await api.getEvaluationScore(result.jobId);
					setImpactEvals((prev) => {
						const next = new Map(prev);
						next.set(remediationId, {
							jobId: result.jobId,
							status: "completed",
							score: scoreData.contextScore,
							grade: scoreData.contextGrade,
						});
						return next;
					});
					return;
				}

				// Connect to evaluation SSE for progress
				const sseUrl = result.sseUrl.startsWith("/")
					? `${window.location.origin}${result.sseUrl}`
					: result.sseUrl;

				const eventSource = new EventSource(sseUrl);

				const cleanup = () => {
					eventSource.close();
					sseCleanupRef.current.delete(remediationId);
				};
				sseCleanupRef.current.set(remediationId, cleanup);

				eventSource.onmessage = (event) => {
					try {
						const data = JSON.parse(event.data);

						if (data.type === "job.completed") {
							cleanup();
							// Fetch the score from the completed evaluation
							api.getEvaluationScore(result.jobId).then((scoreData) => {
								setImpactEvals((prev) => {
									const next = new Map(prev);
									next.set(remediationId, {
										jobId: result.jobId,
										status: "completed",
										score: scoreData.contextScore,
										grade: scoreData.contextGrade,
									});
									return next;
								});
							});
							onRefresh?.();
						} else if (data.type === "job.failed") {
							cleanup();
							setImpactEvals((prev) => {
								const next = new Map(prev);
								next.set(remediationId, {
									jobId: result.jobId,
									status: "failed",
								});
								return next;
							});
						}
					} catch {
						// Ignore parse errors
					}
				};

				eventSource.onerror = () => {
					cleanup();
					// SSE disconnected but job may still be running in the background.
					// Keep current state (with jobId) so the user can track via the link.
				};
			} catch {
				setImpactEvals((prev) => {
					const next = new Map(prev);
					next.set(remediationId, { status: "failed" });
					return next;
				});
			}
		},
		[api, onRefresh],
	);

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
					{remediations.map((item, idx) => {
						const evalState = impactEvals.get(item.id);
						return (
							<RemediationHistoryCard
								key={item.id}
								item={item}
								index={idx}
								total={remediations.length}
								expanded={expandedId === item.id}
								onToggle={() => handleToggleCard(item.id)}
								onDelete={() => setDeleteTargetId(item.id)}
								onEvaluateImpact={() => handleEvaluateImpact(item.id)}
								cloudMode={cloudMode}
								parentScore={parentScore}
								impactEvalStatus={evalState?.status}
								impactJobId={evalState?.jobId}
								impactScore={evalState?.score}
								impactGrade={evalState?.grade}
								hasRepoUrl={hasRepoUrl}
							/>
						);
					})}
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
