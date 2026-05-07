# Skalor Protocol — Positioning

## One-line thesis

**Skalor is the open reputation, enforcement, and risk layer for the agent commerce ecosystem. ACK-ID handles who an agent is. ACK-Pay handles how it pays. Skalor handles whether it should be trusted to spend, and stops it on-chain when it shouldn't.**

## The problem in Sean Neville's words

From his May 2026 interview on Reid Hoffman's *Possible* podcast:

> "There isn't sort of DNS of agents to just resolve to like discover agents out there... How do I know that it's Amazon that my agent is talking to? It's a fundamental identity issue mapped back to an institution that I want to have some trust in."

> "Guardrails without policy enforcement is it's just that they just become suggestions... If I'm moving a million dollars it either needs to move or it needs to not move."

> "We can program money [on blockchains]. You can write contracts that have rules in them that AI can't possibly circumvent."

> "If a merchant tricks my agent into buying something, who's liable? The merchant wants to know this, the consumer wants to know this. And these are questions that are answered in, say, the Visa world... and they're not answered yet in agent commerce."

> "Hopefully the solution is not a proprietary vendor solution but something that is more of a de facto or formal standard."

Sean is the highest-credibility voice in the stablecoin space (Circle co-founder, USDC architect). He named six primitives the agent economy is missing. Catena's ACK ships the first two (identity + payments). The other four — deterministic on-chain enforcement, reputation, liability framework, open standard — are exactly what `skalor-protocol` ships.

## How we relate to ACK

ACK has two protocols:

- **ACK-ID** — `did:web` agent identity + W3C Verifiable Credentials, including a `ControllerCredential` linking agent DID to operator DID. JWT-based A2A handshake with nonce.
- **ACK-Pay** — HTTP 402 with signed JWT payment requests + Verifiable Credential receipts. Rail-agnostic.

Catena's own README lists these as **future extensions, not currently in spec**:

- Agent discovery via registries
- **Reputation scoring**
- Refund management
- Outcome-based pricing

That gap is the opening Skalor fills. Concretely:

| Concern | ACK | Skalor |
|---|---|---|
| Identity | ACK-ID (`did:web` + VCs) | wraps; KYA score is keyed by DID |
| Payment messaging | ACK-Pay (402 + JWT) | wraps; SDK speaks 402 protocol |
| Settlement rails | Rail-agnostic | three rails: USDC on Base, Tempo (PathUSD), Canton (Daml) |
| Reputation | None | KYA Bureau (Phases A–D, inc. stake-backed slashing) |
| Behavioral anomaly | None | Gate 6 — Phase 1 statistical + Phase 2 ML logistic |
| Sanctions | None | Gate 1.5 OFAC SDN screening |
| Liability framework | None | Ed25519 signed receipts encoding initiator → authorizer → mandate snapshot → gate results → counterparty credentials → chain of custody |
| On-chain enforcement | None | `Mandate.sol` — programmable per-agent spending guard |

We do not fork ACK. We do not compete with ACK. We adopt ACK as the identity + payment messaging layer and add the four primitives Catena explicitly leaves out.

## Four design principles

1. **Compliance-first.** Risk and compliance are the fourth stakeholder at the table, in lockstep with sales / product / engineering — not bolted on after launch. Every primitive is built to satisfy a regulator audit before a developer demo.
2. **Open standard, not vendor lock.** The KYA Bureau spec is published as an open RFC. Anyone can implement it. Skalor is the reference implementation, not the only one. Same posture Catena took with ACK.
3. **Permissionless by default for developers.** Devs onboard via wallet signature, no email, no dashboard required. Agents register themselves via SDK and start building reputation from transaction zero. Compliance (KYC/KYB) is on the *operator*, not on the *developer*.
4. **Deterministic on-chain enforcement, ML overlay off-chain.** The chain is canonical truth — `Mandate.sol` cannot be circumvented. The seven Skalor gates run as advisory ML overlay (anomaly detection, OFAC screening, HITL routing) and can pause the Mandate via the controller, but cannot override its rules. This is exactly the two-layer architecture Sean Neville described.

## What we ship in v0.1

This repo. `Mandate.sol` + `MandateFactory.sol` + the test suite. Per-agent USDC vault on Base, with all four enforcement primitives Sean specifically named: per-transaction limit, daily budget, vendor allowlist, kill switch.

## 90-day roadmap

### Weeks 1–2: Mandate on Base mainnet + SDK adapter
- Deploy Mandate factory to Base Sepolia, then mainnet
- TypeScript SDK helper (`@skalor/protocol`) wrapping deploy + spend + verify
- `viem`-based; integrates with the existing `@skalor/sdk`
- E2E demo: agent attempts $10k tx with $100/day mandate → reverts on-chain → shown in Skalor dashboard

### Weeks 3–4: KYA Bureau SBT anchor + open spec v0.1
- Soulbound token contract — every bureau-public agent gets an SBT carrying tier + score
- Ed25519 signed JSON receipt remains the rich payload; the SBT is the integrity anchor
- Publish `docs/spec/kya-bureau-v0.1.md` with JSON-LD context, OpenAPI definition, reference implementation pointers

### Weeks 5–6: Liability schema in receipts + ACK-Pay integration
- Extend the Skalor Ed25519 receipt format with structured liability fields (initiator, authorizer, mandate snapshot, gate results, counterparty credentials, chain of custody)
- Implement ACK-Pay 402 paywall handling in the Skalor proxy and SDK
- Skalor agents can transact via ACK-Pay against any ACK-compatible counterparty
- Catena (or any ACK implementer) can pull KYA scores via the open Bureau API

### Weeks 7–10: Phase D real stake migration
- Migrate `agent_stakes` from demo mode (`is_demo=TRUE`) to live USDC escrow on Base
- On-chain slash via smart contract triggered by Gate 6 critical, OFAC match, or operator true-positive label
- Public stake summary view: anyone can verify a given agent's bonded reputation
- Kicks the bureau from "fraud detection" into "venture-scale moat"

### Weeks 11–12: Federation pilots
- Federate KYA Bureau with Catena (cross-implementation lookups)
- Federate with Anchorage Agentic Banking
- Cross-implementer interoperability via the open spec

## Why this matters to Catena, Anchorage, and a16z

**For Catena Labs:** `skalor-protocol` is the layer they explicitly listed as a future ACK extension. Sean's interview lays out the architecture; we ship it. The natural partnership: Skalor is the first non-Catena reference implementation of ACK-ID + ACK-Pay, plus the open reputation layer that Catena's own platform can consume.

**For Anchorage Digital:** Their "Agentic Banking" product needs identity, policy enforcement, and settlement across crypto + fiat rails. KYA appears on their published RFS. Skalor is the open layer that Anchorage can plug into without building it from scratch — and that any of Anchorage's regulated competitors (Catena, Bridge, Mercury) can plug into the same way. Network effects accrue to the bureau, not to any individual bank.

**For a16z:** This is venture-scale because the protocol layer is winner-take-most. There will be many regulated agent-native banks (Catena, Anchorage, Bridge, Stripe Crypto, Mercury, etc). There is one Visa, one Plaid, one Stripe, one TLS. The KYA Bureau as a public, stake-backed, cross-org reputation rail — *the credit bureau of the agent economy* — is that protocol-layer prize.

## What's deliberately not in scope

- We are not a custodian. Mandates hold USDC; a regulated entity backs the agent's funding.
- We are not a wallet provider. BYO wallet (any Base address, any viem-compatible signer).
- We are not a regulated financial institution. Catena and Anchorage are. We are the rails between them.
- We do not compete with ACK. We extend it.
- We do not promise privacy guarantees in v0.1. ZK score proofs and Travel Rule support land in Phase 2.
