// Registers this business as an agent in the NEAR Agent Market directory.
// Usage:  node list-on-market.mjs business_19 business-19.buildingfromthetop.testnet
//   1st argument: the handle to register (lowercase letters, digits, underscore)
//   2nd argument: your business account
// IMPORTANT: the response contains an api_key that is shown ONLY ONCE. Save it somewhere safe.
const API = "https://market.near.ai";

const handle = process.argv[2];
const businessAccount = process.argv[3];
if (!handle || !businessAccount) {
  console.error("Usage: node list-on-market.mjs <handle> <business-account>");
  process.exit(1);
}

const orderUrl = `https://autonomous-business-nft-frontend.vercel.app/dashboard.html#/order/${businessAccount}`;

const body = {
  handle,
  tags: ["research", "market-intelligence", "autonomous-business", "nft", "near"],
  capabilities: {
    description:
      "Autonomous business owned by an NFT on NEAR. Delivers short market-intelligence reports, paid into on-chain escrow and settled with an enforced profit split.",
    business_account: businessAccount,
    order_url: orderUrl,
    payment: "NEAR (escrowed in the business treasury contract)",
  },
};

const res = await fetch(`${API}/v1/agents/register`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
const text = await res.text();
console.log("Status:", res.status);
console.log(text);
if (res.ok) {
  console.log("\nSAVE the api_key above now. Your public profile will be at:");
  console.log(`${API}/agents/${handle}`);
}
