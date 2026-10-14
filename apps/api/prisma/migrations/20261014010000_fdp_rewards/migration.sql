CREATE TABLE community.reward_programs (id TEXT PRIMARY KEY DEFAULT 'fdp', enabled BOOLEAN NOT NULL DEFAULT FALSE, started_at TIMESTAMPTZ, settings JSONB NOT NULL DEFAULT '{}', updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE community.reward_wallets (telegram_id VARCHAR(20) PRIMARY KEY, balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE community.reward_ledger (id UUID PRIMARY KEY, telegram_id VARCHAR(20) NOT NULL, key VARCHAR(240) NOT NULL UNIQUE, task VARCHAR(40) NOT NULL, amount INTEGER NOT NULL CHECK (amount <> 0), details JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE INDEX reward_ledger_user_time_idx ON community.reward_ledger(telegram_id, created_at DESC, id);
CREATE TABLE community.reward_events (id VARCHAR(200) PRIMARY KEY, telegram_id VARCHAR(20) NOT NULL, kind VARCHAR(40) NOT NULL, occurred_at TIMESTAMPTZ NOT NULL, processed_at TIMESTAMPTZ);
CREATE INDEX reward_events_pending_idx ON community.reward_events(processed_at, occurred_at, id);
CREATE TABLE community.reward_tag_verifications (id UUID PRIMARY KEY, telegram_id VARCHAR(20) NOT NULL, provider VARCHAR(20) NOT NULL CHECK (provider IN ('telegram','steam')), profile_id VARCHAR(40), challenge VARCHAR(40), status VARCHAR(20) NOT NULL DEFAULT 'PENDING', first_seen_at TIMESTAMPTZ, checked_at TIMESTAMPTZ, next_check_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), observed_name VARCHAR(256), reason VARCHAR(500), UNIQUE(telegram_id,provider), UNIQUE(provider,profile_id));
CREATE INDEX reward_tag_due_idx ON community.reward_tag_verifications(next_check_at,id);
CREATE TABLE community.giveaways (id UUID PRIMARY KEY, title VARCHAR(100) NOT NULL, description VARCHAR(2000) NOT NULL, prizes JSONB NOT NULL, ticket_price INTEGER NOT NULL CHECK (ticket_price BETWEEN 1 AND 100000), max_tickets INTEGER NOT NULL CHECK (max_tickets BETWEEN 1 AND 1000), unique_winners BOOLEAN NOT NULL DEFAULT TRUE, starts_at TIMESTAMPTZ NOT NULL, ends_at TIMESTAMPTZ NOT NULL, status VARCHAR(16) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','OPEN','CLOSED','DRAWN','CANCELLED')), next_ticket INTEGER NOT NULL DEFAULT 1, draw JSONB, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), CHECK (ends_at > starts_at));
CREATE INDEX giveaways_status_end_idx ON community.giveaways(status,ends_at);
CREATE TABLE community.giveaway_purchases (id UUID PRIMARY KEY, giveaway_id UUID NOT NULL REFERENCES community.giveaways(id), telegram_id VARCHAR(20) NOT NULL, request_id UUID NOT NULL, quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 1000), cost INTEGER NOT NULL CHECK(cost > 0), refunded_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(telegram_id,request_id));
CREATE INDEX giveaway_purchases_user_idx ON community.giveaway_purchases(giveaway_id,telegram_id);
CREATE TABLE community.giveaway_tickets (id UUID PRIMARY KEY, giveaway_id UUID NOT NULL REFERENCES community.giveaways(id), purchase_id UUID NOT NULL REFERENCES community.giveaway_purchases(id), telegram_id VARCHAR(20) NOT NULL, number INTEGER NOT NULL, UNIQUE(giveaway_id,number));
CREATE INDEX giveaway_tickets_user_idx ON community.giveaway_tickets(giveaway_id,telegram_id);
CREATE TABLE community.reward_audit (id UUID PRIMARY KEY, actor VARCHAR(80) NOT NULL, action VARCHAR(40) NOT NULL, target VARCHAR(100) NOT NULL, details JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE community.reward_steam_links (token_hash VARCHAR(64) PRIMARY KEY, telegram_id VARCHAR(20) NOT NULL, expires_at TIMESTAMPTZ NOT NULL, used_at TIMESTAMPTZ);
CREATE INDEX reward_steam_links_expiry_idx ON community.reward_steam_links(expires_at);
CREATE TABLE community.reward_notices (id UUID PRIMARY KEY, key VARCHAR(240) NOT NULL UNIQUE, telegram_id VARCHAR(20) NOT NULL, payload JSONB NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), sent_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE INDEX reward_notices_pending_idx ON community.reward_notices(sent_at,next_attempt_at,id);

-- Referral sync already runs in the background; persist rewards in the same commit.
CREATE FUNCTION community.enqueue_referral_rewards() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE campaign TIMESTAMPTZ;
BEGIN
  SELECT started_at INTO campaign FROM community.reward_programs WHERE id='fdp' AND enabled;
  IF campaign IS NULL THEN RETURN NEW; END IF;
  IF NEW.account_ready_at >= campaign THEN
    INSERT INTO community.reward_events(id,telegram_id,kind,occurred_at) VALUES ('referral_ready:'||NEW.invitee_telegram_id,NEW.inviter_telegram_id,'referral_ready',NEW.account_ready_at) ON CONFLICT DO NOTHING;
  END IF;
  IF NEW.account_ready_at >= campaign AND NEW.party_joined_at >= campaign THEN
    INSERT INTO community.reward_events(id,telegram_id,kind,occurred_at) VALUES ('referral_active:'||NEW.invitee_telegram_id,NEW.inviter_telegram_id,'referral_active',NEW.party_joined_at) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER fdp_referral_rewards AFTER INSERT OR UPDATE ON community.fdp_referrals FOR EACH ROW EXECUTE FUNCTION community.enqueue_referral_rewards();

-- Analytics sessions are flushed by an existing background service. Queue in that
-- transaction so delayed/retried inserts cannot be missed by timestamp polling.
CREATE FUNCTION community.enqueue_search_rewards() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE campaign TIMESTAMPTZ; participant TEXT;
BEGIN
  SELECT started_at INTO campaign FROM community.reward_programs WHERE id='fdp' AND enabled;
  IF campaign IS NULL OR NEW.started_at < campaign THEN RETURN NEW; END IF;
  SELECT provider_user_id INTO participant FROM auth.user_auth_identities WHERE user_id=NEW.user_id AND provider='telegram' LIMIT 1;
  IF participant IS NULL THEN RETURN NEW; END IF;
  INSERT INTO community.reward_events(id,telegram_id,kind,occurred_at) VALUES ('api-search:'||NEW.id,participant,'search_pending',NEW.started_at) ON CONFLICT DO NOTHING;
  IF NEW.status='JOINED' AND NEW.search_type='SOLO' THEN
    INSERT INTO community.reward_events(id,telegram_id,kind,occurred_at) VALUES ('api-join:'||NEW.id,participant,'search_result',COALESCE(NEW.finished_at,NEW.started_at)) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER fdp_search_rewards AFTER INSERT OR UPDATE ON social.dota_search_sessions FOR EACH ROW EXECUTE FUNCTION community.enqueue_search_rewards();
