import { SelectionRepository } from "../db/selection-repository";

/**
 * API routes for issue selection management (remediation picks)
 * Handles adding, removing, and retrieving selections
 */
export class SelectionRoutes {
	private selectionRepo = SelectionRepository.getInstance();

	/**
	 * POST /api/selections - Add selections for issues (batch)
	 */
	async post(req: Request): Promise<Response> {
		try {
			const body = await req.json();
			const { evaluationId, issueKeys } = body;

			if (
				!evaluationId ||
				!Array.isArray(issueKeys) ||
				issueKeys.length === 0
			) {
				return new Response(
					JSON.stringify({ error: "Missing required fields" }),
					{ status: 400, headers: { "Content-Type": "application/json" } },
				);
			}

			this.selectionRepo.addSelections(evaluationId, issueKeys);

			return new Response(JSON.stringify({ success: true }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		} catch (error) {
			console.error("[SelectionRoutes] Error adding selections:", error);
			return new Response(
				JSON.stringify({ error: "Failed to add selections" }),
				{ status: 500, headers: { "Content-Type": "application/json" } },
			);
		}
	}

	/**
	 * DELETE /api/selections - Remove a single selection
	 */
	async delete(req: Request): Promise<Response> {
		try {
			const url = new URL(req.url);
			const evaluationId = url.searchParams.get("evaluationId");
			const issueKey = url.searchParams.get("issueKey");

			if (!evaluationId || !issueKey) {
				return new Response(
					JSON.stringify({ error: "Missing required parameters" }),
					{ status: 400, headers: { "Content-Type": "application/json" } },
				);
			}

			this.selectionRepo.removeSelection(evaluationId, issueKey);

			return new Response(JSON.stringify({ success: true }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		} catch (error) {
			console.error("[SelectionRoutes] Error removing selection:", error);
			return new Response(
				JSON.stringify({ error: "Failed to remove selection" }),
				{ status: 500, headers: { "Content-Type": "application/json" } },
			);
		}
	}

	/**
	 * DELETE /api/selections/evaluation/:evaluationId - Clear all selections
	 */
	async clearForEvaluation(
		_req: Request,
		evaluationId: string,
	): Promise<Response> {
		try {
			this.selectionRepo.clearSelections(evaluationId);

			return new Response(JSON.stringify({ success: true }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		} catch (error) {
			console.error("[SelectionRoutes] Error clearing selections:", error);
			return new Response(
				JSON.stringify({ error: "Failed to clear selections" }),
				{ status: 500, headers: { "Content-Type": "application/json" } },
			);
		}
	}

	/**
	 * GET /api/selections/evaluation/:evaluationId - Get selections for evaluation
	 */
	async getForEvaluation(
		_req: Request,
		evaluationId: string,
	): Promise<Response> {
		try {
			const selections =
				this.selectionRepo.getSelectionsForEvaluation(evaluationId);

			return new Response(
				JSON.stringify({ selections: Array.from(selections) }),
				{
					status: 200,
					headers: { "Content-Type": "application/json" },
				},
			);
		} catch (error) {
			console.error("[SelectionRoutes] Error fetching selections:", error);
			return new Response(
				JSON.stringify({ error: "Failed to fetch selections" }),
				{ status: 500, headers: { "Content-Type": "application/json" } },
			);
		}
	}
}
