// Checks that the treasury wasm file and what is stored in the NFT contract are the NEW treasury (v2).
// Usage:  node check-treasury.mjs /path/to/treasury.wasm
import fs from "fs";

const RPC = "https://rpc.testnet.near.org";
const CONTRACT = "buildingfromthetop.testnet";

async function view(method, args = {}) {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0", id: "1", method: "query",
      params: {
        request_type: "call_function", finality: "final", account_id: CONTRACT,
        method_name: method, args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
      },
    }),
  });
  const data = await res.json();
  const bytes = data.result?.result;
  if (!bytes) return null;
  return JSON.parse(Buffer.from(bytes).toString("utf8"));
}

const path = process.argv[2];
if (!path) throw new Error("Give the path to treasury.wasm");
const wasm = fs.readFileSync(path);

console.log("File:", path, "-", wasm.length, "bytes");
console.log("File is the NEW treasury (contains get_stats)?", wasm.includes("get_stats") ? "YES" : "NO - this is the OLD treasury");

const stored = await view("treasury_code_len");
console.log("Stored in the NFT contract:", stored, "bytes", Number(stored) === wasm.length ? "(same size as the file)" : "(DIFFERENT from the file)");

const cost = await view("activation_cost");
if (cost) console.log("Activation will ask for about", (Number(BigInt(cost) / 10n ** 20n) / 10000).toFixed(2), "NEAR");
