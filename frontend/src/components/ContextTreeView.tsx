import { createTreeCollection, TreeView } from "@ark-ui/react/tree-view";
import React, { useMemo } from "react";
import {
	buildContextTree,
	type ContextTreeNode,
	getAllBranchIds,
} from "../lib/build-context-tree";
import type {
	IContextFile,
	ILinkedDocSummary,
	ISkill,
} from "../types/evaluation";

interface ContextTreeViewProps {
	contextFiles: IContextFile[];
	skills: ISkill[];
	linkedDocs: ILinkedDocSummary[];
	onFileClick: (path: string, fileType: string) => void;
}

/** Folder icon */
const FolderIcon: React.FC<{ className?: string }> = ({
	className = "w-4 h-4",
}) => (
	<svg
		className={className}
		fill="none"
		viewBox="0 0 24 24"
		stroke="currentColor"
	>
		<path
			strokeLinecap="round"
			strokeLinejoin="round"
			strokeWidth={2}
			d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
		/>
	</svg>
);

/** File icon */
const FileIcon: React.FC<{ className?: string }> = ({
	className = "w-4 h-4",
}) => (
	<svg
		className={className}
		fill="none"
		viewBox="0 0 24 24"
		stroke="currentColor"
	>
		<path
			strokeLinecap="round"
			strokeLinejoin="round"
			strokeWidth={2}
			d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
		/>
	</svg>
);

/** Chevron icon for branch expand/collapse */
const ChevronIcon: React.FC<{ className?: string }> = ({
	className = "w-3 h-3",
}) => (
	<svg
		className={className}
		fill="none"
		viewBox="0 0 24 24"
		stroke="currentColor"
	>
		<path
			strokeLinecap="round"
			strokeLinejoin="round"
			strokeWidth={2}
			d="M9 5l7 7-7 7"
		/>
	</svg>
);

/** Get a badge label for file type */
function getFileTypeBadge(
	fileType?: string,
): { label: string; className: string } | null {
	switch (fileType) {
		case "agents":
			return {
				label: "AGENTS.md",
				className: "bg-indigo-500/20 text-indigo-300",
			};
		case "claude":
			return {
				label: "CLAUDE.md",
				className: "bg-slate-600/40 text-slate-300",
			};
		case "copilot":
			return {
				label: "Copilot",
				className: "bg-slate-600/40 text-slate-300",
			};
		case "rules":
			return {
				label: "Claude Rule",
				className: "bg-slate-600/40 text-slate-300",
			};
		case "cursor-rules":
			return {
				label: "Cursor Rule",
				className: "bg-slate-600/40 text-slate-300",
			};
		case "skills":
			return {
				label: "Skill",
				className: "bg-slate-600/40 text-slate-300",
			};
		case "linked-doc":
			return {
				label: "Linked docs",
				className: "bg-slate-600/40 text-slate-300",
			};
		default:
			return null;
	}
}

export const ContextTreeView: React.FC<ContextTreeViewProps> = ({
	contextFiles,
	skills,
	linkedDocs,
	onFileClick,
}) => {
	const treeNodes = useMemo(
		() => buildContextTree(contextFiles, skills, linkedDocs),
		[contextFiles, skills, linkedDocs],
	);

	const defaultExpandedIds = useMemo(
		() => getAllBranchIds(treeNodes),
		[treeNodes],
	);

	const collection = useMemo(
		() =>
			createTreeCollection<ContextTreeNode>({
				rootNode: { id: "root", name: "root", children: treeNodes },
				nodeToValue: (node) => node.id,
				nodeToString: (node) => node.name,
				nodeToChildren: (node) => node.children ?? [],
			}),
		[treeNodes],
	);

	if (treeNodes.length === 0) {
		return (
			<div className="p-12 text-center">
				<p className="text-sm text-slate-400">
					No context files to display in tree view.
				</p>
			</div>
		);
	}

	return (
		<div className="p-2">
			<TreeView.Root
				collection={collection}
				defaultExpandedValue={defaultExpandedIds}
			>
				<TreeView.Tree>
					<TreeView.NodeProvider node={collection.rootNode} indexPath={[]}>
						{collection
							.getNodeChildren(collection.rootNode)
							.map((node, index) => (
								<TreeNodeRenderer
									key={node.id}
									node={node}
									indexPath={[index]}
									collection={collection}
									onFileClick={onFileClick}
								/>
							))}
					</TreeView.NodeProvider>
				</TreeView.Tree>
			</TreeView.Root>
		</div>
	);
};

/** Recursive tree node renderer using Ark UI primitives */
const TreeNodeRenderer: React.FC<{
	node: ContextTreeNode;
	indexPath: number[];
	collection: ReturnType<typeof createTreeCollection<ContextTreeNode>>;
	onFileClick: (path: string, fileType: string) => void;
}> = ({ node, indexPath, collection, onFileClick }) => {
	const children = collection.getNodeChildren(node);
	const isBranch = children.length > 0;

	if (isBranch) {
		return (
			<TreeView.NodeProvider node={node} indexPath={indexPath}>
				<TreeView.Branch>
					<TreeView.BranchControl className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-slate-800/30 transition-colors cursor-pointer">
						<TreeView.BranchIndicator className="text-slate-500 transition-transform duration-150 data-[state=open]:rotate-90">
							<ChevronIcon />
						</TreeView.BranchIndicator>
						<FolderIcon className="w-4 h-4 text-slate-400" />
						<TreeView.BranchText className="text-sm text-slate-300">
							{node.name}
						</TreeView.BranchText>
					</TreeView.BranchControl>
					<TreeView.BranchContent className="pl-4 border-l border-slate-700/50 ml-[11px]">
						{children.map((child, childIndex) => (
							<TreeNodeRenderer
								key={child.id}
								node={child}
								indexPath={[...indexPath, childIndex]}
								collection={collection}
								onFileClick={onFileClick}
							/>
						))}
					</TreeView.BranchContent>
				</TreeView.Branch>
			</TreeView.NodeProvider>
		);
	}

	const badge = getFileTypeBadge(node.fileType);

	return (
		<TreeView.NodeProvider node={node} indexPath={indexPath}>
			<TreeView.Item
				className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-slate-800/30 transition-colors cursor-pointer ml-3"
				onClick={() => {
					if (node.filePath && node.fileType) {
						onFileClick(node.filePath, node.fileType);
					}
				}}
			>
				<FileIcon className="w-4 h-4 text-slate-500" />
				<TreeView.ItemText className="text-sm text-slate-300 truncate">
					{node.name}
				</TreeView.ItemText>
				{badge && (
					<span className={`text-xs px-1.5 py-0.5 rounded ${badge.className}`}>
						{badge.label}
					</span>
				)}
			</TreeView.Item>
		</TreeView.NodeProvider>
	);
};
