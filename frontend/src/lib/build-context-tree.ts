import type {
	IContextFile,
	ILinkedDocSummary,
	ISkill,
} from "../types/evaluation";

/**
 * A node in the context file tree hierarchy.
 * Branches (directories) have children; leaves (files) have fileType/filePath.
 */
export interface ContextTreeNode {
	/** Unique identifier (full path for files, directory path for folders) */
	id: string;
	/** Display name (last segment of path) */
	name: string;
	/** File type category (only for leaf nodes) */
	fileType?:
		| "agents"
		| "claude"
		| "copilot"
		| "rules"
		| "cursor-rules"
		| "skills"
		| "linked-doc";
	/** Original file path (only for leaf nodes) */
	filePath?: string;
	/** Children nodes (only for branch/directory nodes) */
	children?: ContextTreeNode[];
}

interface FlatEntry {
	path: string;
	fileType: ContextTreeNode["fileType"];
}

/**
 * Build a tree hierarchy from context files, skills, and linked docs.
 * Directories are sorted first (alphabetically), then files (alphabetically).
 */
export function buildContextTree(
	contextFiles: IContextFile[],
	skills: ISkill[],
	linkedDocs: ILinkedDocSummary[],
): ContextTreeNode[] {
	// Collect all items into flat entries, deduplicating by path
	const entries: FlatEntry[] = [];
	const seenPaths = new Set<string>();

	for (const file of contextFiles) {
		seenPaths.add(file.path);
		entries.push({ path: file.path, fileType: file.type });
	}

	for (const skill of skills) {
		if (!seenPaths.has(skill.path)) {
			seenPaths.add(skill.path);
			entries.push({ path: skill.path, fileType: "skills" });
		}
	}

	for (const doc of linkedDocs) {
		if (!seenPaths.has(doc.path)) {
			seenPaths.add(doc.path);
			entries.push({ path: doc.path, fileType: "linked-doc" });
		}
	}

	// Build the tree from flat entries
	const root: ContextTreeNode[] = [];

	for (const entry of entries) {
		const segments = entry.path.split("/");
		let currentLevel = root;

		// Walk/create nested directory nodes
		for (let i = 0; i < segments.length - 1; i++) {
			const dirName = segments[i];
			const dirPath = segments.slice(0, i + 1).join("/");

			let dirNode = currentLevel.find(
				(n) => n.children !== undefined && n.id === dirPath,
			);

			if (!dirNode) {
				dirNode = {
					id: dirPath,
					name: dirName,
					children: [],
				};
				currentLevel.push(dirNode);
			}

			currentLevel = dirNode.children!;
		}

		// Insert file leaf at final segment
		const fileName = segments[segments.length - 1];
		currentLevel.push({
			id: entry.path,
			name: fileName,
			fileType: entry.fileType,
			filePath: entry.path,
		});
	}

	// Sort recursively: directories first, then files, alphabetically within each group
	sortTree(root);

	return root;
}

function sortTree(nodes: ContextTreeNode[]): void {
	nodes.sort((a, b) => {
		const aIsDir = a.children !== undefined;
		const bIsDir = b.children !== undefined;

		// Directories first
		if (aIsDir && !bIsDir) return -1;
		if (!aIsDir && bIsDir) return 1;

		// Alphabetically within same type
		return a.name.localeCompare(b.name);
	});

	// Recurse into directories
	for (const node of nodes) {
		if (node.children) {
			sortTree(node.children);
		}
	}
}

/**
 * Collect all branch (directory) IDs from the tree for default expansion.
 */
export function getAllBranchIds(nodes: ContextTreeNode[]): string[] {
	const ids: string[] = [];
	for (const node of nodes) {
		if (node.children) {
			ids.push(node.id);
			ids.push(...getAllBranchIds(node.children));
		}
	}
	return ids;
}
