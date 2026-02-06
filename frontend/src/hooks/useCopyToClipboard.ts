import { useCallback, useState } from "react";

interface UseCopyToClipboardOptions {
	/** Duration in ms to show "copied" state (default: 2000) */
	copiedDuration?: number;
	/** Callback fired after successful copy */
	onCopy?: () => void;
	/** Callback fired on copy error */
	onError?: (error: Error) => void;
}

interface UseCopyToClipboardReturn {
	/** Whether text was recently copied (true for copiedDuration ms after copy) */
	copied: boolean;
	/** Copy text to clipboard */
	copyToClipboard: (text: string) => Promise<void>;
}

/**
 * Hook for copying text to clipboard with visual feedback
 *
 * Handles both modern clipboard API and fallback for older browsers.
 *
 * @param options - Configuration options
 * @returns Object with copied state and copyToClipboard function
 *
 * @example
 * ```tsx
 * const { copied, copyToClipboard } = useCopyToClipboard();
 *
 * return (
 *   <button onClick={() => copyToClipboard(text)}>
 *     {copied ? 'Copied!' : 'Copy'}
 *   </button>
 * );
 * ```
 */
export function useCopyToClipboard(
	options: UseCopyToClipboardOptions = {},
): UseCopyToClipboardReturn {
	const { copiedDuration = 2000, onCopy, onError } = options;
	const [copied, setCopied] = useState(false);

	const copyToClipboard = useCallback(
		async (text: string) => {
			try {
				await navigator.clipboard.writeText(text);
				setCopied(true);
				onCopy?.();
				setTimeout(() => setCopied(false), copiedDuration);
			} catch (_err) {
				// Fallback for older browsers
				try {
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
				} catch (fallbackErr) {
					onError?.(
						fallbackErr instanceof Error
							? fallbackErr
							: new Error("Copy failed"),
					);
				}
			}
		},
		[copiedDuration, onCopy, onError],
	);

	return { copied, copyToClipboard };
}
