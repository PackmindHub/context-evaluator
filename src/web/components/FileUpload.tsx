import type { EvaluationOutput } from "@shared/types/evaluation";
import React, { useCallback, useState } from "react";

interface FileUploadProps {
	onFileLoad: (data: EvaluationOutput) => void;
	onClear: () => void;
	hasData: boolean;
}

export const FileUpload: React.FC<FileUploadProps> = ({
	onFileLoad,
	onClear,
	hasData,
}) => {
	const [isDragging, setIsDragging] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const validateAndParseFile = useCallback(
		(file: File) => {
			setError(null);

			// Validate file type
			if (!file.name.endsWith(".json")) {
				setError("Please upload a JSON file");
				return;
			}

			// Validate file size (max 10MB)
			const maxSize = 10 * 1024 * 1024;
			if (file.size > maxSize) {
				setError("File size must be less than 10MB");
				return;
			}

			// Read and parse file
			const reader = new FileReader();
			reader.onload = (e) => {
				try {
					const text = e.target?.result as string;
					const data = JSON.parse(text) as EvaluationOutput;

					// Basic validation
					if (!data.metadata || (!("files" in data) && !("results" in data))) {
						setError("Invalid evaluation results format");
						return;
					}

					onFileLoad(data);
				} catch (err) {
					setError(
						"Failed to parse JSON file. Please ensure it's a valid evaluation results file.",
					);
					console.error("Parse error:", err);
				}
			};
			reader.onerror = () => {
				setError("Failed to read file");
			};
			reader.readAsText(file);
		},
		[onFileLoad],
	);

	const handleDragOver = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		setIsDragging(true);
	}, []);

	const handleDragLeave = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		setIsDragging(false);
	}, []);

	const handleDrop = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault();
			setIsDragging(false);

			const files = Array.from(e.dataTransfer.files);
			const firstFile = files[0];
			if (firstFile) {
				validateAndParseFile(firstFile);
			}
		},
		[validateAndParseFile],
	);

	const handleFileSelect = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const files = e.target.files;
			const firstFile = files?.[0];
			if (firstFile) {
				validateAndParseFile(firstFile);
			}
		},
		[validateAndParseFile],
	);

	return (
		<div className="w-full">
			{!hasData ? (
				<div
					onDragOver={handleDragOver}
					onDragLeave={handleDragLeave}
					onDrop={handleDrop}
					className={`
            card border-2 border-dashed transition-all duration-300 cursor-pointer group
            ${
							isDragging
								? "border-blue-500 bg-blue-900/20 shadow-lg scale-[1.02]"
								: "border-slate-600 hover:border-slate-500 hover:shadow-xl hover:shadow-black/40"
						}
          `}
				>
					<div className="flex flex-col items-center py-6">
						{/* Animated Icon */}
						<div
							className={`mb-6 transition-transform duration-300 ${isDragging ? "scale-110" : "group-hover:scale-105"}`}
						>
							<div className="relative">
								<div
									className={`absolute inset-0 ${isDragging ? "bg-blue-500/20" : "bg-slate-700/20"} blur-xl rounded-full transition-colors`}
								></div>
								<div
									className={`relative w-20 h-20 ${isDragging ? "bg-gradient-to-br from-blue-500 to-indigo-500" : "bg-gradient-to-br from-slate-600 to-slate-700"} rounded-xl flex items-center justify-center shadow-lg transition-all`}
								>
									<svg
										className="h-10 w-10 text-white"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
									>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth={2}
											d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
										/>
									</svg>
								</div>
							</div>
						</div>

						{/* Text Content */}
						<div className="text-center mb-6">
							<p className="text-xl font-semibold text-slate-100 mb-2">
								{isDragging
									? "Drop your file here"
									: "Drop your evaluation results"}
							</p>
							<p className="text-sm text-slate-300 mb-1">
								Supports JSON files up to 10MB
							</p>
							<p className="text-xs text-slate-400">
								or click below to browse your files
							</p>
						</div>

						{/* Upload Button */}
						<label className="btn-primary cursor-pointer group-hover:shadow-lg transition-shadow">
							<div className="flex items-center gap-2">
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
										d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
									/>
								</svg>
								<span>Select File</span>
							</div>
							<input
								type="file"
								accept=".json"
								onChange={handleFileSelect}
								className="hidden"
							/>
						</label>
					</div>
				</div>
			) : (
				<div className="card border-2 border-green-700/60 bg-gradient-to-br from-green-900/30 to-emerald-900/20 !py-3">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-2">
							<div className="w-8 h-8 bg-gradient-to-br from-green-500 to-emerald-600 rounded-lg flex items-center justify-center shadow-sm">
								<svg
									className="h-5 w-5 text-white"
									fill="currentColor"
									viewBox="0 0 20 20"
								>
									<path
										fillRule="evenodd"
										d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
										clipRule="evenodd"
									/>
								</svg>
							</div>
							<div>
								<p className="text-xs font-semibold text-green-300">
									Evaluation results loaded successfully
								</p>
								<p className="text-xs text-green-400/80">
									Ready to analyze your codebase
								</p>
							</div>
						</div>
						<button onClick={onClear} className="btn-secondary text-xs">
							<div className="flex items-center gap-1.5">
								<svg
									className="w-3.5 h-3.5"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
									/>
								</svg>
								<span>Upload New File</span>
							</div>
						</button>
					</div>
				</div>
			)}

			{error && (
				<div className="mt-4 card border-2 border-red-700/60 bg-gradient-to-br from-red-900/30 to-rose-900/20 animate-fade-in">
					<div className="flex items-start gap-3">
						<div className="w-8 h-8 bg-gradient-to-br from-red-500 to-rose-600 rounded-lg flex items-center justify-center flex-shrink-0">
							<svg
								className="h-5 w-5 text-white"
								fill="currentColor"
								viewBox="0 0 20 20"
							>
								<path
									fillRule="evenodd"
									d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
									clipRule="evenodd"
								/>
							</svg>
						</div>
						<div>
							<p className="font-semibold text-red-300 text-sm mb-1">
								Upload failed
							</p>
							<p className="text-sm text-red-400">{error}</p>
						</div>
					</div>
				</div>
			)}
		</div>
	);
};
