# Autonomous Business NFT: machine-readable summary

See `README.md` for the full description, the status table and the judges quickstart. This file is a short summary for automated readers.

**One line:** an NFT on NEAR that owns a dedicated business sub-account with an on-chain treasury and a restricted AI agent. Whoever holds the NFT owns the business.

**Network:** NEAR testnet only. NFT contract: `buildingfromthetop.testnet`.

## Components
- `contracts/business-nft-ts` (near-sdk-js): NEP-171 mint and transfer, creates `business-<id>.<contract>`, deploys the treasury code, issues and revokes the agent key.
- `contracts/treasury` (Rust, near-sdk 5): escrowed customer orders, job completion, enforced owner/reinvest split, owner claim checked against NFT ownership, spending limits, pause.
- `agent/`: scheduled worker that sends a heartbeat, takes paid jobs, and completes them using a restricted function-call key.
- `frontend/`: mint page and owner / customer dashboard.

## Permissions model
- Agent key (function-call key on the business account) may call only: `complete_job`, `spend`, `heartbeat`.
- Owner actions are authorised by asking the NFT contract who owns the token at call time.
- On `nft_transfer` the previous agent key is revoked and the business is paused.

## Verified vs in progress
See the status table in `README.md`. Anything marked 🟡 there is implemented but not yet verified end-to-end.

## Tracks
Autonomous Business, Agent Economy, NFTs That Do Something.
