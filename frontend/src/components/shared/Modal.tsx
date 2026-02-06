import React, { useCallback, useEffect } from "react";

interface ModalProps {
	/** Whether the modal is open */
	isOpen: boolean;
	/** Callback when the modal should close */
	onClose: () => void;
	/** Modal title */
	title: string;
	/** Optional icon to display next to the title */
	icon?: React.ReactNode;
	/** Modal content */
	children: React.ReactNode;
	/** Max width class (default: max-w-3xl) */
	maxWidth?: string;
}

/**
 * A reusable modal component with glass-card styling
 *
 * Features:
 * - Semi-transparent backdrop with blur
 * - Close via X button, Escape key, or backdrop click
 * - Body scroll lock when open
 * - Scrollable content area
 */
export const Modal: React.FC<ModalProps> = ({
	isOpen,
	onClose,
	title,
	icon,
	children,
	maxWidth = "max-w-3xl",
}) => {
	// Handle Escape key
	const handleKeyDown = useCallback(
		(e: KeyboardEvent) => {
			if (e.key === "Escape") {
				onClose();
			}
		},
		[onClose],
	);

	// Lock body scroll and add key listener when open
	useEffect(() => {
		if (isOpen) {
			document.body.style.overflow = "hidden";
			document.addEventListener("keydown", handleKeyDown);
		} else {
			document.body.style.overflow = "";
		}

		return () => {
			document.body.style.overflow = "";
			document.removeEventListener("keydown", handleKeyDown);
		};
	}, [isOpen, handleKeyDown]);

	if (!isOpen) return null;

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center p-4"
			onClick={onClose}
		>
			{/* Backdrop */}
			<div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm" />

			{/* Modal */}
			<div
				className={`relative ${maxWidth} w-full glass-card p-6 animate-fade-in`}
				onClick={(e) => e.stopPropagation()}
			>
				{/* Header */}
				<div className="flex items-center justify-between mb-4">
					<div className="flex items-center gap-3">
						{icon && (
							<span className="w-6 h-6 bg-slate-700 rounded-lg flex items-center justify-center">
								{icon}
							</span>
						)}
						<h3 className="text-lg font-bold text-slate-100">{title}</h3>
					</div>
					<button
						onClick={onClose}
						className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-700/60 rounded-lg transition-all"
						aria-label="Close modal"
					>
						<svg
							className="w-5 h-5"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M6 18L18 6M6 6l12 12"
							/>
						</svg>
					</button>
				</div>

				{/* Content */}
				<div className="max-h-[70vh] overflow-y-auto custom-scrollbar">
					{children}
				</div>
			</div>
		</div>
	);
};
