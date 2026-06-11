# Current testnet verification snapshot

Captured: 2026-06-11.

## Published package

- Package: `0x9f6c9b056485a707d6bb8f6b5d810104cf1c44752899eef5378b5e12167bae4f`
- Publish tx: `4LxxArqDNs5RmysvR7UyJB8EHDGPPnQEGKbEViNmQvLu`
- UpgradeCap: `0x7dc07b18cee10a051b23192bed99e31b333878ab0b7af3cc3417eac25100cb8c`
- Enclave Cap: `0x147c132bad4b40574e6717126309bd6e32d8f42b780c1dc925948876648a6017`
- Modules: `enclave`, `attestation`, `sealed_eval`, `attested_score`, `seal_policy`

Command:

```bash
pnpm publish:package
```

## Seed SealedEval

- SealedEval: `0x758aab4a1ecbb5dab258af6a42a9208562038df125df0fd667572c06e62a77c6`
- Create tx: `BPEnFv3iF7kyL6NVuFbu5AQ3xHScg61yGA3LadJBC9Sm`
- Walrus ciphertext: `T8KX29uMz18IWrYxgTAm9sfFrIgBCIJg5KDhG_6MLNQ`
- sha256 plaintext: `45da3c9554f9dfbf128e2de6416beb6b99703b718495041354669f899545701f`
- sha256 ciphertext: `afc028713ea6e79d1c3d9dd10903d4e5b6ed275a5a05a41325462796c42501f5`

Command:

```bash
pnpm tsx scripts/seal-and-notarize.ts --set fixtures/heldout/sealedbench-v1.jsonl --network testnet
```

## Provenance verification

Command:

```bash
pnpm tsx scripts/verify-provenance.ts
```

Result:

```text
ciphertext integrity:           MATCH
sealed_at_ms:  1781159241213 (2026-06-11T06:27:21.213Z)
cutoff_ts_ms:  1727740800000 (2024-10-01T00:00:00.000Z)
Provenance verified
```
