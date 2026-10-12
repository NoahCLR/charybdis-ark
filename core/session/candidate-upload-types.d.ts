import type {RequestConnection} from '../transport/types.js';
import type {CandidateBlobOptions, CandidateMetadata, CandidateMetadataInput, RequestIds} from '../protocol/types.js';
import type {CandidateBaseSource, CandidateProgress, CandidateStatus, CandidatePeer, CandidateDriverOptions} from './types.js';

export interface CoordinatorOptions extends CandidateDriverOptions {
    pollIntervalMs?: number;
    maxStatusPolls?: number;
    statusStallTimeoutMs?: number;
    maxBusyResubmissions?: number;
    requestTimeoutMs?: number;
    now?: () => number;
    transactionIds?: RequestIds;
    transactionIdStart?: number;
    requestIdStart?: number;
}
export interface UploadOptions extends Partial<CandidateBlobOptions> {
    metadata?: CandidateMetadataInput;
    baseSource?: CandidateBaseSource;
    streamChunks?: boolean;
    transactionId?: number;
    verifyBase?: () => Promise<void>;
    onProgress?: (progress: CandidateProgress) => void;
}
/** Authored uploads either provide metadata or the identity needed to derive it. */
export type UploadCallOptions = UploadOptions & ({metadata: CandidateMetadataInput} | CandidateBlobOptions);
export interface CommitDecision {transactionId: number; digest: number; status: CandidateStatus}
export interface CommitOptions {onProgress?: (progress: CandidateProgress) => void; digest?: number; afterDecision?: (decision: CommitDecision) => Promise<void>}
export interface UploadContext {
    abortNeeded: boolean;
    afterDecision?: CommitOptions['afterDecision'];
    blob?: Buffer;
    bytesSent: number;
    bytesUploaded: number;
    bytesReused: number;
    chunkCount: number;
    chunkIndex: number;
    chunksAdmitted: number;
    metadata?: CandidateMetadata;
    decisionHandled: boolean;
    onProgress?: (progress: CandidateProgress) => void;
    operation: number;
    phase: string;
    status?: CandidateStatus;
    totalBytes: number;
    transactionId?: number;
    expectedDigest?: number;
    peer?: CandidatePeer;
    peerUnsupported?: boolean;
}
export type OperationContext = UploadContext & {transactionId: number; status: CandidateStatus};
export type CommitContext = OperationContext & {expectedDigest: number};
export type TransferContext = OperationContext & {blob: Buffer; metadata: CandidateMetadata};
export interface MutationDetails {metadata?: CandidateMetadata; offset?: number; length?: number}
export interface StatusBudget {configuredTimeoutMs?: number; deadline: number; fingerprint: string; maxPolls?: number; payloadLength: number; polls: number; timeoutMs: number}
export interface FailureDetails {
    phase?: string;
    transactionId?: number;
    operation?: number;
    progress?: CandidateProgress;
    status?: CandidateStatus;
    deviceError?: Partial<CandidateStatus['error']> & {frameOffset?: number};
    ambiguous?: boolean;
    safeToRetry?: boolean;
    abortAttempted?: boolean;
    abortSucceeded?: boolean;
    cause?: unknown;
}
export type Connection = RequestConnection;
