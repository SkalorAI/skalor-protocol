# skalor-protocol

The on-chain rails for the Skalor agent-economy stack: programmable spending mandates, KYA Bureau attestations, and reputation primitives that any AI agent or regulated counterparty can verify — without trusting Skalor.

## What this repo is

Open, neutral, on-chain primitives that complement Catena Labs' [Agent Commerce Kit](https://github.com/agentcommercekit/ack) (ACK). ACK defines who the agent is (ACK-ID) and how it pays (ACK-Pay). `skalor-protocol` adds the layer ACK explicitly leaves out: **whether the agent should be trusted to spend, and stops it on-chain when it shouldn't.**

See [`docs/POSITIONING.md`](./docs/POSITIONING.md) for the full strategic thesis.

## What's in v0.1

| Contract | Purpose |
|---|---|
| `Mandate.sol` | Per-agent on-chain spending guard. Holds USDC. Enforces per-tx limit, daily limit, counterparty allowlist, and kill-switch — at the chain level. |
| `MandateFactory.sol` | Factory pattern. One Mandate per agent, deployed via `deployMandate(...)`. Emits a discoverable `MandateDeployed` event. |
| `test/TestERC20.sol` | 6-decimal mock for tests. |

The seven Skalor fiduciary gates (kill switch, OFAC, vendor allowlist, per-tx limit, daily budget, HITL, behavioral anomaly) live in the off-chain Skalor backend and run as advisory ML overlay. The Mandate is canonical truth: even if Skalor's backend is offline or compromised, the chain still enforces the deterministic rules. This is the layer Sean Neville named as missing in his Reid Hoffman interview — *"guardrails without policy enforcement just become suggestions."*

## Quickstart

```bash
git clone https://github.com/SkalorAI/skalor-protocol.git
cd skalor-protocol
npm install
npx hardhat compile
npx hardhat test
```

## Deploy to Base Sepolia

```bash
export DEPLOYER_PRIVATE_KEY=0x...
export BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
npx hardhat run scripts/deploy.js --network baseSepolia   # script tba
```

## Architecture in one diagram

```
   ┌──────────────────────────────────────────────────────────────┐
   │  ACK-ID (Catena)                                             │
   │  did:web identity + ControllerCredential VC                  │
   │  "who is this agent? who is its operator?"                   │
   └──────────────────────────────────────────────────────────────┘
                               ↓
   ┌──────────────────────────────────────────────────────────────┐
   │  Skalor KYA Bureau   (off-chain, signed Ed25519, plus SBT)   │
   │  Reputation, behavioral anomaly score, OFAC, HITL, slash     │
   │  "should this agent be trusted to spend?"                    │
   └──────────────────────────────────────────────────────────────┘
                               ↓
   ┌──────────────────────────────────────────────────────────────┐
   │  skalor-protocol Mandate.sol  (this repo, on-chain)          │
   │  per-tx + daily limits, vendor allowlist, kill switch        │
   │  "stop the agent on-chain when it shouldn't"                 │
   └──────────────────────────────────────────────────────────────┘
                               ↓
   ┌──────────────────────────────────────────────────────────────┐
   │  ACK-Pay (Catena)                                            │
   │  402 paywall + signed PaymentReceiptCredential               │
   │  "settle the payment, issue the receipt"                     │
   └──────────────────────────────────────────────────────────────┘
```

## Status

- [x] Mandate.sol v0.1 (per-tx, daily, allowlist, pause, withdraw)
- [x] MandateFactory.sol
- [x] Test suite (Hardhat / ethers v6)
- [x] Compiles cleanly under solc 0.8.24
- [ ] Deploy script for Base Sepolia
- [ ] TypeScript SDK adapter (`@skalor/protocol`)
- [ ] KYA Bureau SBT contract (soulbound reputation anchor)
- [ ] ACK-Pay 402 paywall integration helper
- [ ] Open KYA Bureau spec (RFC + JSON-LD context)
- [ ] Phase D real-stake migration (USDC escrow + on-chain slash)

## Repo conventions

- Solidity 0.8.24, optimizer on (200 runs)
- OpenZeppelin Contracts v5 for ERC20 / SafeERC20
- Hardhat 2.28+ with the `hardhat-toolbox` (ethers v6, chai, network-helpers)
- `UNLICENSED` SPDX header on all contracts pending license decision; do not redistribute

## Related

- Skalor main repo (off-chain stack): https://github.com/josephthompson101/skalor
- Catena Labs Agent Commerce Kit: https://github.com/agentcommercekit/ack
- Skalor landing: https://skalor.xyz
