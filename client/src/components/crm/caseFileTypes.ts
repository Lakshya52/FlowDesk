// Shared shapes for the caseFile tracker (API responses are serialized by
// server/src/services/caseFileWorkflow.ts).

export type CaseFileStatus = "in_process" | "closed" | "lost";

export type CheckpointKey =
	| "in_process"
	| "proposal"
	| "clarifications"
	| "finalizing";

export interface CaseFileDocStatus {
	_id: string;
	name: string;
	color: string;
	isResolved: boolean;
	isActive?: boolean;
}

export interface CaseFileDoc {
	_id: string;
	name: string;
	required: boolean;
	statusId?: string | null;
	status?: CaseFileDocStatus | null;
	statusChangedAt?: string | null;
	touched?: boolean;
	removedFromTemplate?: boolean;
}

export interface WorkflowItem {
	key: string;
	label: string;
	hint?: string;
	done: boolean;
	doneAt?: string | null;
	doneBy?: { _id: string; name?: string } | string | null;
}

export interface CaseFileWorkflow {
	proposal: WorkflowItem[];
	finalizing: WorkflowItem[];
}

export interface Clarification {
	_id: string;
	text: string;
	resolved: boolean;
	createdBy:
		| { _id: string; name?: string; email?: string; avatar?: string }
		| string;
	createdAt: string;
	resolvedAt?: string | null;
	resolvedBy?: string | null;
}

export interface CheckpointProgress {
	key: CheckpointKey;
	label: string;
	done: number;
	total: number;
	percent: number;
	complete: boolean;
	/** Clarifications only: user explicitly confirmed none are needed. */
	cleared?: boolean;
}

export interface CaseFile {
	_id: string;
	leadId: string;
	leadName?: string;
	companyName?: string;
	phone?: string;
	productId?: { _id: string; name: string; isActive?: boolean } | null;
	status: CaseFileStatus;
	stage:
		| CheckpointKey
		| "ready"
		| "sanctioned"
		| "lost";
	docs: CaseFileDoc[];
	workflow?: CaseFileWorkflow;
	clarifications?: Clarification[];
	clarificationsCleared?: boolean;
	clarificationsClearedAt?: string | null;
	checkpoints?: CheckpointProgress[];
	overallPercent?: number;
	notes?: string;
	convertedAt: string;
	sanctionedAt?: string | null;
	lostAt?: string | null;
	lostReason?: string;
	closedAt?: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface TimelineEntry {
	_id: string;
	at: string;
	action: string;
	kind?: string;
	user?: { _id: string; name?: string; avatar?: string } | null;
	metadata?: Record<string, any>;
}

export const CHECKPOINT_ORDER: CheckpointKey[] = [
	"in_process",
	"proposal",
	"clarifications",
	"finalizing",
];
