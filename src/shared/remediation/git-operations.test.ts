import { describe, expect, it } from "bun:test";
import { parseUnifiedDiff } from "./git-operations";

describe("parseUnifiedDiff", () => {
	it("returns empty array for empty diff", () => {
		expect(parseUnifiedDiff("")).toEqual([]);
		expect(parseUnifiedDiff("   ")).toEqual([]);
	});

	it("parses a single modified file", () => {
		const diff = `diff --git a/AGENTS.md b/AGENTS.md
index abc1234..def5678 100644
--- a/AGENTS.md
+++ b/AGENTS.md
@@ -1,3 +1,4 @@
 # AGENTS.md
+## New Section

 Some content
`;

		const result = parseUnifiedDiff(diff);
		expect(result).toHaveLength(1);
		expect(result[0]!.path).toBe("AGENTS.md");
		expect(result[0]!.status).toBe("modified");
		expect(result[0]!.additions).toBe(1);
		expect(result[0]!.deletions).toBe(0);
		expect(result[0]!.diff).toContain("diff --git");
	});

	it("parses a new file", () => {
		const diff = `diff --git a/docs/AGENTS.md b/docs/AGENTS.md
new file mode 100644
index 0000000..abc1234
--- /dev/null
+++ b/docs/AGENTS.md
@@ -0,0 +1,3 @@
+# Docs AGENTS.md
+
+Content here
`;

		const result = parseUnifiedDiff(diff);
		expect(result).toHaveLength(1);
		expect(result[0]!.path).toBe("docs/AGENTS.md");
		expect(result[0]!.status).toBe("added");
		expect(result[0]!.additions).toBe(3);
		expect(result[0]!.deletions).toBe(0);
	});

	it("parses a deleted file", () => {
		const diff = `diff --git a/old-file.md b/old-file.md
deleted file mode 100644
index abc1234..0000000
--- a/old-file.md
+++ /dev/null
@@ -1,2 +0,0 @@
-# Old File
-Content
`;

		const result = parseUnifiedDiff(diff);
		expect(result).toHaveLength(1);
		expect(result[0]!.path).toBe("old-file.md");
		expect(result[0]!.status).toBe("deleted");
		expect(result[0]!.additions).toBe(0);
		expect(result[0]!.deletions).toBe(2);
	});

	it("parses multiple files in a single diff", () => {
		const diff = `diff --git a/AGENTS.md b/AGENTS.md
index abc1234..def5678 100644
--- a/AGENTS.md
+++ b/AGENTS.md
@@ -1,3 +1,4 @@
 # AGENTS.md
+New line

 Content
diff --git a/src/AGENTS.md b/src/AGENTS.md
new file mode 100644
index 0000000..abc1234
--- /dev/null
+++ b/src/AGENTS.md
@@ -0,0 +1,2 @@
+# Src AGENTS.md
+Content
`;

		const result = parseUnifiedDiff(diff);
		expect(result).toHaveLength(2);
		expect(result[0]!.path).toBe("AGENTS.md");
		expect(result[0]!.status).toBe("modified");
		expect(result[1]!.path).toBe("src/AGENTS.md");
		expect(result[1]!.status).toBe("added");
	});

	it("counts additions and deletions correctly", () => {
		const diff = `diff --git a/AGENTS.md b/AGENTS.md
index abc1234..def5678 100644
--- a/AGENTS.md
+++ b/AGENTS.md
@@ -1,5 +1,6 @@
 # AGENTS.md
-Old line 1
-Old line 2
+New line 1
+New line 2
+New line 3

 Content
`;

		const result = parseUnifiedDiff(diff);
		expect(result).toHaveLength(1);
		expect(result[0]!.additions).toBe(3);
		expect(result[0]!.deletions).toBe(2);
	});

	it("handles multiple hunks in a single file", () => {
		const diff = `diff --git a/AGENTS.md b/AGENTS.md
index abc1234..def5678 100644
--- a/AGENTS.md
+++ b/AGENTS.md
@@ -1,3 +1,4 @@
 # AGENTS.md
+Line added at top

 Content
@@ -10,3 +11,4 @@
 More content
+Line added at bottom

 End
`;

		const result = parseUnifiedDiff(diff);
		expect(result).toHaveLength(1);
		expect(result[0]!.additions).toBe(2);
		expect(result[0]!.deletions).toBe(0);
	});
});
