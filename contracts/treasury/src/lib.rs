// Treasury contract v2, deployed onto every business-<id>.<nft contract> account.
//
// What it enforces ON-CHAIN:
//  * Customers pay through `order_job`; the money is held in escrow until the agent completes the job.
//  * When a job completes, the revenue is split by `owner_bps` (e.g. 6000 = 60% owner / 40% reinvested).
//  * The owner (whoever holds the NFT) can only claim their accrued share (`claim`).
//  * The agent's key can ONLY call: complete_job, spend, heartbeat (strict method list).
//  * `spend` obeys: allowed-payee list, per-payment cap, daily cap, and never touches escrow or owner share.
//  * The owner can pause / resume, change settings and (only while paused) withdraw capital.
//  * The NFT contract revokes the agent key and pauses the business when the NFT is transferred.
//
// Cargo.toml (unchanged):  near-sdk = "5", crate-type = ["cdylib"], opt-level = "z", lto = true, panic = "abort"

use near_sdk::json_types::{U128, U64};
use near_sdk::store::{IterableMap, IterableSet};
use near_sdk::{
    env, ext_contract, near, require, AccountId, Allowance, Gas, NearToken, Promise, PromiseError,
    PromiseOrValue, PublicKey,
};

// The agent's function-call key may only call these methods on this account
const AGENT_METHODS: &str = "complete_job,spend,heartbeat";
const DAY_NS: u64 = 86_400_000_000_000;
const CANCEL_AFTER_NS: u64 = 3_600_000_000_000; // a customer can cancel a pending job after 1 hour
const MAX_PROMPT: usize = 500;
const MAX_RESULT: usize = 1200;
const SCAN_LIMIT: u64 = 500;

#[ext_contract(ext_nft)]
trait Nft {
    fn get_token_owner(&self, token_id: String) -> Option<AccountId>;
}

#[near(serializers=[borsh, json])]
#[derive(Clone, PartialEq)]
pub enum JobStatus {
    Pending,
    Done,
    Refunded,
}

// stored form
#[near(serializers=[borsh])]
#[derive(Clone)]
pub struct Job {
    pub id: u64,
    pub customer: AccountId,
    pub prompt: String,
    pub paid: u128,
    pub created_ns: u64,
    pub status: JobStatus,
    pub result: String,
    pub done_ns: u64,
}

// JSON form returned by views (big numbers as strings so JavaScript keeps them exact)
#[near(serializers=[json])]
pub struct JobView {
    pub id: u64,
    pub customer: AccountId,
    pub prompt: String,
    pub paid: U128,
    pub created_ns: U64,
    pub status: String,
    pub result: String,
    pub done_ns: U64,
}

impl From<&Job> for JobView {
    fn from(j: &Job) -> Self {
        JobView {
            id: j.id,
            customer: j.customer.clone(),
            prompt: j.prompt.clone(),
            paid: U128(j.paid),
            created_ns: U64(j.created_ns),
            status: match j.status {
                JobStatus::Pending => "pending".to_string(),
                JobStatus::Done => "done".to_string(),
                JobStatus::Refunded => "refunded".to_string(),
            },
            result: j.result.clone(),
            done_ns: U64(j.done_ns),
        }
    }
}

#[near(serializers=[json])]
pub struct Stats {
    pub price: U128,
    pub owner_bps: u16,
    pub per_payment_cap: U128,
    pub daily_cap: U128,
    pub paused: bool,
    pub balance: U128,
    pub escrow: U128,
    pub owner_available: U128,
    pub owner_claimed: U128,
    pub earned_total: U128,
    pub reinvested_total: U128,
    pub spendable: U128,
    pub spent_today: U128,
    pub jobs_total: u64,
    pub jobs_done: u64,
    pub jobs_refunded: u64,
    pub last_heartbeat_ns: U64,
    pub payees: Vec<AccountId>,
}

#[near(serializers=[json])]
#[derive(Clone)]
pub enum OwnerAction {
    SetConfig {
        price: U128,
        owner_bps: u16,
        per_payment_cap: U128,
        daily_cap: U128,
    },
    SetPaused { paused: bool },
    AddPayee { account: AccountId },
    RemovePayee { account: AccountId },
    Claim { amount: U128 },
    WithdrawCapital { amount: U128 },
}

#[near(contract_state)]
pub struct Treasury {
    jobs: IterableMap<u64, Job>,
    payees: IterableSet<AccountId>,
    next_job_id: u64,
    price: u128,
    owner_bps: u16,
    per_payment_cap: u128,
    daily_cap: u128,
    paused: bool,
    escrow: u128,
    owner_accrued: u128,
    owner_claimed: u128,
    earned_total: u128,
    jobs_done: u64,
    jobs_refunded: u64,
    last_heartbeat_ns: u64,
    spent_day: u64,
    spent_today: u128,
}

// Defaults used the first time the contract runs (0.1 NEAR per job, 60% owner / 40% reinvest,
// 0.5 NEAR per payment, 1 NEAR per day)
impl Default for Treasury {
    fn default() -> Self {
        Self {
            jobs: IterableMap::new(b"j".to_vec()),
            payees: IterableSet::new(b"p".to_vec()),
            next_job_id: 1,
            price: 100_000_000_000_000_000_000_000,
            owner_bps: 6000,
            per_payment_cap: 500_000_000_000_000_000_000_000,
            daily_cap: 1_000_000_000_000_000_000_000_000,
            paused: false,
            escrow: 0,
            owner_accrued: 0,
            owner_claimed: 0,
            earned_total: 0,
            jobs_done: 0,
            jobs_refunded: 0,
            last_heartbeat_ns: 0,
            spent_day: 0,
            spent_today: 0,
        }
    }
}

// business-<token_id>.<nft contract>  ->  (token_id, nft contract)
fn parts() -> (String, AccountId) {
    let me = env::current_account_id().to_string();
    let (label, parent) = me.split_once('.').expect("not a subaccount");
    let token_id = label.strip_prefix("business-").expect("bad account label").to_string();
    (token_id, parent.parse().expect("bad parent"))
}

fn only_parent() {
    let (_, parent) = parts();
    require!(env::predecessor_account_id() == parent, "Only the NFT contract can call this");
}

// The agent signs with a function-call key on this very account, so predecessor == this account
fn only_agent() {
    require!(
        env::predecessor_account_id() == env::current_account_id(),
        "Only the agent key can call this"
    );
}

fn agent_key_allowance() -> Allowance {
    Allowance::limited(NearToken::from_millinear(500)).unwrap()
}

impl Treasury {
    fn check_owner(&self, action: OwnerAction) -> Promise {
        let (token_id, parent) = parts();
        ext_nft::ext(parent)
            .with_static_gas(Gas::from_tgas(5))
            .get_token_owner(token_id)
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(Gas::from_tgas(25))
                    .on_owner_action(env::predecessor_account_id(), action),
            )
    }

    fn storage_cost(&self) -> u128 {
        env::storage_byte_cost().as_yoctonear().saturating_mul(env::storage_usage() as u128)
    }

    fn owner_unclaimed(&self) -> u128 {
        self.owner_accrued.saturating_sub(self.owner_claimed)
    }

    // money that is neither storage backing, customer escrow nor the owner's unclaimed share
    fn spendable(&self) -> u128 {
        env::account_balance()
            .as_yoctonear()
            .saturating_sub(self.storage_cost())
            .saturating_sub(self.escrow)
            .saturating_sub(self.owner_unclaimed())
    }

    fn today_spent(&self) -> u128 {
        if env::block_timestamp() / DAY_NS == self.spent_day {
            self.spent_today
        } else {
            0
        }
    }
}

#[near]
impl Treasury {
    // ------------------------------------------------------------------
    // Called by the NFT contract only
    // ------------------------------------------------------------------
    pub fn add_agent_key(&mut self, public_key: PublicKey) -> Promise {
        only_parent();
        Promise::new(env::current_account_id()).add_access_key_allowance(
            public_key,
            agent_key_allowance(),
            env::current_account_id(),
            AGENT_METHODS.to_string(),
        )
    }

    pub fn rotate_agent_key(&mut self, old_key: PublicKey, new_key: PublicKey) -> Promise {
        only_parent();
        Promise::new(env::current_account_id())
            .add_access_key_allowance(
                new_key,
                agent_key_allowance(),
                env::current_account_id(),
                AGENT_METHODS.to_string(),
            )
            .delete_key(old_key)
    }

    // Called when the NFT is sold: kill the seller's agent key and pause the business
    pub fn revoke_agent_key(&mut self, key: PublicKey) -> Promise {
        only_parent();
        self.paused = true;
        Promise::new(env::current_account_id()).delete_key(key)
    }

    // ------------------------------------------------------------------
    // Customers
    // ------------------------------------------------------------------
    #[payable]
    pub fn order_job(&mut self, prompt: String) -> u64 {
        require!(!self.paused, "The business is paused");
        let deposit = env::attached_deposit().as_yoctonear();
        require!(deposit >= self.price, "Attached deposit is below the price");
        require!(
            !prompt.trim().is_empty() && prompt.len() <= MAX_PROMPT,
            "Prompt must be 1 to 500 characters"
        );
        let id = self.next_job_id;
        self.next_job_id += 1;
        self.escrow += deposit;
        self.jobs.insert(
            id,
            Job {
                id,
                customer: env::predecessor_account_id(),
                prompt,
                paid: deposit,
                created_ns: env::block_timestamp(),
                status: JobStatus::Pending,
                result: String::new(),
                done_ns: 0,
            },
        );
        env::log_str(&format!("EVENT_JSON:{{\"event\":\"job_ordered\",\"job_id\":{}}}", id));
        id
    }

    // If the agent has not delivered after 1 hour the customer can take the money back
    pub fn cancel_job(&mut self, job_id: u64) -> Promise {
        let mut job = self.jobs.get(&job_id).cloned().expect("Job not found");
        require!(job.status == JobStatus::Pending, "Job is not pending");
        require!(env::predecessor_account_id() == job.customer, "Only the customer can cancel");
        require!(
            env::block_timestamp() >= job.created_ns + CANCEL_AFTER_NS,
            "You can cancel after 1 hour"
        );
        self.escrow = self.escrow.saturating_sub(job.paid);
        self.jobs_refunded += 1;
        job.status = JobStatus::Refunded;
        let customer = job.customer.clone();
        let paid = job.paid;
        self.jobs.insert(job_id, job);
        Promise::new(customer).transfer(NearToken::from_yoctonear(paid))
    }

    // ------------------------------------------------------------------
    // The agent (function-call key: complete_job, spend, heartbeat only)
    // ------------------------------------------------------------------
    pub fn heartbeat(&mut self) {
        only_agent();
        self.last_heartbeat_ns = env::block_timestamp();
    }

    pub fn complete_job(&mut self, job_id: u64, result: String) {
        only_agent();
        require!(!self.paused, "The business is paused");
        require!(result.len() <= MAX_RESULT, "Result is too long");
        let mut job = self.jobs.get(&job_id).cloned().expect("Job not found");
        require!(job.status == JobStatus::Pending, "Job is not pending");

        let paid = job.paid;
        let owner_part = paid * (self.owner_bps as u128) / 10_000; // the on-chain profit split
        self.owner_accrued += owner_part;
        self.earned_total += paid;
        self.escrow = self.escrow.saturating_sub(paid);
        self.jobs_done += 1;

        job.status = JobStatus::Done;
        job.result = result;
        job.done_ns = env::block_timestamp();
        self.jobs.insert(job_id, job);
        self.last_heartbeat_ns = env::block_timestamp();
        env::log_str(&format!(
            "EVENT_JSON:{{\"event\":\"job_done\",\"job_id\":{},\"owner_part\":\"{}\"}}",
            job_id, owner_part
        ));
    }

    // Spending limits: allowed payees only, per-payment cap, daily cap, reinvested money only
    pub fn spend(&mut self, to: AccountId, amount: U128, memo: String) -> Promise {
        only_agent();
        require!(!self.paused, "The business is paused");
        require!(self.payees.contains(&to), "Payee is not on the allowed list");
        let amt = amount.0;
        require!(amt > 0 && amt <= self.per_payment_cap, "Amount exceeds the per-payment cap");
        let today = env::block_timestamp() / DAY_NS;
        if today != self.spent_day {
            self.spent_day = today;
            self.spent_today = 0;
        }
        require!(self.spent_today + amt <= self.daily_cap, "Amount exceeds the daily cap");
        require!(amt <= self.spendable(), "Not enough reinvested treasury to spend");
        self.spent_today += amt;
        env::log_str(&format!(
            "EVENT_JSON:{{\"event\":\"spend\",\"to\":\"{}\",\"amount\":\"{}\",\"memo\":\"{}\"}}",
            to,
            amt,
            memo.chars().take(80).collect::<String>().replace('"', "'")
        ));
        Promise::new(to).transfer(NearToken::from_yoctonear(amt))
    }

    // ------------------------------------------------------------------
    // Owner (whoever holds the NFT right now; checked through the NFT contract)
    // ------------------------------------------------------------------
    pub fn claim(&mut self, amount: U128) -> Promise {
        self.check_owner(OwnerAction::Claim { amount })
    }

    pub fn withdraw_capital(&mut self, amount: U128) -> Promise {
        self.check_owner(OwnerAction::WithdrawCapital { amount })
    }

    pub fn owner_action(&mut self, action: OwnerAction) -> Promise {
        self.check_owner(action)
    }

    #[private]
    pub fn on_owner_action(
        &mut self,
        caller: AccountId,
        action: OwnerAction,
        #[callback_result] owner: Result<Option<AccountId>, PromiseError>,
    ) -> PromiseOrValue<()> {
        require!(owner.ok().flatten() == Some(caller.clone()), "Only the NFT owner can do this");

        match action {
            OwnerAction::SetConfig { price, owner_bps, per_payment_cap, daily_cap } => {
                require!(owner_bps <= 10_000, "Owner share cannot exceed 100%");
                self.price = price.0;
                self.owner_bps = owner_bps;
                self.per_payment_cap = per_payment_cap.0;
                self.daily_cap = daily_cap.0;
                PromiseOrValue::Value(())
            }
            OwnerAction::SetPaused { paused } => {
                self.paused = paused;
                PromiseOrValue::Value(())
            }
            OwnerAction::AddPayee { account } => {
                self.payees.insert(account);
                PromiseOrValue::Value(())
            }
            OwnerAction::RemovePayee { account } => {
                self.payees.remove(&account);
                PromiseOrValue::Value(())
            }
            OwnerAction::Claim { amount } => {
                // The owner can only take their enforced share of recognised revenue
                require!(amount.0 > 0 && amount.0 <= self.owner_unclaimed(), "Amount exceeds your claimable share");
                let liquid = env::account_balance()
                    .as_yoctonear()
                    .saturating_sub(self.storage_cost())
                    .saturating_sub(self.escrow);
                require!(liquid >= amount.0, "Not enough liquid balance");
                self.owner_claimed += amount.0;
                PromiseOrValue::Promise(Promise::new(caller).transfer(NearToken::from_yoctonear(amount.0)))
            }
            OwnerAction::WithdrawCapital { amount } => {
                require!(self.paused, "Pause the business first");
                require!(amount.0 > 0 && amount.0 <= self.spendable(), "Amount exceeds the available capital");
                PromiseOrValue::Promise(Promise::new(caller).transfer(NearToken::from_yoctonear(amount.0)))
            }
        }
    }

    // ------------------------------------------------------------------
    // Views
    // ------------------------------------------------------------------
    pub fn get_stats(&self) -> Stats {
        Stats {
            price: U128(self.price),
            owner_bps: self.owner_bps,
            per_payment_cap: U128(self.per_payment_cap),
            daily_cap: U128(self.daily_cap),
            paused: self.paused,
            balance: U128(env::account_balance().as_yoctonear()),
            escrow: U128(self.escrow),
            owner_available: U128(self.owner_unclaimed()),
            owner_claimed: U128(self.owner_claimed),
            earned_total: U128(self.earned_total),
            reinvested_total: U128(self.earned_total.saturating_sub(self.owner_accrued)),
            spendable: U128(self.spendable()),
            spent_today: U128(self.today_spent()),
            jobs_total: self.next_job_id - 1,
            jobs_done: self.jobs_done,
            jobs_refunded: self.jobs_refunded,
            last_heartbeat_ns: U64(self.last_heartbeat_ns),
            payees: self.payees.iter().cloned().collect(),
        }
    }

    pub fn get_job(&self, job_id: u64) -> Option<JobView> {
        self.jobs.get(&job_id).map(JobView::from)
    }

    // newest first
    pub fn get_recent_jobs(&self, limit: u64) -> Vec<JobView> {
        let mut out = Vec::new();
        let mut id = self.next_job_id;
        while id > 1 && (out.len() as u64) < limit.min(100) {
            id -= 1;
            if let Some(j) = self.jobs.get(&id) {
                out.push(JobView::from(j));
            }
        }
        out
    }

    // oldest first, for the agent worker
    pub fn get_pending_jobs(&self, from_id: u64, limit: u64) -> Vec<JobView> {
        let mut out = Vec::new();
        let start = from_id.max(1);
        let end = self.next_job_id.min(start + SCAN_LIMIT);
        let mut id = start;
        while id < end && (out.len() as u64) < limit {
            if let Some(j) = self.jobs.get(&id) {
                if j.status == JobStatus::Pending {
                    out.push(JobView::from(j));
                }
            }
            id += 1;
        }
        out
    }
}
