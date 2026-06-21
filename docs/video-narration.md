# SealedBench — narration script (read-aloud, ~2:00)

Word-for-word for recording against **https://sealedbench.vercel.app**.
`[brackets]` = what to do on screen. Plain text = what you say.
Pace ~150 wpm. Pause where it says *(pause)* — that's the hash computing on camera; let it land.

---

**[0:00 — title card "SealedBench" or talking head]**

Every AI lab brags about benchmark scores. But a score only means something if the
model never saw the answers — and if nobody fudged the grading. Today, both are broken.
Test sets leak into training data, so models memorize instead of reason. And labs grade
their own homework — run it fifty times, report the best. **SealedBench closes both, with
cryptography, on Sui.**

**[0:22 — screen: the live leaderboard]**

This is a leaderboard where every score is provable. Here's a real one: an open model,
scored **27 out of 50**, on a benchmark that was sealed before the model could have
trained on it. Let me prove that to you — live, in my own browser.

**[0:40 — click "Verify blob"]**

The test set is encrypted with **Seal** and stored on **Walrus**. I'm fetching that
ciphertext right now and recomputing its hash… *(pause)* …and it **matches** the
fingerprint notarized on Sui. So this exact set was sealed on-chain, before the model's
cutoff, and never released in the clear. No contamination — and you didn't have to trust
me to know it.

**[1:02 — click the score → Suiscan, point at the enclave signer; then "Verify trace"]**

Now — was it scored honestly? This score was signed **inside an attested Nautilus
enclave**. And Seal only ever releases the decryption key to that one registered enclave,
enforced by an on-chain policy. No human ever touched the answers. Here's the full run
trace — every prompt and every grade — archived to Walrus. I re-hash it… *(pause)* …
**match.** The whole evaluation is reproducible and tamper-evident.

**[1:30 — scroll to "Why it matters"]**

Why does this matter? Contamination isn't hypothetical — in 2025 a major lab publicly
stopped trusting a popular benchmark over exactly this. And from August 2026, the **EU AI
Act** requires providers to document model evaluations, with real fines. SealedBench
produces precisely that: a third-party-verifiable evaluation record.

**[1:50 — close, back on the masthead]**

Seal for custody. A TEE for honesty. Walrus and Sui for permanence. Provably
uncontaminated, provably honestly scored — **live on testnet today, built for mainnet.**
That's SealedBench.

---

### Delivery notes
- **Hard-refresh** right before you start so the stamp/entrance animations play.
- Do the two **Verify** clicks live — the on-the-fly hashing is the whole proof; don't cut it.
- If a verify is slow, fill with: *"…hashing the real bytes, no server in the loop…"*
- Keep the Suiscan tab cutaway short — just enough to show `enclave_pk` matches the registered enclave.
- Tone: calm and certain. You're showing receipts, not selling.

### 30-second elevator cut (if they ask for a teaser)
> "Benchmark scores are unverifiable — test sets leak, and labs grade themselves.
> SealedBench seals the test set with Seal before the model exists, and scores it inside
> an attested enclave that's the only thing Seal will hand the key to. The result is a
> leaderboard where every score is provably uncontaminated and provably honest — and you
> can re-check it yourself against Sui and Walrus. Live on testnet, built for mainnet."
