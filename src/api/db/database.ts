import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "fs";
import { dirname, resolve } from "path";

/**
 * SQLite database singleton for evaluation persistence
 * Uses Bun's native SQLite driver with WAL mode for performance
 */

// Database file path (relative to current working directory, not bundle)
// This ensures the database is created where the binary is executed
const DB_PATH = resolve(process.cwd(), "data/evaluations.db");

// Singleton database instance
let db: Database | null = null;

/**
 * Initialize the database connection and create tables
 */
function initializeDatabase(): Database {
	console.log(`[Database] Initializing SQLite database at ${DB_PATH}`);

	// Ensure the data directory exists before creating the database
	const dbDir = dirname(DB_PATH);
	if (!existsSync(dbDir)) {
		mkdirSync(dbDir, { recursive: true });
		console.log(`[Database] Created directory: ${dbDir}`);
	}

	const database = new Database(DB_PATH, { create: true });

	// Enable WAL mode for better concurrent read/write performance
	database.run("PRAGMA journal_mode = WAL;");

	// Create evaluations table
	database.run(`
    CREATE TABLE IF NOT EXISTS evaluations (
      id TEXT PRIMARY KEY,
      repository_url TEXT NOT NULL,
      evaluation_mode TEXT,
      evaluators_count INTEGER NOT NULL,
      status TEXT NOT NULL,
      total_files INTEGER DEFAULT 0,
      total_issues INTEGER DEFAULT 0,
      critical_count INTEGER DEFAULT 0,
      high_count INTEGER DEFAULT 0,
      medium_count INTEGER DEFAULT 0,
      total_cost_usd REAL DEFAULT 0,
      total_duration_ms INTEGER DEFAULT 0,
      total_input_tokens INTEGER DEFAULT 0,
      total_output_tokens INTEGER DEFAULT 0,
      curated_count INTEGER DEFAULT 0,
      result_json TEXT,
      final_prompts_json TEXT,
      error_message TEXT,
      error_code TEXT,
      created_at TEXT NOT NULL,
      completed_at TEXT NOT NULL
    );
  `);

	// Add final_prompts_json column if it doesn't exist (for existing databases)
	try {
		database.run(`ALTER TABLE evaluations ADD COLUMN final_prompts_json TEXT;`);
	} catch {
		// Column already exists, ignore
	}

	// Create index for faster date-based lookups
	database.run(`
    CREATE INDEX IF NOT EXISTS idx_evaluations_completed_at
    ON evaluations(completed_at DESC);
  `);

	// Add context_score and context_grade columns if they don't exist (for existing databases)
	try {
		database.run(`ALTER TABLE evaluations ADD COLUMN context_score REAL;`);
	} catch {
		// Column already exists, ignore
	}
	try {
		database.run(`ALTER TABLE evaluations ADD COLUMN context_grade TEXT;`);
	} catch {
		// Column already exists, ignore
	}

	// Add failed_evaluator_count column if it doesn't exist (for existing databases)
	try {
		database.run(
			`ALTER TABLE evaluations ADD COLUMN failed_evaluator_count INTEGER DEFAULT 0;`,
		);
	} catch {
		// Column already exists, ignore
	}

	// Add git metadata columns if they don't exist (for existing databases)
	try {
		database.run(`ALTER TABLE evaluations ADD COLUMN git_branch TEXT;`);
	} catch {
		// Column already exists, ignore
	}
	try {
		database.run(`ALTER TABLE evaluations ADD COLUMN git_commit_sha TEXT;`);
	} catch {
		// Column already exists, ignore
	}

	// Create issue_feedback table
	database.run(`
    CREATE TABLE IF NOT EXISTS issue_feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      evaluation_id TEXT NOT NULL,
      issue_hash TEXT NOT NULL,
      evaluator_name TEXT NOT NULL,
      feedback_type TEXT NOT NULL CHECK(feedback_type IN ('like', 'dislike')),
      created_at TEXT NOT NULL,
      UNIQUE(evaluation_id, issue_hash),
      FOREIGN KEY(evaluation_id) REFERENCES evaluations(id) ON DELETE CASCADE
    );
  `);

	// Create indexes for feedback queries
	database.run(`
    CREATE INDEX IF NOT EXISTS idx_feedback_evaluation
    ON issue_feedback(evaluation_id);
  `);

	database.run(`
    CREATE INDEX IF NOT EXISTS idx_feedback_evaluator
    ON issue_feedback(evaluator_name);
  `);

	// Create issue_bookmarks table
	database.run(`
    CREATE TABLE IF NOT EXISTS issue_bookmarks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      evaluation_id TEXT NOT NULL,
      issue_hash TEXT NOT NULL,
      evaluator_name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(evaluation_id, issue_hash),
      FOREIGN KEY(evaluation_id) REFERENCES evaluations(id) ON DELETE CASCADE
    );
  `);

	// Create index for bookmark queries
	database.run(`
    CREATE INDEX IF NOT EXISTS idx_bookmarks_evaluation
    ON issue_bookmarks(evaluation_id);
  `);

	// Create issue_selections table (remediation picks)
	database.run(`
    CREATE TABLE IF NOT EXISTS issue_selections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      evaluation_id TEXT NOT NULL,
      issue_key TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(evaluation_id, issue_key),
      FOREIGN KEY(evaluation_id) REFERENCES evaluations(id) ON DELETE CASCADE
    );
  `);

	// Create index for selection queries
	database.run(`
    CREATE INDEX IF NOT EXISTS idx_selections_evaluation
    ON issue_selections(evaluation_id);
  `);

	// Create remediations table
	database.run(`
    CREATE TABLE IF NOT EXISTS remediations (
      id TEXT PRIMARY KEY,
      evaluation_id TEXT NOT NULL,
      status TEXT NOT NULL,
      provider TEXT NOT NULL,
      target_file_type TEXT NOT NULL,
      selected_issue_count INTEGER NOT NULL,
      error_count INTEGER DEFAULT 0,
      suggestion_count INTEGER DEFAULT 0,
      full_patch TEXT,
      file_changes_json TEXT,
      total_additions INTEGER DEFAULT 0,
      total_deletions INTEGER DEFAULT 0,
      files_changed INTEGER DEFAULT 0,
      total_duration_ms INTEGER DEFAULT 0,
      total_cost_usd REAL DEFAULT 0,
      total_input_tokens INTEGER DEFAULT 0,
      total_output_tokens INTEGER DEFAULT 0,
      error_message TEXT,
      created_at TEXT NOT NULL,
      completed_at TEXT,
      FOREIGN KEY(evaluation_id) REFERENCES evaluations(id) ON DELETE CASCADE
    );
  `);

	// Add is_imported column if it doesn't exist (for existing databases)
	try {
		database.run(
			`ALTER TABLE evaluations ADD COLUMN is_imported INTEGER DEFAULT 0;`,
		);
	} catch {
		// Column already exists, ignore
	}

	// Add summary_json column if it doesn't exist (for existing databases)
	try {
		database.run(`ALTER TABLE remediations ADD COLUMN summary_json TEXT;`);
	} catch {
		// Column already exists, ignore
	}

	// Add prompt_stats_json column if it doesn't exist (for existing databases)
	try {
		database.run(`ALTER TABLE remediations ADD COLUMN prompt_stats_json TEXT;`);
	} catch {
		// Column already exists, ignore
	}

	// Create index for remediation lookups by evaluation
	database.run(`
    CREATE INDEX IF NOT EXISTS idx_remediations_evaluation
    ON remediations(evaluation_id);
  `);

	console.log("[Database] Database initialized successfully");

	return database;
}

/**
 * Get the database instance (singleton pattern)
 */
export function getDatabase(): Database {
	if (!db) {
		db = initializeDatabase();
	}
	return db;
}

/**
 * Close the database connection
 */
export function closeDatabase(): void {
	if (db) {
		db.close();
		db = null;
		console.log("[Database] Database connection closed");
	}
}
