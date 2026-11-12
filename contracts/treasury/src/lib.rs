// Treasury contract deployed onto every business-<id>.<nft contract> account.
//
// Cargo.toml (keep it small: its size is locked as storage on each business account):
//   [lib]
//   crate-type = ["cdylib"]
//   [dependencies]
//   near-sdk = "5"
//   [profile.release]
//   opt-level = "z"
//   lto = true
//   codegen-units = 1
//   panic = "abort"
//   overflow-checks = true
//
// Build: cargo near build non-reproducible-wasm   (or cargo build --target wasm32-unknown-unknown --release)

use near_sdk::{
    env, ext_contract, near, require, AccountId, Allowance, Gas, NearToken, Promise, PromiseError,
    PublicKey,
};

#[ext_contract(ext_nft)]
trait Nft {
    fn get_token_owner(&self, token_id: String) -> Option<AccountId>;
}

#[near(contract_state)]
#[derive(Default)]
pub struct Treasury {}

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

fn agent_key_allowance() -> Allowance {
    Allowance::limited(NearToken::from_millinear(250)).unwrap()
}

#[near]
impl Treasury {
    // Called by the NFT contract during activation
    pub fn add_agent_key(&mut self, public_key: PublicKey) -> Promise {
        only_parent();
        Promise::new(env::current_account_id()).add_access_key_allowance(
            public_key,
            agent_key_allowance(),
            env::current_account_id(),
            "".to_string(), // empty = all methods on this account
        )
    }

    // Called by the NFT contract when the owner rotates the agent key
    pub fn rotate_agent_key(&mut self, old_key: PublicKey, new_key: PublicKey) -> Promise {
        only_parent();
        Promise::new(env::current_account_id())
            .add_access_key_allowance(
                new_key,
                agent_key_allowance(),
                env::current_account_id(),
                "".to_string(),
            )
            .delete_key(old_key)
    }

    // Called by the NFT owner's wallet. Sends `amount` from this account to the caller.
    pub fn claim(&mut self, amount: NearToken) -> Promise {
        let (token_id, parent) = parts();
        ext_nft::ext(parent)
            .with_static_gas(Gas::from_tgas(5))
            .get_token_owner(token_id)
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(Gas::from_tgas(15))
                    .on_owner(env::predecessor_account_id(), amount),
            )
    }

    #[private]
    pub fn on_owner(
        &mut self,
        claimer: AccountId,
        amount: NearToken,
        #[callback_result] owner: Result<Option<AccountId>, PromiseError>,
    ) -> Promise {
        // The agent's own key calls with predecessor == this account, so it can never pass this check
        require!(owner.ok().flatten() == Some(claimer.clone()), "Only the NFT owner can claim");

        // Never dip into the balance that backs this contract's own storage
        let locked = env::storage_byte_cost().saturating_mul(env::storage_usage() as u128);
        let available = env::account_balance().saturating_sub(locked);
        require!(available >= amount, "Amount exceeds the claimable treasury balance");

        Promise::new(claimer).transfer(amount)
    }
}
