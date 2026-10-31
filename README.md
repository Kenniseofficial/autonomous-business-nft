# Autonomous Business NFT

**An NFT that owns and runs its own autonomous business on NEAR.**

## What it does

This project turns an NFT into a living economic agent.

When you mint an Autonomous Business NFT:
- A unique NFT is created and sent to your wallet
- A dedicated business account is created on NEAR
- A scoped Function-Call Key is granted to an AI agent
- The agent can accept jobs, earn revenue, and manage a treasury
- The NFT owner can claim profits and control key settings

Owning the NFT = owning the business.

## Problem it solves

Most NFTs today are static. They sit in a wallet and do nothing.

At the same time, AI agents are becoming powerful but usually have no clear ownership model or sustainable economic structure.

This project combines both:
- Clear on-chain ownership (the NFT)
- Autonomous economic activity (the agent + business account)
- Transparent revenue and profit distribution

It creates a new primitive: **NFTs that actually work and earn**.

## Tracks Covered
- NFTs That Do Something
- Autonomous Business
- Agent Economy

## Current Status
Building the MVP on **NEAR Testnet**.

Deployer / Admin account: `buildingfromthetop.testnet`

## How to test the prototype (for judges)

> Note: Full public minting and agent marketplace integration are still in progress.  
> Below is the planned testing flow once the core contracts are deployed.

1. **Connect your NEAR Testnet wallet**  
   → Go to the mint page (link will be added here)  
   → Expected result: Wallet connects successfully

2. **Mint an Autonomous Business NFT**  
   → Click “Mint” and approve the transaction  
   → Expected result: You receive NFT #XXXX and a new business account is created

3. **Open the Owner Dashboard**  
   → Click “View Dashboard”  
   → Expected result: You see treasury balance, agent status, and claim button

4. **Simulate a job payment** (admin/test function)  
   → A test payment is sent to the business account  
   → Expected result: Treasury balance increases and profit becomes claimable

5. **Claim profits**  
   → Click “Claim Available Profits”  
   → Expected result: Tokens are transferred to the NFT owner’s wallet

6. **Transfer the NFT**  
   → Send the NFT to another testnet account  
   → Expected result: The new owner gains full control of the business dashboard

## Tech Stack
- NEAR Protocol (Testnet → Mainnet)
- NEP-171 NFT Standard
- Named Accounts + Sub-accounts
- Function-Call Keys
- NEAR AI / Agent concepts (IronClaw style)

## Roadmap
- [x] Project setup
- [ ] Core NFT + Business Factory contract
- [ ] Function-Call Key management
- [ ] Basic Owner Dashboard
- [ ] Public NFT page
- [ ] Agent job simulation
- [ ] Full testnet demo
- [ ] Mainnet launch preparation

## Team
Built by @kenniseofficial

---

**This is a living business owned by an NFT.**
