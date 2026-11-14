// Uploads the compiled treasury.wasm into the NFT contract, in small chunks.
// Usage:  node upload-treasury.mjs /path/to/treasury.wasm
// Only the contract owner can do this. The key is read from NEAR_PRIVATE_KEY.
import fs from "fs";
import { JsonRpcProvider, Account, KeyPairSigner } from "near-api-js";

const CONTRACT = "buildingfromthetop.testnet";
const RPC = "https://rpc.testnet.near.org";
const CHUNK_BYTES = 12 * 1024; // must stay a multiple of 3 so every chunk is clean base64
const GAS = 100_000_000_000_000n; // 100 Tgas per call

const wasmPath = process.argv[2];
const key = process.env.NEAR_PRIVATE_KEY;
if (!wasmPath) throw new Error("Give the path to treasury.wasm, e.g. node upload-treasury.mjs ./treasury.wasm");
if (!key) throw new Error("Set NEAR_PRIVATE_KEY first (see the guide)");

const provider = new JsonRpcProvider({ url: RPC });
const signer = KeyPairSigner.fromSecretKey(key);
const account = new Account(CONTRACT, provider, signer);

const wasm = fs.readFileSync(wasmPath);
const chunks = Math.ceil(wasm.length / CHUNK_BYTES);
console.log("File:", wasmPath, "-", wasm.length, "bytes,", chunks, "chunks");

console.log("Clearing any old treasury code...");
await account.callFunction({ contractId: CONTRACT, methodName: "treasury_code_reset", args: {}, gas: GAS });

for (let i = 0; i < chunks; i++) {
  const part = wasm.subarray(i * CHUNK_BYTES, (i + 1) * CHUNK_BYTES);
  await account.callFunction({
    contractId: CONTRACT,
    methodName: "treasury_code_append",
    args: { chunk_b64: part.toString("base64") },
    gas: GAS,
  });
  console.log(`Uploaded chunk ${i + 1} of ${chunks}`);
}

try {
  const stored = await provider.callFunction(CONTRACT, "treasury_code_len", {});
  console.log("Stored on contract:", stored, "bytes. File size:", wasm.length, "bytes.");
  console.log(Number(stored) === wasm.length ? "MATCH - upload complete." : "MISMATCH - do not activate yet, tell me.");
} catch (e) {
  console.log("Upload finished. Could not read the stored size automatically:", e.message);
}
