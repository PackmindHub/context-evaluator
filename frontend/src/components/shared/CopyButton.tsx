import React, { useCallback, useState } from "react";

interface CopyButtonProps {
	/** The text to copy to clipboard */
	text: string;
	/** Optional custom class name */
	className?: string;
	/** Optional children to render instead of default icon */
	children?: React.ReactNode;
	/** Callback fired after successful copy */
	onCopy?: () => void;
	/** Duration in ms to show "copied" state (default: 2000) */
	copiedDuration?: number;
	/** Variant style: 'icon' (default), 'text', 'emoji' */
	variant?: "icon" | "text" | "emoji";
	/** Title/tooltip text */
	title?: string;
}

/**
 * Reusable copy-to-clipboard button with visual feedback
 *
 * Handles both modern clipboard API and fallback for older browsers.
 */
export const CopyButton: React.FC<CopyButtonProps> = ({
	text,
	className = "",
	children,
	onCopy,
	copiedDuration = 2000,
	variant = "icon",
	title = "Copy to clipboard",
}) => {
	const [copied, setCopied] = useState(false);

	const handleCopy = useCallback(
		async (e: React.MouseEvent) => {
			e.stopPropagation();

			try {
				await navigator.clipboard.writeText(text);
				setCopied(true);
				onCopy?.();
				setTimeout(() => setCopied(false), copiedDuration);
			} catch {
				// Fallback for older browsers
				const textArea = document.createElement("textarea");
				textArea.value = text;
				textArea.style.position = "fixed";
				textArea.style.left = "-9999px";
				document.body.appendChild(textArea);
				textArea.select();
				document.execCommand("copy");
				document.body.removeChild(textArea);
				setCopied(true);
				onCopy?.();
				setTimeout(() => setCopied(false), copiedDuration);
			}
		},
		[text, onCopy, copiedDuration],
	);

	// Custom children take precedence
	if (children) {
		return (
			<button
				onClick={handleCopy}
				className={className}
				title={copied ? "Copied!" : title}
			>
				{children}
			</button>
		);
	}

	// Default variants
	const baseClass =
		"transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-800";

	if (variant === "emoji") {
		return (
			<button
				onClick={handleCopy}
				className={`text-xs text-indigo-400 hover:text-purple-300 ${baseClass} ${className}`}
				title={copied ? "Copied!" : title}
			>
				{copied ? "✓" : "📋"}
			</button>
		);
	}

	if (variant === "text") {
		return (
			<button
				onClick={handleCopy}
				className={`text-sm text-indigo-400 hover:text-purple-300 flex items-center gap-1 ${baseClass} ${className}`}
				title={copied ? "Copied!" : title}
			>
				{copied ? (
					<>
						<svg
							className="h-4 w-4"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M5 13l4 4L19 7"
							/>
						</svg>
						<span>Copied!</span>
					</>
				) : (
					<>
						<svg
							className="h-4 w-4"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
							/>
						</svg>
						<span>Copy</span>
					</>
				)}
			</button>
		);
	}

	// Default: icon variant
	return (
		<button
			onClick={handleCopy}
			className={`p-1.5 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-700/60 ${baseClass} ${className}`}
			title={copied ? "Copied!" : title}
		>
			{copied ? (
				<svg
					className="h-4 w-4 text-green-400"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth={2}
						d="M5 13l4 4L19 7"
					/>
				</svg>
			) : (
				<svg
					className="h-4 w-4"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth={2}
						d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
					/>
				</svg>
			)}
		</button>
	);
};
