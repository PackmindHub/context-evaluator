import { BookmarkRepository } from "../db/bookmark-repository";

/**
 * API routes for issue bookmark management
 * Handles adding, removing, and retrieving bookmarks
 */
export class BookmarkRoutes {
	private bookmarkRepo = BookmarkRepository.getInstance();

	/**
	 * POST /api/bookmarks - Add a bookmark for an issue
	 */
	async post(req: Request): Promise<Response> {
		try {
			const body = await req.json();
			const { evaluationId, issueHash, evaluatorName } = body;

			// Validation
			if (!evaluationId || !issueHash || !evaluatorName) {
				return new Response(
					JSON.stringify({ error: "Missing required fields" }),
					{ status: 400, headers: { "Content-Type": "application/json" } },
				);
			}

			this.bookmarkRepo.addBookmark(evaluationId, issueHash, evaluatorName);

			return new Response(JSON.stringify({ success: true }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		} catch (error) {
			console.error("[BookmarkRoutes] Error adding bookmark:", error);
			return new Response(JSON.stringify({ error: "Failed to add bookmark" }), {
				status: 500,
				headers: { "Content-Type": "application/json" },
			});
		}
	}

	/**
	 * DELETE /api/bookmarks - Remove a bookmark for an issue
	 */
	async delete(req: Request): Promise<Response> {
		try {
			const url = new URL(req.url);
			const evaluationId = url.searchParams.get("evaluationId");
			const issueHash = url.searchParams.get("issueHash");

			if (!evaluationId || !issueHash) {
				return new Response(
					JSON.stringify({ error: "Missing required parameters" }),
					{ status: 400, headers: { "Content-Type": "application/json" } },
				);
			}

			this.bookmarkRepo.removeBookmark(evaluationId, issueHash);

			return new Response(JSON.stringify({ success: true }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		} catch (error) {
			console.error("[BookmarkRoutes] Error removing bookmark:", error);
			return new Response(
				JSON.stringify({ error: "Failed to remove bookmark" }),
				{ status: 500, headers: { "Content-Type": "application/json" } },
			);
		}
	}

	/**
	 * GET /api/bookmarks/evaluation/:evaluationId - Get bookmarks for a specific evaluation
	 */
	async getForEvaluation(
		req: Request,
		evaluationId: string,
	): Promise<Response> {
		try {
			const bookmarks =
				this.bookmarkRepo.getBookmarksForEvaluation(evaluationId);

			return new Response(
				JSON.stringify({ bookmarks: Array.from(bookmarks) }),
				{
					status: 200,
					headers: { "Content-Type": "application/json" },
				},
			);
		} catch (error) {
			console.error("[BookmarkRoutes] Error fetching bookmarks:", error);
			return new Response(
				JSON.stringify({ error: "Failed to fetch bookmarks" }),
				{ status: 500, headers: { "Content-Type": "application/json" } },
			);
		}
	}
}
