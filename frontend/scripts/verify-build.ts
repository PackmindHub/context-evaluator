import { readFile } from "fs/promises";

const html = await readFile("dist/index.html", "utf-8");

let hasErrors = false;

// Check that styles.css is referenced
if (!html.includes("styles.css")) {
	console.error("❌ ERROR: dist/index.html does not reference styles.css");
	hasErrors = true;
}

// Check that chunk CSS is NOT referenced
if (html.includes("chunk-")) {
	console.error("❌ ERROR: dist/index.html still references chunk CSS");
	hasErrors = true;
}

// Check that output.css is NOT referenced
if (html.includes("output.css")) {
	console.error(
		"❌ ERROR: dist/index.html still references output.css (dev CSS)",
	);
	hasErrors = true;
}

// Check that App.tsx is NOT referenced as a script
if (html.includes("src/App.tsx")) {
	console.error("❌ ERROR: dist/index.html still references src/App.tsx");
	hasErrors = true;
}

if (hasErrors) {
	process.exit(1);
}

console.log("✓ HTML verification passed - production build is correct");
