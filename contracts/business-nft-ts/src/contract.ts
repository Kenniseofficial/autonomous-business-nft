import { NearBindgen, near, call, view, initialize, LookupMap } from "near-sdk-js";

@NearBindgen({})
class Contract {
  owner_id: string = "";
  next_token_id: number = 1;

  // token_id → owner account
  tokens: LookupMap<string> = new LookupMap("tokens");

  // token_id → metadata JSON string
  token_metadata: LookupMap<string> = new LookupMap("metadata");

  // owner account → list of token_ids (as JSON string)
  tokens_per_owner: LookupMap<string> = new LookupMap("tokens_per_owner");

  // business sub-account idea
  business_accounts: LookupMap<string> = new LookupMap("business");

  @initialize({})
  init({ owner_id }: { owner_id: string }) {
    this.owner_id = owner_id;
  }

  @call({ payableFunction: true })
  nft_mint({
    receiver_id,
    title,
    description,
  }: {
    receiver_id: string;
    title: string;
    description: string;
  }): string {
    const token_id = this.next_token_id.toString();
    this.next_token_id += 1;

    // Save owner
    this.tokens.set(token_id, receiver_id);

    // Save metadata as proper object
    const metadata = {
      title: title || "Autonomous Business NFT",
      description: description || "An AI agent that runs its own business on NEAR",
      media: "https://near.org/wp-content/themes/near-22/assets/images/near-logo.svg",
      copies: 1,
    };
    this.token_metadata.set(token_id, JSON.stringify(metadata));

    // Track tokens per owner
    let owner_tokens: string[] = [];
    const existing = this.tokens_per_owner.get(receiver_id);
    if (existing) {
      try {
        owner_tokens = JSON.parse(existing);
      } catch (e) {
        owner_tokens = [];
      }
    }
    owner_tokens.push(token_id);
    this.tokens_per_owner.set(receiver_id, JSON.stringify(owner_tokens));

    // Business account idea
    const business_account = `business-\( {token_id}. \){near.currentAccountId()}`;
    this.business_accounts.set(token_id, business_account);

    // Emit the official NEP-171 mint event (important for wallets)
    const event = {
      standard: "nep171",
      version: "1.2.0",
      event: "nft_mint",
      data: [
        {
          owner_id: receiver_id,
          token_ids: [token_id],
        },
      ],
    };
    near.log(`EVENT_JSON:${JSON.stringify(event)}`);

    return token_id;
  }

  // ========== REQUIRED BY WALLETS ==========

  @view({})
  nft_metadata() {
    return {
      spec: "nft-1.0.0",
      name: "Autonomous Business NFT",
      symbol: "ABNFT",
      icon: "https://near.org/wp-content/themes/near-22/assets/images/near-logo.svg",
      base_uri: null,
      reference: null,
      reference_hash: null,
    };
  }

  @view({})
  nft_token({ token_id }: { token_id: string }) {
    const owner_id = this.tokens.get(token_id);
    if (!owner_id) return null;

    const meta_str = this.token_metadata.get(token_id);
    let metadata = {};
    if (meta_str) {
      try {
        metadata = JSON.parse(meta_str);
      } catch (e) {
        metadata = { title: "Autonomous Business", description: "" };
      }
    }

    return {
      token_id,
      owner_id,
      metadata,
    };
  }

  @view({})
  nft_tokens_for_owner({
    account_id,
    from_index,
    limit,
  }: {
    account_id: string;
    from_index?: string | null;
    limit?: number | null;
  }) {
    const tokens_str = this.tokens_per_owner.get(account_id);
    if (!tokens_str) return [];

    let token_ids: string[] = [];
    try {
      token_ids = JSON.parse(tokens_str);
    } catch (e) {
      return [];
    }

    const start = from_index ? parseInt(from_index) : 0;
    const end = limit ? start + limit : token_ids.length;
    const sliced = token_ids.slice(start, end);

    const result = [];
    for (const tid of sliced) {
      const token = this.nft_token({ token_id: tid });
      if (token) result.push(token);
    }
    return result;
  }

  @view({})
  nft_supply_for_owner({ account_id }: { account_id: string }): string {
    const tokens_str = this.tokens_per_owner.get(account_id);
    if (!tokens_str) return "0";
    try {
      const arr = JSON.parse(tokens_str);
      return arr.length.toString();
    } catch (e) {
      return "0";
    }
  }

  // ========== Extra helpers (keep for dashboard later) ==========

  @view({})
  get_next_token_id(): number {
    return this.next_token_id;
  }

  @view({})
  get_token_owner(token_id: string): string | null {
    return this.tokens.get(token_id);
  }

  @view({})
  get_business_account(token_id: string): string | null {
    return this.business_accounts.get(token_id);
  }
}
