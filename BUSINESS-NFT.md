# Autonomous Business NFT

## One-line description
An NFT on NEAR that owns and operates its own autonomous business through a dedicated sub-account, Function-Call key, and optional OutLayer TEE custody. The agent runs under the hood; the NFT holder only claims revenue or transfers ownership.

## Problem
Most NFTs are static collectibles. Most AI agents require constant human supervision and key management. There is no clean primitive that combines:
- Ownable digital asset (NFT)
- Autonomous economic agent
- On-chain treasury
- Restricted permissions (Function-Call keys)
- Optional TEE custody

This project creates that primitive.

## Core Architecture

1. **Mint**  
   User mints an NFT on the factory contract (`buildingfromthetop.testnet`).

2. **Activation**  
   Owner activates the business. This creates:
   - A dedicated sub-account: `business-{tokenId}.buildingfromthetop.testnet`
   - A Function-Call key with limited allowance
   - Optional registration with OutLayer TEE (returns a `wk_...` API key)

3. **Agent Runtime**  
   The agent can operate in two modes:
   - Classic: using the Function-Call private key
   - OutLayer TEE: using the custodial `wk_...` key (private key never leaves the TEE)

4. **Revenue & Ownership**  
   - Agent deposits earnings into the business treasury
   - NFT owner can claim revenue
   - Transferring the NFT transfers control of the business account

## What is currently live (testnet)

- NFT minting (NEP-171 compatible)
- On-chain ownership tracking
- Business sub-account creation
- Function-Call key generation and attachment
- OutLayer TEE wallet registration
- Owner Dashboard with:
  - Wallet sync
  - Business list + treasury balance
  - Activate Business flow
  - Claim Revenue (test)
  - Sell/Transfer instructions
  - Agent Control tab (classic key + OutLayer key)
- 60-second key copy window after activation

Contract: `buildingfromthetop.testnet`  
Frontend: Vercel + single-file dashboard

## Design Philosophy

- Normal users should not need to touch the agent.
- Power users and developers can still inject their own agent logic via the Function-Call key or OutLayer API.
- Permissions are intentionally restricted (no full-access keys).
- The NFT is the source of truth for ownership and control.

## Current Limitations

- No fully autonomous background job scheduler yet (the agent still needs to be started by a runtime).
- Claim Revenue currently performs a small test transfer; full treasury withdrawal logic is still pending.
- No dedicated marketplace that presents the NFT + autonomous business as a single sellable package (standard NEP-171 marketplaces can still transfer the NFT).
- Agent does not yet automatically list itself on agent marketplaces or accept external jobs.
- Some advanced OutLayer features (NEAR Intents, confidential balances) are mainnet-only.

## Intended Next Steps

1. Minimal working agent script that uses the Function-Call key to perform real actions.
2. Proper treasury claim (withdraw available balance to owner).
3. Optional background scheduler (OutLayer / Hermes / simple cron).
4. Agent self-registration on available NEAR agent marketplaces.
5. Mainnet deployment after thorough testing.

## Technical Notes

- Contract written in near-sdk-js
- Frontend uses @hot-labs/near-connect
- Keys generated client-side with tweetnacl
- Business accounts are real NEAR sub-accounts
- Function-Call keys are scoped with allowance

## Status

Working end-to-end on NEAR testnet as of November 2026.  
Core loop (mint → activate → agent key → treasury) is functional.
