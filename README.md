# SealedBench

**A sealed-exam vault for AI benchmarks. Provably-uncontaminated *and* provably-honestly-scored model evaluations, on one leaderboard.**

Sui Overflow 2026 · Walrus track (~$70k) · Built on Walrus + Seal + Nautilus, targeting **mainnet**.

---

## The problem (the plain version)

AI labs brag about benchmark scores. But a benchmark only means something if the model has never seen the answers. The moment a test set leaks onto the public internet — into a scrape, a GitHub repo, a Hugging Face dataset — the next model trains on it and just *memorizes* the answers. The score stops measuring reasoning and starts measuring recall. This is **benchmark contamination**, and it is not theoretical: in 2025 OpenAI publicly stopped trusting a popular benchmark over exactly this concern. Once a test is contaminated, every score on it is, to some degree, a lie — and there is no clean way to tell a clean score from a contaminated one after the fact.

There is a second, separate lie: **dishonest scoring**. Even on a clean test set, a lab grades its own homework. Did they run the model once, or run it 50 times and report the best? Did they evaluate the model they shipped, or a beefier internal variant? Did they quietly drop the questions it failed? The reported number is whatever the lab says it is. Nobody can re-run it under the same conditions and check.

SealedBench fixes both, with two cryptographic guarantees that compose into one number you can actually trust.

## What SealedBench is

A **locked exam vault** for held-out benchmark test sets.

1. **Seal before it exists.** A benchmark author encrypts a held-out test set with **Seal**, stores the ciphertext on **Walrus**, and timestamps its SHA-256 fingerprint on **Sui** in a `SealedEval` object — *before* a given model's training-data cutoff. The set never touches the public internet in plaintext. Later, anyone can verify the chain: *this exact test set was sealed and notarized on-chain on date D, which is before model M's cutoff C — therefore M could not have trained on it.* That is the **uncontaminated** proof, and it is a property of timestamps and hashes, no trust required.

2. **Score inside a sealed box.** When it's time to evaluate, the *only* party Seal will ever release the decryption key to is an **attested Nautilus TEE enclave**. The enclave decrypts the test set **in-memory, inside the secure enclave**, runs the exact target model through an OpenAI-compatible endpoint, scores every question with no human in the loop, and posts a **cryptographically-signed honest score** on-chain — with the full run trace (every prompt, every model response, every grade) archived to Walrus for audit. No cherry-picking best-of-50. No swapping in a stronger model. No silently dropping the failures. That is the **honestly-scored** proof, and it is a property of remote attestation.

Net result: a leaderboard where every row is a model's score on a benchmark that was **provably sealed before the model existed** and **provably scored honestly by a machine nobody could tamper with**. Two independent lies, both closed.

## The killer demo

One screen. Two models. Same sealed benchmark.

- **Model A** has a training cutoff *after* the benchmark's public release — it is plausibly contaminated. Its self-reported public score is high.
- **Model B** is an open model with a publicly-dated checkpoint whose cutoff is *before* SealedBench sealed the held-out twin of that benchmark — it provably could not have memorized it.

Run both through the attested enclave on the sealed set. Model A's score **collapses** versus its public number (it was riding on memorization). Model B's holds. And next to each row: the Sui object showing the seal-before-cutoff timestamp, the Walrus blob id of the run trace, and the enclave attestation proving the run was honest. You can *see* contamination get caught, and you can *verify* nobody fudged the catching.

## Why this is novel (and not the prior art)

SealedBench reuses the same primitives as two strong projects, and is none of them:

- **TOLDPROOF** ([toldproof.xyz](https://toldproof.xyz), [github.com/BadGenius22/toldproof](https://github.com/BadGenius22/toldproof)) — a polished, audited Sui Overflow 2026 **Walrus-track** project. It seals **natural-language predictions/forecasts** ("BTC > $150k in 2026") with Seal + Walrus + on-chain SHA-256 timestamp, and resolves them with an off-chain **AI judge** leaderboard. It is excellent, and it is about *forecasting calibration*. It has **no TEE** — its scoring is an off-chain agent you trust. SealedBench seals **held-out benchmark test sets for model evaluation**, not predictions, and its scoring runs **inside an attested enclave**, not on a trusted server.

- **Walmarket** ([walmarket.fun](https://www.walmarket.fun/), Walrus Haulout 2025) — a **Nautilus-TEE** verifiable AI oracle that resolves **prediction-market outcomes** by running AI inference in an enclave with evidence on Walrus. Also excellent, and it is about *resolving markets*. SealedBench uses an enclave too, but for **custody and honest scoring of model-evaluation test sets** — a different artifact (a sealed exam, not a market), a different claim (uncontaminated + honest eval, not oracle truth), and a different buyer.

**SealedBench's distinct niche = TEE-attested custody + honest scoring of held-out benchmark test sets for model evaluation.** Neither competitor does this. The combination — *seal-before-cutoff provenance* (closes contamination) **plus** *attested in-enclave scoring* (closes dishonest grading) — applied to **AI benchmarks** is, to our knowledge, unbuilt.

## Who buys this

- **AI labs** that want a benchmark number the market will actually believe — a third-party-verifiable score beats a self-reported one in every press cycle.
- **EU AI Act conformity.** The Act is **fully applicable 2 August 2026**, and from that date the Commission can **enforce GPAI obligations with fines up to 3% of worldwide annual turnover (or €15M, whichever is higher)**. Providers of GPAI models with systemic risk must conduct and **document model evaluations**. SealedBench produces exactly that: a tamper-evident, independently-verifiable evaluation record with cryptographic provenance — a conformity artifact, not a slide.
- **Benchmark authors / academia** who want their held-out sets to stay held-out and to be cited as the canonical clean version.

## What's actually built (honest scope)

Built from scratch for the **21 June 2026 PT** deadline. As of submission everything below is **live on Sui testnet** and independently verifiable — not a roadmap:

- **Phase 1 — sealed provenance (done).** `SealedEval` Move objects: a real held-out set Seal-encrypted to Walrus, with its SHA-256 fingerprint and cutoff timestamp notarized on Sui. Anyone can re-hash the Walrus ciphertext in their own browser and check it against the chain — the leaderboard does exactly that, live.
- **Phase 2 — the moat: attested in-enclave scoring (done).** A Rust **Nautilus TEE** enclave, registered on-chain with measured PCRs, is the *only* party Seal releases the decryption key to. It decrypts the set in-memory, scores the target through an OpenAI-compatible endpoint, archives the full run trace to Walrus, and posts an enclave-**signed** `AttestedScore` on Sui. A genuine attested run is live on testnet — `oss/smollm2-135m-instruct-q2k`, **27/50**, signed by the registered enclave (the signer key matches the on-chain `Enclave` object — verify it yourself).
- **Phase 3 — verifiable leaderboard (done).** Next.js 16 / React 19 reading live Sui events: per-eval seal-before-cutoff provenance, in-browser Walrus ciphertext **and** run-trace re-hashing, and the attested score with its signer.
- **Phase 4 — mainnet (next).** Walrus, Seal, and Nautilus are all mainnet-live; ~50% of judging is real-world impact and **half the prize unlocks on mainnet**, which is the cutover target.

The scorer is a **real, baked, PCR-measured open model** (SmolLM2-135M) running inside the enclave — there is no keyless or external grader. The two-model "contamination collapse" headline is the next sealed pair; the infrastructure that makes such a comparison *trustworthy* is what is built and proven here.

## Precisely what is and isn't proven

We refuse to overclaim. To be exact:

- **The seal proves** a specific test set (by SHA-256) was committed on-chain at a specific time, before a stated cutoff. It does **not** prove the *content* is a good benchmark, nor that the author didn't also keep a private copy they trained on themselves — it proves *that ciphertext* predates the cutoff and was never released in plaintext.
- **The TEE proves** the posted score was produced by the exact attested code, on the exact decrypted set, against the exact model endpoint, with no human cherry-picking — i.e. the *run was honest*. It does **not** prove the model endpoint served weights identical to a public release (that's a separate, out-of-scope provenance problem we name explicitly).
- The **cold-start mitigation** that makes "couldn't have trained on it" *literally true* for the demo: SealedBench seeds with **one self-authored held-out set**, evaluated against an **open model with a publicly-dated checkpoint** whose cutoff predates the seal. For that pair, the contamination claim is not "plausible" — it's provable.

Stack: Sui Move 2024 · `@mysten/sui` + dapp-kit · Seal SDK · Walrus · a Rust Nautilus enclave (reused & adapted from the author's audited Aegis co-signer) · Next.js 16 + React 19 + Tailwind v4 · Python evaluator client. Full executable plan in [`BUILD_PLAN.md`](./BUILD_PLAN.md).
