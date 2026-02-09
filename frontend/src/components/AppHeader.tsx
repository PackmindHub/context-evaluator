import { useFeatureFlags } from "../contexts/FeatureFlagContext";

interface AppHeaderProps {
	onLogoClick?: () => void; // Custom click handler (e.g., handleClear)
	logoNavigatesHome?: boolean; // Default: true
	currentPage?:
		| "home"
		| "recent"
		| "issues"
		| "evaluators"
		| "stats"
		| "how-it-works"
		| "assessment";
	historyCount?: number; // Number of recent evaluations
	showAssessment?: boolean; // Override feature flag
}

export function AppHeader({
	onLogoClick,
	logoNavigatesHome = true,
	currentPage = "home",
	historyCount = 0,
	showAssessment,
}: AppHeaderProps) {
	const { assessmentEnabled } = useFeatureFlags();

	const handleLogoClickInternal = () => {
		if (onLogoClick) {
			onLogoClick();
		} else if (logoNavigatesHome) {
			window.location.href = "/";
		}
	};

	const isActive = (page: string) => currentPage === page;

	// Determine if Assessment link should show
	const showAssessmentLink = showAssessment ?? assessmentEnabled;

	return (
		<header className="bg-slate-800 border-b border-slate-700 sticky top-0 z-50">
			<div className="max-w-[1400px] mx-auto px-6 py-3">
				<div className="flex items-center justify-between">
					{/* Logo section */}
					<button
						onClick={handleLogoClickInternal}
						className="flex items-center gap-3 hover:opacity-80 transition-opacity cursor-pointer"
					>
						<svg
							className="w-10 h-10"
							viewBox="0 0 64 64"
							fill="none"
							xmlns="http://www.w3.org/2000/svg"
							aria-label="context-evaluator logo"
						>
							<defs>
								<linearGradient
									id="robotGradient"
									x1="0%"
									y1="0%"
									x2="100%"
									y2="100%"
								>
									<stop offset="0%" stopColor="#6366f1" />
									<stop offset="100%" stopColor="#8b5cf6" />
								</linearGradient>
							</defs>
							{/* Robot Body */}
							<rect
								x="30"
								y="32"
								width="28"
								height="24"
								rx="6"
								fill="url(#robotGradient)"
							/>
							{/* Robot Head */}
							<circle cx="44" cy="24" r="14" fill="url(#robotGradient)" />
							{/* Robot Face */}
							<ellipse cx="44" cy="26" rx="9" ry="7" fill="#1e293b" />
							{/* Robot Eyes */}
							<circle cx="40" cy="26" r="2.5" fill="#c7d2fe" />
							<circle cx="48" cy="26" r="2.5" fill="#c7d2fe" />
							{/* Robot Antenna */}
							<line
								x1="44"
								y1="10"
								x2="44"
								y2="6"
								stroke="url(#robotGradient)"
								strokeWidth="2"
								strokeLinecap="round"
							/>
							<circle cx="44" cy="5" r="2.5" fill="url(#robotGradient)" />
							{/* Robot Ears */}
							<rect
								x="28"
								y="20"
								width="4"
								height="8"
								rx="2"
								fill="url(#robotGradient)"
							/>
							<rect
								x="56"
								y="20"
								width="4"
								height="8"
								rx="2"
								fill="url(#robotGradient)"
							/>
							{/* Document - outline only */}
							<rect
								x="6"
								y="22"
								width="24"
								height="32"
								rx="3"
								fill="none"
								stroke="#a5b4fc"
								strokeWidth="2"
							/>
							{/* Document fold */}
							<path
								d="M24 22 L24 28 L30 28"
								fill="none"
								stroke="#a5b4fc"
								strokeWidth="2"
								strokeLinejoin="round"
							/>
							{/* Document lines */}
							<line
								x1="10"
								y1="32"
								x2="22"
								y2="32"
								stroke="#a5b4fc"
								strokeWidth="2"
								strokeLinecap="round"
							/>
							<line
								x1="10"
								y1="37"
								x2="20"
								y2="37"
								stroke="#a5b4fc"
								strokeWidth="2"
								strokeLinecap="round"
							/>
							{/* Checkmark */}
							<path
								d="M12 44 L16 48 L24 40"
								stroke="#22c55e"
								strokeWidth="2.5"
								strokeLinecap="round"
								strokeLinejoin="round"
								fill="none"
							/>
						</svg>
						<div className="text-left">
							<h1 className="text-lg font-bold text-slate-50">
								context-evaluator
							</h1>
							<p className="text-slate-300 text-xs">
								AI agent documentation quality analyzer
							</p>
						</div>
					</button>

					{/* Navigation links */}
					<div className="flex items-center gap-3">
						<a
							href="/"
							className={`btn-ghost px-4 py-2 rounded-lg transition-colors ${
								isActive("home") ? "bg-slate-700" : ""
							}`}
						>
							Home
						</a>
						<a
							href="/recent"
							className={`btn-ghost px-4 py-2 rounded-lg transition-colors flex items-center gap-2 ${
								isActive("recent") ? "bg-slate-700" : ""
							}`}
						>
							<svg
								className="w-4 h-4"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
								/>
							</svg>
							<span className="hidden sm:inline">Latest</span>
							{historyCount > 0 && (
								<span className="bg-indigo-600 text-white text-xs font-medium px-1.5 py-0.5 rounded-full">
									{historyCount}
								</span>
							)}
						</a>
						<a
							href="/issues"
							className={`btn-ghost px-4 py-2 rounded-lg transition-colors flex items-center gap-2 ${
								isActive("issues") ? "bg-slate-700" : ""
							}`}
						>
							<svg
								className="w-4 h-4"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
								/>
							</svg>
							<span className="hidden sm:inline">Issues</span>
						</a>
						<a
							href="/evaluators"
							className={`btn-ghost px-4 py-2 rounded-lg transition-colors ${
								isActive("evaluators") ? "bg-slate-700" : ""
							}`}
						>
							Evaluators
						</a>
						<a
							href="/stats"
							className={`btn-ghost px-4 py-2 rounded-lg transition-colors ${
								isActive("stats") ? "bg-slate-700" : ""
							}`}
						>
							Stats
						</a>
						<a
							href="/how-it-works"
							className={`btn-ghost px-4 py-2 rounded-lg transition-colors ${
								isActive("how-it-works") ? "bg-slate-700" : ""
							}`}
						>
							How it works?
						</a>
						{showAssessmentLink && (
							<a
								href="/assessment"
								className={`btn-ghost px-4 py-2 rounded-lg transition-colors ${
									isActive("assessment") ? "bg-slate-700" : ""
								}`}
							>
								Assessment
							</a>
						)}
						<a
							href="https://github.com/PackmindHub/context-evaluator"
							target="_blank"
							rel="noopener noreferrer"
							className="btn-ghost flex items-center gap-2"
						>
							<svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
								<path
									fillRule="evenodd"
									d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
									clipRule="evenodd"
								/>
							</svg>
							<span className="hidden sm:inline">GitHub</span>
						</a>
					</div>
				</div>
			</div>
		</header>
	);
}
