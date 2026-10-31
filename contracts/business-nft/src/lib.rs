use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};
use near_sdk::collections::{LazyOption, UnorderedMap};
use near_sdk::{
    env, near_bindgen, AccountId, BorshStorageKey, PanicOnDefault, PromiseOrValue,
};
use near_contract_standards::non_fungible_token::metadata::{
    NFTContractMetadata, NonFungibleTokenMetadataProvider, TokenMetadata, NFT_METADATA_SPEC,
};
use near_contract_standards::non_fungible_token::NonFungibleToken;
use near_contract_standards::non_fungible_token::{Token, TokenId};

#[derive(BorshSerialize, BorshStorageKey)]
enum StorageKey {
    NonFungibleToken,
    Metadata,
    TokenMetadata,
    Enumeration,
    Approval,
    BusinessAccounts,
}

#[near_bindgen]
#[derive(BorshDeserialize, BorshSerialize, PanicOnDefault)]
pub struct Contract {
    tokens: NonFungibleToken,
    metadata: LazyOption<NFTContractMetadata>,
    business_accounts: UnorderedMap<TokenId, AccountId>,
    next_token_id: u64,
}

#[near_bindgen]
impl Contract {
    #[init]
    pub fn new(owner_id: AccountId) -> Self {
        assert!(!env::state_exists(), "Already initialized");

        let metadata = NFTContractMetadata {
            spec: NFT_METADATA_SPEC.to_string(),
            name: "Autonomous Business NFT".to_string(),
            symbol: "ABIZ".to_string(),
            icon: None,
            base_uri: None,
            reference: None,
            reference_hash: None,
        };

        Self {
            tokens: NonFungibleToken::new(
                StorageKey::NonFungibleToken,
                owner_id.clone(),
                Some(StorageKey::TokenMetadata),
                Some(StorageKey::Enumeration),
                Some(StorageKey::Approval),
            ),
            metadata: LazyOption::new(StorageKey::Metadata, Some(&metadata)),
            business_accounts: UnorderedMap::new(StorageKey::BusinessAccounts),
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
        media: Option<String>,
    ) -> Token {
        let token_id = self.next_token_id.to_string();
        self.next_token_id += 1;

        let metadata = TokenMetadata {
            title: Some(title),
            description: Some(description),
            media,
            media_hash: None,
            copies: Some(1),
            issued_at: None,
            expires_at: None,
            starts_at: None,
            updated_at: None,
            extra: None,
            reference: None,
            reference_hash: None,
        };

        // Placeholder business account name linked to this NFT
        let business_account: AccountId = format!(
            "business-{}.{}",
            token_id,
            env::current_account_id()
        )
        .parse()
        .expect("Invalid business account");

        self.business_accounts.insert(&token_id, &business_account);

        self.tokens.internal_mint(token_id.clone(), receiver_id, Some(metadata))
    }

    pub fn get_business_account(&self, token_id: TokenId) -> Option<AccountId> {
        self.business_accounts.get(&token_id)
    }

    pub fn get_next_token_id(&self) -> u64 {
        self.next_token_id
    }
}

near_contract_standards::impl_non_fungible_token_core!(Contract, tokens);
near_contract_standards::impl_non_fungible_token_approval!(Contract, tokens);
near_contract_standards::impl_non_fungible_token_enumeration!(Contract, tokens);

#[near_bindgen]
impl NonFungibleTokenMetadataProvider for Contract {
    fn nft_metadata(&self) -> NFTContractMetadata {
        self.metadata.get().unwrap()
    }
}       
