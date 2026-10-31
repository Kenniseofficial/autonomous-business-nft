use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};
use near_sdk::collections::UnorderedMap;
use near_sdk::{env, near_bindgen, AccountId, PanicOnDefault, NearToken};
use near_sdk::json_types::U128;

#[near_bindgen]
#[derive(BorshDeserialize, BorshSerialize, PanicOnDefault)]
pub struct Contract {
    owner_id: AccountId,
    // token_id → owner
    tokens: UnorderedMap<String, AccountId>,
    // token_id → business account
    business_accounts: UnorderedMap<String, AccountId>,
    // token_id → metadata (simple)
    token_metadata: UnorderedMap<String, String>,
    next_token_id: u64,
}

#[near_bindgen]
impl Contract {
    #[init]
    pub fn new(owner_id: AccountId) -> Self {
        Self {
            owner_id,
            tokens: UnorderedMap::new(b"t"),
            business_accounts: UnorderedMap::new(b"b"),
            token_metadata: UnorderedMap::new(b"m"),
            next_token_id: 1,
        }
    }

    /// Mint a new Autonomous Business NFT
    #[payable]
    pub fn nft_mint(
        &mut self,
        receiver_id: AccountId,
        title: String,
        description: String,
    ) -> String {
        let token_id = self.next_token_id.to_string();
        self.next_token_id += 1;

        // Store owner
        self.tokens.insert(&token_id, &receiver_id);

        // Create business account name
        let business_account = format!(
            "business-{}.{}",
            token_id,
            env::current_account_id()
        );
        self.business_accounts
            .insert(&token_id, &business_account.parse().unwrap());

        // Store simple metadata
        let meta = format!("{}|{}", title, description);
        self.token_metadata.insert(&token_id, &meta);

        token_id
    }

    pub fn get_business_account(&self, token_id: String) -> Option<AccountId> {
        self.business_accounts.get(&token_id)
    }

    pub fn get_token_owner(&self, token_id: String) -> Option<AccountId> {
        self.tokens.get(&token_id)
    }

    pub fn get_next_token_id(&self) -> u64 {
        self.next_token_id
    }

    pub fn get_token_metadata(&self, token_id: String) -> Option<String> {
        self.token_metadata.get(&token_id)
    }
}
