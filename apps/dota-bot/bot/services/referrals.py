import asyncio
import logging

logger = logging.getLogger(__name__)


def referral_payload(row: dict) -> dict:
    fields = {
        "inviterTelegramId": "inviter_telegram_id", "inviteeTelegramId": "invitee_telegram_id",
        "code": "code", "inviterName": "inviter_name", "inviterUsername": "inviter_username",
        "inviteeName": "invitee_name", "inviteeUsername": "invitee_username", "startedAt": "started_at",
        "accountCreatedAt": "account_created_at", "accountReadyAt": "account_ready_at",
        "searchStartedAt": "search_started_at", "partyJoinedAt": "party_joined_at",
    }
    result = {key: row[column] for key, column in fields.items()}
    for key in ("inviterTelegramId", "inviteeTelegramId"):
        result[key] = str(result[key])
    return result


async def referral_sync_worker(api, storage) -> None:
    """Persisted outbox: API outages never hold up bot interactions or lose referrals."""
    while True:
        try:
            rows = storage.pending_referrals()
            if rows:
                result = await api.sync_referrals([referral_payload(row) for row in rows])
                if result.get("ok") is True:
                    storage.finish_referral_sync(rows)
        except asyncio.CancelledError:
            raise
        except Exception as error:
            logger.warning("Referral statistics sync failed (%s); will retry", type(error).__name__)
        await asyncio.sleep(30)
