# Current testnet verification snapshot

Captured: 2026-06-18.

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

- SealedEval: `0xc03afb12f03da17ce90ef334b740e3bde5e80995606f7558da2c629fb97d6474`
- Create tx: `D6XEKsnLderoCpJyF21RgAYbsbdY85LSQwyMETWAXsqd`
- Walrus ciphertext: `0qirQS37ujigOoWCNzSuM97IseB-OtDt1XR2StJNNto`
- sha256 plaintext: `45da3c9554f9dfbf128e2de6416beb6b99703b718495041354669f899545701f`
- sha256 ciphertext: `adebb4a23e0ae2ac8cbd1149f23223eb167c9ebea67475681630208b5a6694ab`

Command:

```bash
pnpm tsx scripts/seal-and-notarize.ts --network testnet --model demo/clean-open-model-2024-10 --cutoff 1727740800000
```

## Provenance verification

Command:

```bash
pnpm tsx scripts/verify-provenance.ts
```

Result:

```text
ciphertext integrity:           MATCH
sealed_at_ms:  1781785150246 (2026-06-18T12:19:10.246Z)
cutoff_ts_ms:  1727740800000 (2024-10-01T00:00:00.000Z)
sealed AFTER the model cutoff — model cutoff predates the seal
Provenance verified
```
