# SealedBench — 2-minute demo video script

Shot-by-shot for the Sui Overflow 2026 (Walrus track) submission. Everything shown is
live on Sui testnet and verifiable by the viewer. Real IDs are baked in so you can
read them on screen.

Live site: **https://sealedbench.vercel.app** (or `http://localhost:3012` locally).

| Object | ID |
| --- | --- |
| Package | `0x9f6c9b056485a707d6bb8f6b5d810104cf1c44752899eef5378b5e12167bae4f` |
| Sealed benchmark (`SealedEval`) | `0x8a3852f8d57fd738d35589ca42f3f0a96e6d76b0ace49409efafe76943960222` |
| Registered enclave | `0x50570041a718078ef51044328a23f2d00fa637353cc92e233d94d959461f7a1e` |
| `AttestedScore` (27/50) | `0x4e563e5549e419cb213e97fb53e5b8701996b131b0187906f38f3fd7ecd3caff` |

---

### 0:00 – 0:15 · The hook (talking head or title card)
> "AI labs grade their own homework on tests the model may have already seen. Two
> separate lies — benchmark **contamination** and **dishonest scoring**. SealedBench
> closes both with cryptography, on Sui."

### 0:15 – 0:35 · The leaderboard (screen: home page)
- Land on the dossier home page. Pan the masthead: *CASE FILE · CLASSIFICATION: SEALED*.
- Point at the evidence register: **testnet · 1 sealed benchmark · 1 attested score**.
- Read the one ledger row: `oss/smollm2-135m-instruct-q2k` — **27 / 50**, with the
  green **"1 attested honest run ✓"** stamp.
> "One sealed benchmark. One model. One score — and every part of it is provable."

### 0:35 – 1:05 · Proof #1: the seal predates the model (no contamination)
- In the right rail, point at **Provenance**: *sealed … · cutoff …* with the green ✓.
- Click **Verify blob** on the Walrus card. Narrate while it hashes:
> "My browser is downloading the ciphertext from Walrus and recomputing its SHA-256."
- Land on **MATCH · N bytes**. Point at *on-chain* hash = *recomputed* hash.
> "That matches the fingerprint notarized on Sui — so this exact test set existed,
> sealed and never public, before the model's cutoff. It could not have trained on it."

### 1:05 – 1:30 · Proof #2: the score was produced honestly (attested TEE)
- Click the **score↗** link → Suiscan opens the `AttestedScore` object.
- Point at the `enclave_pk` field and the registered `Enclave` object — same key.
> "This score was signed inside an attested Nautilus enclave — the only party Seal
> will release the decryption key to. No best-of-50, no swapped model, no dropped
> questions."
- Back on the site, click **Verify trace** → **MATCH**.
> "And here's the full run trace — every prompt, response, and grade — archived to
> Walrus and hash-committed on-chain. Re-hashing it matches too."

### 1:30 – 1:50 · How it works (screen: "How it works" + Exhibit A/B)
- Scroll to the three steps: **Seal → Decrypt → Post**.
- Read Exhibit A (what the seal proves) and Exhibit B (what the TEE proves), including
  the honest "does **not** prove" lines.
> "We're precise about what's proven: timestamps and hashes for contamination,
> remote attestation for honesty. We don't overclaim."

### 1:50 – 2:00 · Close
> "Provably-uncontaminated *and* provably-honestly-scored evaluations — a conformity
> artifact for the EU AI Act, live on Sui testnet today, targeting mainnet. That's
> SealedBench."

---

**Recording tips**
- Hard-refresh once before recording so the entrance animations (`.rise`, stamp press)
  play cleanly.
- Do the two `Verify` clicks live — the on-the-fly hashing is the whole point; don't cut it.
- Keep Suiscan/Walrus links opening in new tabs visible — it shows nothing is faked.
