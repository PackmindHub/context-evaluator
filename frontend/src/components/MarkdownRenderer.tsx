import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownRendererProps {
	content: string | undefined | null;
	className?: string;
	variant?: "default" | "compact";
}

export const MarkdownRenderer = React.memo<MarkdownRendererProps>(
	({ content, className = "", variant = "default" }) => {
		if (!content) return null;

		const variantClass =
			variant === "compact" ? "markdown-content-compact" : "markdown-content";

		return (
			<div className={`${variantClass} ${className}`}>
				<ReactMarkdown
					remarkPlugins={[remarkGfm]}
					disallowedElements={["script", "iframe", "object", "embed"]}
				>
					{content}
				</ReactMarkdown>
			</div>
		);
	},
);

MarkdownRenderer.displayName = "MarkdownRenderer";
