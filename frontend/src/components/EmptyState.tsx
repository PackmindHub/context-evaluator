import React from "react";

export const EmptyState: React.FC = () => {
	return (
		<div className="relative flex flex-col items-center justify-center px-4 py-8">
			{/* Background gradient orbs */}
			<div className="absolute inset-0 overflow-hidden pointer-events-none">
				<div
					className="bg-orb bg-orb-blue absolute -top-20 -left-20 w-96 h-96 opacity-60"
					aria-hidden="true"
				/>
				<div
					className="bg-orb bg-orb-purple absolute -bottom-20 -right-20 w-80 h-80 opacity-50"
					aria-hidden="true"
				/>
			</div>

			<div className="relative text-center max-w-2xl animate-fade-in">
				{/* Hero headline with gradient */}
				<h2 className="hero-headline mb-4">
					Analyze your{" "}
					<span className="hero-headline-gradient">AI agent context</span>
				</h2>

				{/* Tagline */}
				<p className="hero-tagline mb-4">
					Improve context quality for AI Coding Agents by evaluating your
					AGENTS.md, CLAUDE.md, copilot-instructions.md, SKILL.md, and
					referenced documentation
				</p>

				<p className="text-sm text-slate-500 mb-4">
					Paste a Git repository URL below to evaluate{" "}
					<code className="px-2 py-0.5 bg-slate-800 border border-slate-700 rounded text-xs font-mono text-slate-300">
						AGENTS.md
					</code>
					,{" "}
					<code className="px-2 py-0.5 bg-slate-800 border border-slate-700 rounded text-xs font-mono text-slate-300">
						CLAUDE.md
					</code>
					,{" "}
					<code className="px-2 py-0.5 bg-slate-800 border border-slate-700 rounded text-xs font-mono text-slate-300">
						copilot-instructions.md
					</code>
					,{" "}
					<code className="px-2 py-0.5 bg-slate-800 border border-slate-700 rounded text-xs font-mono text-slate-300">
						SKILL.md
					</code>
					, and referenced documentation files
				</p>

				<p className="text-xs text-slate-500 mt-2">
					Powered by{" "}
					<a
						href="https://packmind.com?utm_source=context-evaluator"
						target="_blank"
						rel="noopener noreferrer"
						className="text-slate-400 hover:text-slate-300 underline"
					>
						Packmind
					</a>
				</p>
			</div>
		</div>
	);
};
