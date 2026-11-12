# Autonomous Business NFT

An NFT on NEAR that owns and runs its own business.

When you mint one of these NFTs, it gets its own dedicated business account, a restricted Function-Call key, and optional OutLayer TEE custody. The idea is simple: the NFT is the owner of the business. Whoever holds the NFT controls the treasury and can claim revenue or transfer the whole business by transferring the NFT.

## The Problem

Most NFTs are just pictures. Most AI agents need constant babysitting and full access keys. There isn’t a clean way to give an AI agent its own on-chain business that a human can own, transfer, or sell — while still keeping the agent’s permissions limited and safe.

This project tries to solve that.

## What Works Right Now (Testnet)

- Mint an NFT
- Activate the business (creates a real sub-account under the contract)
- Generates a Function-Call key for the agent
- Registers an OutLayer TEE key (wk_...)
- Owner Dashboard with wallet connection
- View your businesses and treasury balance
- Claim Revenue (basic version)
- Agent Control tab

Contract: `buildingfromthetop.testnet`  
Frontend is deployed on Vercel.

## How to Try It

### 1. Open the app
Go to the live frontend (link your Vercel URL here).

### 2. Connect wallet
Click **Connect Wallet** and connect a NEAR testnet wallet (Meteor, Intear, etc).

**Expected result:** Your account ID appears on the page.

### 3. Mint a Business NFT
Fill in a name and description, then click **Mint**.

**Expected result:** Transaction succeeds and you see a success message. The NFT should appear in your wallet collectibles after a short refresh.

### 4. Go to the Dashboard
Click the link to the Owner Dashboard (or open `/dashboard.html`).

**Expected result:** You should see the NFT you just minted listed as a business (usually in “Pending Activation” state).

### 5. Activate the Business
Click **Activate Business**.

**Expected result:** 
- A transaction is sent that creates the sub-account `business-{tokenId}.buildingfromthetop.testnet`
- You receive a Function-Call private key
- You also receive an OutLayer `wk_...` key
- You get about 60 seconds to copy both keys before the page refreshes

### 6. Check the treasury
After activation, the business should show a small NEAR balance and status “Active”.

### 7. Claim Revenue (current version)
Click **Claim Revenue**.

**Expected result:** A transfer is initiated from the business account to your wallet. This is still a basic version and will be improved.

## Architecture (Simple Version)

1. User mints NFT on the factory contract
2. On activation, a dedicated business sub-account is created
3. A limited Function-Call key is added to that account
4. Optionally an OutLayer TEE key is also registered
5. The NFT owner can claim funds or transfer the NFT (which transfers control of the business)

The agent is meant to operate under the hood using the Function-Call key or OutLayer custody, so normal users don’t have to manage keys daily.

## What’s Still Coming

- Better Claim Revenue (full treasury withdrawal)
- A real background agent that can actually perform actions automatically
- Cleaner agent status and control
- Possible mainnet deployment after more testing

## Tech Used

- near-sdk-js (contract)
- @hot-labs/near-connect (wallet)
- OutLayer (TEE custody)
- Simple single-file frontend

## Notes for Judges

- Everything currently runs on **testnet**
- The core loop (mint → activate → get keys → see treasury) works
- The agent is not yet fully autonomous in the background (this is the main known limitation)
- `BUSINESS-NFT.md` contains a more structured, AI-readable description of the project

## Links

- Contract: `buildingfromthetop.testnet`
- Frontend: https://autonomous-business-nft-frontend.vercel.app/
- BUSINESS-NFT.md: see root of this repo

---

Built for NEAR HACKATHON 2026.
