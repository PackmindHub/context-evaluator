// Claude CLI integration types

export interface IClaudeInvocation {
	prompt: string;
	timeout?: number;
}

export interface IClaudeResponse {
	result: string;
	error?: string;
	exitCode: number;
	duration: number;
}

export interface IClaudeInvoker {
	invoke(params: IClaudeInvocation): Promise<IClaudeResponse>;
}

export interface EvaluatorPrompt {
	name: string;
	path: string;
	content: string;
}
