import { cpSync, existsSync, watch } from "fs";
import { dirname, join } from "path";

// Get the directory of this script file
const FRONTEND_DIR = dirname(import.meta.path);
const DIST_DIR = join(FRONTEND_DIR, "dist");
const SRC_DIR = join(FRONTEND_DIR, "src");
const ASSETS_DIR = join(FRONTEND_DIR, "assets");
const PUBLIC_DIR = join(FRONTEND_DIR, "public");

// Track build version for live reload
let buildVersion = Date.now();

async function copyAssets() {
	if (existsSync(ASSETS_DIR)) {
		cpSync(ASSETS_DIR, join(DIST_DIR, "assets"), { recursive: true });
	}
	// Copy public folder (favicon, logo, etc.)
	if (existsSync(PUBLIC_DIR)) {
		cpSync(PUBLIC_DIR, join(DIST_DIR, "public"), { recursive: true });
	}
}

async function build() {
	const buildResult = await Bun.build({
		entrypoints: [join(FRONTEND_DIR, "index.html")],
		outdir: DIST_DIR,
		target: "browser",
		minify: false,
	});

	if (!buildResult.success) {
		console.error("Build failed:", buildResult.logs);
		return false;
	}

	// Copy static assets after build
	await copyAssets();

	buildVersion = Date.now();
	return true;
}

// Initial build
if (!(await build())) {
	process.exit(1);
}

// Watch for changes and rebuild
let rebuildTimeout: Timer | null = null;
watch(SRC_DIR, { recursive: true }, (_event, filename) => {
	if (
		filename &&
		(filename.endsWith(".ts") ||
			filename.endsWith(".tsx") ||
			filename.endsWith(".css"))
	) {
		// Debounce rebuilds
		if (rebuildTimeout) clearTimeout(rebuildTimeout);
		rebuildTimeout = setTimeout(async () => {
			console.log(`\n🔄 Change detected in ${filename}, rebuilding...`);
			if (await build()) {
				console.log("✅ Rebuild complete");
			}
		}, 100);
	}
});

// API backend URL (can be configured via environment variable)
const API_URL = process.env.API_URL || "http://localhost:3001";

Bun.serve({
	port: 3000,
	async fetch(req) {
		const url = new URL(req.url);
		const path = url.pathname;

		// Live reload polling endpoint
		if (path === "/__reload") {
			return new Response(JSON.stringify({ version: buildVersion }), {
				headers: { "Content-Type": "application/json" },
			});
		}

		// Proxy /api/ requests to the backend
		if (path.startsWith("/api/")) {
			const backendUrl = `${API_URL}${path}${url.search}`;
			console.log(`[Proxy] ${req.method} ${path} -> ${backendUrl}`);

			try {
				// Forward the request to the backend
				const backendResponse = await fetch(backendUrl, {
					method: req.method,
					headers: req.headers,
					body:
						req.method !== "GET" && req.method !== "HEAD"
							? req.body
							: undefined,
					// Don't follow redirects, let the client handle them
					redirect: "manual",
				});

				// Clone the response headers and add CORS
				const headers = new Headers(backendResponse.headers);
				headers.set("Access-Control-Allow-Origin", "*");

				// Return the proxied response
				return new Response(backendResponse.body, {
					status: backendResponse.status,
					statusText: backendResponse.statusText,
					headers,
				});
			} catch (error) {
				console.error(`[Proxy] Error forwarding to ${backendUrl}:`, error);
				return new Response(JSON.stringify({ error: "Backend unavailable" }), {
					status: 502,
					headers: { "Content-Type": "application/json" },
				});
			}
		}

		// Live reload script to inject in dev mode
		const liveReloadScript = `
<script>
(function() {
  let lastVersion = ${buildVersion};
  setInterval(async () => {
    try {
      const res = await fetch('/__reload');
      const { version } = await res.json();
      if (version !== lastVersion) {
        console.log('🔄 Reloading...');
        location.reload();
      }
    } catch (e) {}
  }, 500);
})();
</script>
`;

		// Serve index.html for root or SPA routes
		if (path === "/" || path === "/index.html" || !path.includes(".")) {
			const htmlFile = Bun.file(join(DIST_DIR, "index.html"));
			if (await htmlFile.exists()) {
				let html = await htmlFile.text();
				// Fix relative paths that conflict with <base href="/">
				html = html.replace(/href="\.\/([^"]+)"/g, 'href="/$1"');
				html = html.replace(/src="\.\/([^"]+)"/g, 'src="/$1"');
				// Inject live reload script before </body>
				html = html.replace("</body>", `${liveReloadScript}</body>`);
				return new Response(html, {
					headers: { "Content-Type": "text/html" },
				});
			}
		}

		// Try to serve from dist folder
		const file = Bun.file(join(DIST_DIR, path));
		if (await file.exists()) {
			return new Response(file);
		}

		// Try to serve static assets from frontend root (e.g., /assets/images/)
		const assetFile = Bun.file(join(FRONTEND_DIR, path));
		if (await assetFile.exists()) {
			return new Response(assetFile);
		}

		return new Response("Not Found", { status: 404 });
	},
});

console.log("🚀 Frontend server running at http://localhost:3000");
console.log(`   API proxy: ${API_URL}`);
console.log("   👀 Watching for changes in src/...");
