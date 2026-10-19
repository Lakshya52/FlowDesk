import mongoose from 'mongoose';
import { ICaseFile } from '../models/CaseFile';

// ─────────────────────────────────────────────────────────────────────────────
// CaseFile workflow definition
//
// Four checkpoints, each with its own sub-checkpoints:
//   1. In Process      → the document checklist (from the loan product template)
//   2. Proposal to Bank → hardcoded items below
//   3. Clarifications   → notes trail (unresolved notes keep it open)
//   4. Finalizing       → hardcoded items below
//
// Sanctioned / Lost are terminal outcomes and live on `status`.
// Keep the labels in sync with client/src/components/crm/CaseFileDetailModal.tsx
// ─────────────────────────────────────────────────────────────────────────────

export interface WorkflowItemDef {
    key: string;
    label: string;
    hint?: string;
}

export const PROPOSAL_ITEMS: WorkflowItemDef[] = [
    { key: 'proposal_prepared', label: 'Proposal prepared', hint: 'File and terms ready' },
    { key: 'proposal_submitted', label: 'Proposal submitted to bank', hint: 'Sent to the lender' },
    { key: 'bank_acknowledgement', label: 'Bank acknowledgement received', hint: 'Bank confirmed receipt' },
];

export const FINALIZING_ITEMS: WorkflowItemDef[] = [
    { key: 'final_approval', label: 'Final approval received', hint: 'Internal / credit sign-off' },
    { key: 'sanction_letter', label: 'Sanction letter received', hint: 'Bank issued the sanction' },
    { key: 'agreement_signed', label: 'Loan agreement signed', hint: 'Documents executed' },
    { key: 'disbursement', label: 'Disbursement completed', hint: 'Funds released' },
];

export const WORKFLOW_GROUP_KEYS = ['proposal', 'finalizing'] as const;
export type WorkflowGroup = (typeof WORKFLOW_GROUP_KEYS)[number];

export const WORKFLOW_GROUP_ITEMS: Record<WorkflowGroup, WorkflowItemDef[]> = {
    proposal: PROPOSAL_ITEMS,
    finalizing: FINALIZING_ITEMS,
};

// Fills missing hardcoded workflow items on a caseFile (legacy records).
// Mutates the document; the caller decides whether to save.
export const ensureWorkflowDefaults = (caseFile: ICaseFile): boolean => {
    let changed = false;
    if (!caseFile.workflow) {
        (caseFile as any).workflow = { proposal: [], finalizing: [] };
        changed = true;
    }
    for (const group of WORKFLOW_GROUP_KEYS) {
        const existing = (caseFile.workflow as any)[group] as any[] | undefined;
        if (!Array.isArray(existing)) {
            (caseFile.workflow as any)[group] = [];
            changed = true;
        }
        const byKey = new Map(
            ((caseFile.workflow as any)[group] as any[]).map((i) => [i.key, i])
        );
        for (const def of WORKFLOW_GROUP_ITEMS[group]) {
            if (!byKey.has(def.key)) {
                ((caseFile.workflow as any)[group] as any[]).push({
                    key: def.key,
                    done: false,
                    doneAt: null,
                    doneBy: null,
                });
                changed = true;
            }
        }
    }
    if (!Array.isArray(caseFile.clarifications)) {
        (caseFile as any).clarifications = [];
        changed = true;
    }
    return changed;
};

// ─────────────────────────────────────────────────────────────────────────────
// Progress computation (shared by API responses)
// ─────────────────────────────────────────────────────────────────────────────

export interface DocStatusLike {
    _id: any;
    name?: string;
    color?: string;
    isResolved?: boolean;
    isActive?: boolean;
    order?: number;
}

export interface CheckpointProgress {
    key: 'in_process' | 'proposal' | 'clarifications' | 'finalizing';
    label: string;
    done: number;
    total: number;
    percent: number;
    complete: boolean;
    // Clarifications only: the user explicitly confirmed none are needed.
    cleared?: boolean;
}

const pct = (done: number, total: number) =>
    total > 0 ? Math.round((done / total) * 100) : 0;

export const computeCheckpoints = (
    caseFile: ICaseFile,
    docStatusById: Map<string, DocStatusLike>
): CheckpointProgress[] => {
    // 1 — In Process: required documents resolved
    const requiredDocs = (caseFile.docs || []).filter(
        (d) => d.required !== false && !d.removedFromTemplate
    );
    const docsDone = requiredDocs.filter((d) => {
        const st = d.statusId ? docStatusById.get(String(d.statusId)) : null;
        return !!st?.isResolved;
    }).length;
    // No documents at all means the product/checklist hasn't been set yet —
    // keep the checkpoint open. A product with zero required docs is complete.
    const hasChecklist = (caseFile.docs || []).length > 0;
    const inProcessPercent = !hasChecklist
        ? 0
        : requiredDocs.length === 0
          ? 100
          : pct(docsDone, requiredDocs.length);

    // 2 — Proposal to Bank
    const proposal = (caseFile.workflow?.proposal || []) as any[];
    const proposalDone = proposal.filter((i) => i.done).length;

    // 3 — Clarifications: every note resolved. An empty checkpoint stays
    // open until someone explicitly confirms no clarifications are needed.
    const clarifications = (caseFile.clarifications || []) as any[];
    const clarifDone = clarifications.filter((c) => c.resolved).length;
    const clarificationsCleared = !!caseFile.clarificationsCleared;
    const clarificationsComplete =
        clarifications.length === 0
            ? clarificationsCleared
            : clarifDone === clarifications.length;
    const clarificationsPercent =
        clarifications.length === 0
            ? clarificationsCleared
                ? 100
                : 0
            : pct(clarifDone, clarifications.length);

    // 4 — Finalizing
    const finalizing = (caseFile.workflow?.finalizing || []) as any[];
    const finalizingDone = finalizing.filter((i) => i.done).length;

    return [
        {
            key: 'in_process',
            label: 'In Process',
            done: docsDone,
            total: requiredDocs.length,
            percent: inProcessPercent,
            complete: hasChecklist && docsDone === requiredDocs.length,
        },
        {
            key: 'proposal',
            label: 'Proposal to Bank',
            done: proposalDone,
            total: PROPOSAL_ITEMS.length,
            percent: pct(proposalDone, PROPOSAL_ITEMS.length),
            complete: proposalDone === PROPOSAL_ITEMS.length,
        },
        {
            key: 'clarifications',
            label: 'Clarifications',
            done: clarifDone,
            total: clarifications.length,
            percent: clarificationsPercent,
            complete: clarificationsComplete,
            cleared: clarificationsCleared,
        },
        {
            key: 'finalizing',
            label: 'Finalizing',
            done: finalizingDone,
            total: FINALIZING_ITEMS.length,
            percent: pct(finalizingDone, FINALIZING_ITEMS.length),
            complete: finalizingDone === FINALIZING_ITEMS.length,
        },
    ];
};

// The current checkpoint = first incomplete one. When everything is complete
// the lead is "ready to sanction".
export const currentStageOf = (checkpoints: CheckpointProgress[]): string => {
    const next = checkpoints.find((c) => !c.complete);
    return next ? next.key : 'ready';
};

export const overallPercentOf = (checkpoints: CheckpointProgress[]): number => {
    // Weight by item count so partial work inside a checkpoint shows up, while
    // an empty Clarifications checkpoint (0/0) doesn't inflate the score.
    const done = checkpoints.reduce((sum, c) => sum + c.done, 0);
    const total = checkpoints.reduce((sum, c) => sum + c.total, 0);
    if (total === 0) return 0;
    return Math.round((done / total) * 100);
};

// Serialize a caseFile for the API, applying workflow defaults and progress.
export const serializeCaseFile = (
    caseFile: any,
    docStatusById: Map<string, DocStatusLike>
) => {
    const plain = caseFile?.toObject ? caseFile.toObject() : caseFile;
    if (!plain) return plain;

    // Normalize workflow in the response even for legacy records.
    const workflow = plain.workflow || {};
    const normalizeGroup = (group: WorkflowGroup) => {
        const items = Array.isArray(workflow[group]) ? workflow[group] : [];
        const byKey = new Map(items.map((i: any) => [i.key, i]));
        return WORKFLOW_GROUP_ITEMS[group].map((def) => ({
            key: def.key,
            label: def.label,
            hint: def.hint,
            done: !!byKey.get(def.key)?.done,
            doneAt: byKey.get(def.key)?.doneAt || null,
            doneBy: byKey.get(def.key)?.doneBy || null,
        }));
    };

    plain.workflow = {
        proposal: normalizeGroup('proposal'),
        finalizing: normalizeGroup('finalizing'),
    };
    if (!Array.isArray(plain.clarifications)) plain.clarifications = [];
    plain.clarificationsCleared = !!plain.clarificationsCleared;

    const checkpoints = computeCheckpoints(plain, docStatusById);
    plain.checkpoints = checkpoints;
    plain.stage = plain.status === 'lost' ? 'lost' : plain.status === 'closed' ? 'sanctioned' : currentStageOf(checkpoints);
    plain.overallPercent = overallPercentOf(checkpoints);

    // Resolve each document's current status for one-click UI rendering.
    plain.docs = (plain.docs || []).map((d: any) => {
        const st = d.statusId ? docStatusById.get(String(d.statusId)) : null;
        return {
            ...d,
            status: st
                ? {
                      _id: st._id,
                      name: st.name,
                      color: st.color,
                      isResolved: !!st.isResolved,
                  }
                : null,
        };
    });

    return plain;
};

export const isObjectId = (v: any): boolean =>
    !!v && mongoose.isValidObjectId(String(v));
