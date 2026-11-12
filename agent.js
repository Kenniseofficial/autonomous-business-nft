/**
 * Autonomous Business NFT - Minimal Agent
 * Uses the Function-Call key generated during activation
 *
 * Usage:
 *   node agent.js <business-account> <private-key>
 *
 * Example:
 *   node agent.js business-12.buildingfromthetop.testnet ed25519:xxxxxxxx
 */

const { connect, keyStores, KeyPair, utils } = require("near-api-js");
const fs = require("fs");

const NETWORK = "testnet";
const NODE_URL = "https://rpc.testnet.near.org";

async function main() {
  const businessAccount = process.argv[2];
  const privateKey = process.argv[3];

  if (!businessAccount || !privateKey) {
    console.error("Usage: node agent.js <business-account> <private-key>");
    process.exit(1);
  }

  console.log("🤖 Autonomous Business Agent starting...");
  console.log("Business Account:", businessAccount);

  const keyStore = new keyStores.InMemoryKeyStore();
  const keyPair = KeyPair.fromString(privateKey);
  await keyStore.setKey(NETWORK, businessAccount, keyPair);

  const near = await connect({
    networkId: NETWORK,
    nodeUrl: NODE_URL,
    deps: { keyStore },
  });

  const account = await near.account(businessAccount);

  // ========== Simple continuous loop ==========
  async function runCycle() {
    try {
      const state = await account.state();
      const balance = Number(state.amount) / 1e24;

      console.log(`\n[${new Date().toLocaleTimeString()}] Treasury balance: ${balance.toFixed(4)} NEAR`);

      // Example autonomous action:
      // If balance is healthy, the agent could later:
      // - Call a marketplace
      // - Pay for a service
      // - Reinvest
      // For now we just report status and keep the key alive

      if (balance > 0.05) {
        console.log("   → Agent is healthy and ready to act");
      } else {
        console.log("   → Low balance. Waiting for more capital or revenue...");
      }

    } catch (err) {
      console.error("Cycle error:", err.message);
    }
  }

  // Run once immediately
  await runCycle();

  // Then run every 60 seconds (background mode)
  console.log("\n🔄 Entering continuous mode (every 60s). Press Ctrl+C to stop.\n");
  setInterval(runCycle, 60 * 1000);
}

main().catch(console.error);
