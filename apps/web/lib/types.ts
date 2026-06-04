export type SealedEval = {
  objectId: string;
  author: string;
  sha256Plaintext: string;
  sha256Ciphertext: string;
  walrusBlobId: string;
  modelTarget: string;
  setSize: number;
  cutoffTsMs: number;
  sealedAtMs: number;
  sealPolicyId: string;
};

export type AttestedScore = {
  objectId: string;
  sealedEvalId: string;
  modelTarget: string;
  scoreNum: number;
  scoreDen: number;
  itemsHash: string;
  traceBlobId: string;
  enclavePk: string;
  postedAtMs: number;
};

export type LeaderboardRow = {
  eval: SealedEval;
  scores: AttestedScore[];
};
