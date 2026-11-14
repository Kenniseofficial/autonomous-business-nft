// Autonomous business agent worker.
// Runs on a schedule (GitHub Actions, every ~10 minutes). Each run it:
//   1. proves it is alive on-chain (heartbeat),
//   2. looks for paid customer jobs waiting in escrow,
//   3. writes the deliverable (live market data + optional NEAR AI Cloud summary),
//   4. completes the job on-chain, which triggers the enforced profit split,
//   5. checks on-chain that the job really became "done" (and fails the run loudly if not).
//
// It signs with the business's restricted function-call key. That key can ONLY call
// complete_job, spend and heartbeat, and the contract enforces pause + spending limits.
//
// Environment variables (GitHub Actions secrets):
//   BUSINESS_ACCOUNT   e.g. business-19.buildingfromthetop.testnet
//   AGENT_PRIVATE_KEY  the agent function-call key shown at activation (ed25519:...)
//   NEARAI_API_KEY     optional, enables an AI-written summary through NEAR AI Cloud
import { JsonRpcProvider, Account, KeyPairSigner } from "near-api-js";

const BUSINESS = process.env.BUSINESS_ACCOUNT;
const KEY = process.env.AGENT_PRIVATE_KEY;
const NEARAI_KEY = process.env.NEARAI_API_KEY || "";
const NEARAI_MODEL = process.env.NEARAI_MODEL || "deepseek-ai/DeepSeek-V3.1";
const RPC = process.env.NEAR_RPC || "https://rpc.testnet.near.org";

const HEARTBEAT_EVERY_MS = 25 * 60 * 1000;
const COMPLETE_GAS = 60_000_000_000_000n; // 60 Tgas
const HEARTBEAT_GAS = 10_000_000_000_000n; // 10 Tgas
const MAX_RESULT_BYTES = 1100;

if (!BUSINESS || !KEY) {
  console.error("Missing BUSINESS_ACCOUNT or AGENT_PRIVATE_KEY secrets.");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchWithTimeout(url, options = {}, ms = 12000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ---- read-only call straight to the RPC (no key needed) ----
async function view(method, args = {}) {
  const res = await fetchWithTimeout(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "1",
      method: "query",
      params: {
        request_type: "call_function",
        finality: "final",
        account_id: BUSINESS,
        method_name: method,
        args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
      },
    }),
  });
  const data = await res.json();
  const bytes = data.result?.result;
  if (!bytes) throw new Error(`View ${method} failed: ${JSON.stringify(data.error || data.result || data)}`);
  return JSON.parse(Buffer.from(bytes).toString("utf8"));
}

// ---- signing account (restricted function-call key) ----
const provider = new JsonRpcProvider({ url: RPC });
const account = new Account(BUSINESS, provider, KeyPairSigner.fromSecretKey(KEY));

async function call(methodName, args, gas) {
  return account.callFunction({ contractId: BUSINESS, methodName, args, gas });
}

// ---- deliverable ----
async function marketSnapshot() {
  try {
    const url =
      "https://api.coingecko.com/api/v3/simple/price?ids=near,bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true";
    const res = await fetchWithTimeout(url, { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
    const d = await res.json();
    const line = (id, label) =>
      d[id] ? `${label} $${d[id].usd} (${d[id].usd_24h_change >= 0 ? "+" : ""}${d[id].usd_24h_change.toFixed(2)}% 24h)` : `${label} n/a`;
    return [line("near", "NEAR"), line("bitcoin", "BTC"), line("ethereum", "ETH")].join(" | ");
  } catch (e) {
    // Never let a flaky price feed block a paid job: say so honestly in the report instead.
    console.log("Price feed unavailable, delivering without live prices:", e.message);
    return "live price feed unavailable at delivery time";
  }
}

async function aiSummary(prompt, snapshot) {
  const res = await fetchWithTimeout(
    "https://cloud-api.near.ai/v1/chat/completions",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${NEARAI_KEY}` },
      body: JSON.stringify({
        model: NEARAI_MODEL,
        max_tokens: 400,
        messages: [
          {
            role: "system",
            content:
              "You are a concise geo-economic research analyst. Answer in under 700 characters. Use only the data given plus well-known background. No markdown tables.",
          },
          { role: "user", content: `Request: ${prompt}\n\nLive market data: ${snapshot}` },
        ],
      }),
    },
    25000
  );
  if (!res.ok) throw new Error(`NEAR AI Cloud ${res.status}`);
  const d = await res.json();
  return (d.choices?.[0]?.message?.content || "").trim();
}

function clip(text, maxBytes) {
  let out = text;
  while (Buffer.byteLength(out, "utf8") > maxBytes) out = out.slice(0, -10);
  return out;
}

async function buildReport(prompt) {
  const when = new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC";
  const snapshot = await marketSnapshot();
  let body;
  let by = "data-only";
  if (NEARAI_KEY) {
    try {
      body = await aiSummary(prompt, snapshot);
      by = NEARAI_MODEL;
    } catch (e) {
      console.log("AI summary failed, falling back to data-only:", e.message);
    }
  }
  if (!body) body = `Research request received. The market data is attached below; no AI analysis was generated for this run.`;
  return clip(`REPORT ${when}\nRequest: ${prompt}\n\n${body}\n\nMarket snapshot: ${snapshot}\n[agent: ${by}]`, MAX_RESULT_BYTES);
}

// After completing, read the job back from the chain to be sure it really became "done"
async function confirmDone(jobId) {
  for (let i = 0; i < 8; i++) {
    await sleep(2500);
    try {
      const j = await view("get_job", { job_id: jobId });
      if (j && j.status === "done") return true;
    } catch (e) {}
  }
  return false;
}

// ---- main ----
const stats = await view("get_stats");
console.log(`Business ${BUSINESS}: paused=${stats.paused}, jobs total=${stats.jobs_total}, done=${stats.jobs_done}`);

const lastBeatMs = Number(BigInt(stats.last_heartbeat_ns) / 1_000_000n);
if (Date.now() - lastBeatMs > HEARTBEAT_EVERY_MS) {
  await call("heartbeat", {}, HEARTBEAT_GAS);
  console.log("Heartbeat sent.");
}

if (stats.paused) {
  console.log("Business is paused by its owner. Not taking jobs.");
  process.exit(0);
}

const pending = await view("get_pending_jobs", { from_id: 1, limit: 5 });
console.log(`${pending.length} pending job(s).`);

let failures = 0;
for (const job of pending) {
  try {
    console.log(`Working on job #${job.id}: ${String(job.prompt).slice(0, 80)}`);
    const report = await buildReport(job.prompt);
    await call("complete_job", { job_id: job.id, result: report }, COMPLETE_GAS);
    if (await confirmDone(job.id)) {
      console.log(`Job #${job.id} completed and paid out on-chain. ✅`);
    } else {
      throw new Error("complete_job was sent but the job is not 'done' on-chain");
    }
  } catch (e) {
    failures++;
    console.error(`JOB #${job.id} FAILED: ${e.message}`);
    if (e.cause) console.error("Cause:", e.cause?.message || e.cause);
  }
}

if (failures > 0) {
  console.error(`${failures} job(s) failed. See the messages above.`);
  process.exitCode = 1; // make the GitHub run red so a failure is never hidden
}
