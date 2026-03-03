export type MigrationMulticallCall = {
  target: `0x${string}`;
  allowFailure: boolean;
  callData: `0x${string}`;
};

export type MigrationRelayerRequest = {
  txId: number;
  chainId: number;
  to: `0x${string}`;
  callData: `0x${string}`;
  calls: MigrationMulticallCall[];
}[];

export interface MigrationRelayerResponse {
  failed: string[];
  success: string[];
}

export interface MigrationRelayerCallInput {
  payloads: MigrationRelayerRequest;
  endpoint: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}
