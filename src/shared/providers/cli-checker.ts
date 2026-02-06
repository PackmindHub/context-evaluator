/**
 * Shared utility for checking CLI tool availability with comprehensive logging
 */

/**
 * Checks if a CLI command is available by running it and logging the results
 *
 * @param command - The command to execute (e.g., "claude", "agent")
 * @param args - Arguments to pass to the command (e.g., ["--version"])
 * @param providerName - Display name for logging (e.g., "Claude Code")
 * @returns Promise<boolean> - true if command succeeded (exit code 0), false otherwise
 */
export async function checkCliAvailability(
	command: string,
	args: string[],
	providerName: string,
): Promise<boolean> {
	try {
		// Log the command being executed
		console.log(
			`[CLI Check] ${providerName}: Running command: ${command} ${args.join(" ")}`,
		);

		// Execute the command with stdout/stderr capture
		const proc = Bun.spawn([command, ...args], {
			stdin: "ignore",
			stdout: "pipe",
			stderr: "pipe",
		});

		// Wait for process to exit and get exit code
		const exitCode = await proc.exited;

		// Read output streams
		const stdout = await new Response(proc.stdout).text();
		const stderr = await new Response(proc.stderr).text();

		// Log exit code
		console.log(`[CLI Check] ${providerName}: Exit code: ${exitCode}`);

		// Log stdout if present
		if (stdout.trim()) {
			console.log(`[CLI Check] ${providerName}: stdout: ${stdout.trim()}`);
		}

		// Log stderr if present
		if (stderr.trim()) {
			console.log(`[CLI Check] ${providerName}: stderr: ${stderr.trim()}`);
		}

		// Return true if command succeeded
		return exitCode === 0;
	} catch (error) {
		// Log execution failures (e.g., command not found)
		const errorMessage = error instanceof Error ? error.message : String(error);
		console.log(
			`[CLI Check] ${providerName}: Failed to execute: ${errorMessage}`,
		);
		return false;
	}
}
