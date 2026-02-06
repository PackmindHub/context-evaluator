import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownPreviewProps {
	/** Markdown content to render */
	content: string;
	/** Additional CSS class names */
	className?: string;
}

/**
 * Renders markdown content with proper styling.
 * Uses react-markdown with GitHub Flavored Markdown support.
 */
export const MarkdownPreview: React.FC<MarkdownPreviewProps> = ({
	content,
	className = "",
}) => {
	return (
		<div className={`markdown-content ${className}`}>
			<ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
		</div>
	);
};
