# Autonomous Business NFT

**An NFT on NEAR that owns and runs its own business.**
Whoever holds the NFT owns the business: its treasury, its profits, and the right to pause it, reconfigure it or sell it.

Built for **NEAR HACKATHON: Build Beyond Boundaries (Nov 2026)**.
Tracks: **Autonomous Business**, **Agent Economy**, **NFTs That Do Something**.

| | |
|---|---|
| Live app (testnet) | https://autonomous-business-nft-frontend.vercel.app/ |
| Owner dashboard | https://autonomous-business-nft-frontend.vercel.app/dashboard.html |
| Customer order page | `…/dashboard.html#/order/<business account>` (example in the quickstart below) |
| NFT contract (testnet) | `buildingfromthetop.testnet` |
| Demo post on X | <!-- PASTE LINK TO YOUR X POST --> |

> **Everything runs on NEAR Testnet. Transactions have no real value.** This is an unaudited prototype.

---

## The problem

Most NFTs are pictures. Most AI agents need constant babysitting and powerful keys that can be misused. There is no clean way to give an AI agent its own on-chain business that a human can **own, transfer or sell**, while keeping the agent's permissions narrow and the money safe.

## What it does

1. **Mint** an NFT. It is the ownership certificate of a business.
2. **Activate** it. The NFT contract creates a dedicated sub-account `business-<id>.<contract>`, funds it, deploys a **treasury contract** onto it, and registers a **restricted function-call key** for the agent.
3. **Customers pay into escrow** through the treasury contract. The agent delivers the work and completes the job on-chain.
4. **The contract splits the revenue** between the owner and the treasury (for example 60% owner / 40% reinvested). The owner can only claim their share.
5. **The NFT holder stays in control**: claim, change the price, split and spending limits, pause or resume, or **sell the NFT**. On a sale the seller's agent key is revoked and the business is paused until the buyer sets a new key.

```
 Customer ── pays ──► business-N treasury (escrow) ◄── Agent (restricted key: complete_job, spend, heartbeat)
                              │ complete_job → owner / reinvest split enforced on-chain
 NFT holder ── claim ─────────┘
 NFT contract ── creates business-N, checks ownership, revokes the agent key on transfer
```

---

## Status (honest)

Legend: ✅ verified on testnet · 🟡 implemented in code, end-to-end verification in progress · ⛔ not built

| Feature | Status |
|---|---|
| Mint NFT (NEP-171) with metadata | ✅ |
| Owner dashboard with wallet connection (NEAR Connect) | ✅ |
| Activation: contract creates the business sub-account, funds it, deploys the treasury | ✅ |
| Restricted function-call key issued to the agent at activation | ✅ |
| Owner-only **Claim** (treasury checks NFT ownership through the NFT contract) | ✅ |
| `nft_transfer` that moves control of the business | 🟡 |
| Treasury v2: escrowed customer orders, job delivery, **enforced profit split** | 🟡 |
| Strict agent method list (`complete_job`, `spend`, `heartbeat` only) | 🟡 |
| Spending limits (allowed payees, per-payment cap, daily cap) | 🟡 |
| Pause / resume, capital withdrawal while paused | 🟡 |
| Agent key revoked and business paused when the NFT is sold | 🟡 |
| Agent worker that earns (scheduled GitHub Action) | 🟡 |
| Real agent status from an on-chain heartbeat | 🟡 |
| Agent Market directory registration script | 🟡 |
| TEE-based always-on agent runtime (IronClaw / NEAR AI Cloud) | ⛔ |
| Priced service listing and bidding on Agent Market jobs | ⛔ |
| Fractional ownership, policy engine, Chain Signatures, Intents payments | ⛔ |

Businesses created before treasury v2 show "Treasury v1" in the dashboard. They keep working for claiming but have none of the v2 features. Mint a new business to use them.

---

## Judges quickstart: do X, see Y

You need a NEAR **testnet** wallet (for example Meteor or Intear) with a few testnet NEAR from any NEAR testnet faucet. Activation needs about 1.5 to 3 testnet NEAR because it stores the treasury contract on the new account.

| # | Do this | You should see |
|---|---|---|
| 1 | Open the live app. | A "Mint Autonomous Business NFT" page with a Testnet label. |
| 2 | Press **Connect Wallet** and approve in your testnet wallet. | Your account appears in the header and the **Mint Now** button is enabled. |
| 3 | Enter a business name and press **Mint Now**, then approve. | A success message and a **Go to My Dashboard** button. |
| 4 | Open the dashboard and connect the same wallet. | Your new business listed as **Pending activation**. |
| 5 | Press **Activate business** and approve (about 1.5 to 3 testnet NEAR). | An **agent key** box (copy it), then status **Active**. The account `business-<id>.buildingfromthetop.testnet` exists on the explorer. |
| 6 | Open the business **Overview**. | Treasury balance, owner/reinvest split, and an **Agent status** card. |
| 7 | Open the demo order page `…/dashboard.html#/order/<demo business>` (see "Live demo business") and order a report. | Your payment sits in escrow as a pending job. Within about 10 minutes the status changes to **Delivered** with the report text. |
| 8 | As the business owner, open **Overview** again. | Jobs done +1 and **Available profits** equal to the owner share of the payment. |
| 9 | Press **Claim to wallet** and approve. | The owner share arrives in your wallet. The treasury keeps the reinvested part. |
| 10 | In **Configuration**, press **Pause business**. | The status changes to Paused and the order page stops accepting orders. |
| 11 | (Optional) Transfer the NFT with `nft_transfer` (attach 1 yoctoNEAR). | The business is paused and the previous agent key no longer works. The new owner sees the business in their dashboard. |

Steps marked 🟡 in the status table (7 to 11) depend on treasury v2 and the agent worker.

### Live demo business

A pre-activated business with a running agent is provided so judges can try steps 7 to 10 without running the worker themselves.

- Business account: <!-- FILL IN, e.g. business-NN.buildingfromthetop.testnet -->
- Order page: <!-- FILL IN: https://autonomous-business-nft-frontend.vercel.app/dashboard.html#/order/business-NN.buildingfromthetop.testnet -->

The agent runs as a scheduled worker, so a delivery can take up to about 10 minutes.

---

## NEAR tools used

| Tool | How it is used |
|---|---|
| NEAR Protocol testnet | All contracts and transactions |
| NEAR sub-accounts | One dedicated `business-<id>` account per NFT |
| Function-call access keys | The agent's restricted key with a fixed method list and a gas allowance |
| NEP-171 (NFT standard) | Ownership, mint and transfer events |
| `near-sdk-js` | The NFT / factory contract (`contracts/business-nft-ts`) |
| `near-sdk` (Rust) v5 | The treasury contract deployed onto every business account (`contracts/treasury`) |
| NEAR Connect (`@hot-labs/near-connect`) | Wallet connection and signing in the frontend |
| `near-api-js` v6 | Deploy and upload scripts, and the agent worker |
| NEAR AI Cloud (optional) | AI-written summary in the agent's report when `NEARAI_API_KEY` is set |
| NEAR Agent Market | Directory registration script (`scripts/list-on-market.mjs`) |
| OutLayer | A custody key is registered at activation and can be balance-checked in the dashboard. The agent does **not** yet run on it. |

## Libraries and services

`tweetnacl` (agent key generation in the browser), esm.sh CDN, CoinGecko public price API (report data), Vercel (hosting), GitHub Actions (builds and the agent schedule).

## Disclosures

- **Built for this hackathon.** The code in this repository was written for NEAR HACKATHON 2026. The earlier history of the repository is the prototype of this same project.
- **AI-assisted code.** Large parts of the contracts, frontend, scripts and documentation were written with AI coding assistants (including Claude) and reviewed and tested by the author on testnet.
- **No other chains.** Everything runs on NEAR.
- **Unaudited.** Do not use with real funds. `near-sdk-js` is an alpha SDK.

---

## Known limitations

- The agent is a **scheduled worker** (GitHub Actions, about every 10 minutes). It is not an always-on TEE runtime. The dashboard's "Agent online" label comes from an on-chain heartbeat, so it is only true while the worker runs.
- Reports use live market data (and an optional AI summary). They are short market snapshots, not deep research.
- Each business stores the treasury contract, which locks roughly 1 to 3 testnet NEAR as storage. Global contracts would reduce this.
- `spend` (payments by the agent) and its limits are enforced by the contract but the demo worker does not make payments yet.
- The Agent Market script registers a directory profile. It does not create a priced service or bid on jobs.
- One worker is configured for one business at a time.
- Profit split changes apply to future jobs only.

---

## Repository map

```
contracts/business-nft-ts/   NFT + factory contract (near-sdk-js, TypeScript)
contracts/treasury/          Treasury contract deployed on each business account (Rust)
agent/                       Agent worker (heartbeat, takes paid jobs, completes them)
frontend/                    Mint page (index.html) and owner / customer dashboard (dashboard.html)
scripts/                     Deploy, upload, check and Agent Market scripts (read keys from environment variables only)
.github/workflows/           Build workflows and the scheduled agent
```

## Run it yourself

**Frontend.** It is static HTML. Open `frontend/index.html` through any static server, or deploy the folder to Vercel.

**Contracts.** Pushing to `main` builds the NFT contract wasm (workflow "Build TypeScript Business NFT"). Run "Build treasury wasm" to build the treasury. Then, with `NEAR_PRIVATE_KEY` set for the contract account:

```
node scripts/deploy-contract.mjs business_nft.wasm
node scripts/upload-treasury.mjs contracts/treasury/treasury.wasm   # ends with "MATCH"
node scripts/check-treasury.mjs contracts/treasury/treasury.wasm
```

**Agent.** Add three GitHub Actions secrets: `BUSINESS_ACCOUNT`, `AGENT_PRIVATE_KEY` (the key shown at activation) and optionally `NEARAI_API_KEY`. Then run the "Agent worker" workflow. It also runs on a 10-minute schedule.

**Agent Market.** `node scripts/list-on-market.mjs <handle> <business account>` registers the agent profile. Save the API key it prints once.

## License

MIT. See `LICENSE`.
