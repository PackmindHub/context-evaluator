import { readdir, readFile, stat, writeFile } from "fs/promises";

const html = await readFile("index.html", "utf-8");

// Find the generated App.*.js entry file (the largest one, which is the entry point)
const files = await readdir("dist");
const appJsFiles = files.filter(
	(f) => f.startsWith("App.") && f.endsWith(".js") && !f.includes(".map"),
);

if (appJsFiles.length === 0) {
	throw new Error("No App.*.js bundle found in dist/");
}

// Get file sizes and pick the largest (entry point is always largest)
const filesWithSizes = await Promise.all(
	appJsFiles.map(async (f) => ({
		name: f,
		size: (await stat(`dist/${f}`)).size,
	})),
);

filesWithSizes.sort((a, b) => b.size - a.size);
const jsFile = filesWithSizes[0].name;

// Update HTML with production assets
let prodHtml = html;

// Remove ALL old CSS references (dev and any chunks)
prodHtml = prodHtml.replace(
	/<link[^>]*rel="stylesheet"[^>]*href="[^"]*output\.css"[^>]*>/g,
	"",
);
prodHtml = prodHtml.replace(
	/<link[^>]*rel="stylesheet"[^>]*href="[^"]*chunk-[^"]*\.css"[^>]*>/g,
	"",
);

// Remove old script references
prodHtml = prodHtml.replace(
	/<script[^>]*src="\.\/src\/App\.tsx"[^>]*><\/script>/g,
	"",
);

// Transform favicon/asset paths from relative (./public/) to absolute (/)
// This fixes deep link asset resolution (e.g., /evaluation/:id won't resolve ./public/logo.svg correctly)
prodHtml = prodHtml.replace(/href="\.\/public\//g, 'href="/');

// Add production CSS and JS (find insertion point before </head>)
const headCloseIndex = prodHtml.indexOf("</head>");
if (headCloseIndex === -1) {
	throw new Error("No </head> tag found in HTML");
}

const assetsHtml = `  <link rel="stylesheet" href="/styles.css">\n  <script type="module" src="/${jsFile}"></script>\n`;
prodHtml =
	prodHtml.slice(0, headCloseIndex) +
	assetsHtml +
	prodHtml.slice(headCloseIndex);

await writeFile("dist/index.html", prodHtml);
console.log(`✓ Built dist/index.html (CSS: styles.css, JS: ${jsFile})`);
