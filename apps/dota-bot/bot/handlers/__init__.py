from aiogram import Router

from .website_login import router as website_login_router
from .rewards import router as rewards_router
from .admin import router as admin_router
from .party_rooms import router as party_rooms_router
from .account import router as account_router
from .panel import router as panel_router
from .party import router as party_router
from .party_links import router as party_links_router
from .party_slots import router as party_slots_router
from .referral_sharing import router as referral_sharing_router
from .registration import router as registration_router
from .search import router as search_router
from .tournaments import router as tournaments_router
from .tournament_team_edit import router as tournament_team_edit_router
from .tournament_roster import router as tournament_roster_router
from .tournament_recruitment import router as tournament_recruitment_router
from .tournament_applications import router as tournament_applications_router
from .tournament_companies import router as tournament_companies_router

router = Router(name="dota-bot")
router.include_routers(
    website_login_router,
    rewards_router,
    tournament_applications_router,
    tournament_companies_router,
    tournament_recruitment_router,
    tournament_team_edit_router,
    tournament_roster_router,
    tournaments_router,
    party_rooms_router,
    admin_router,
    account_router,
    registration_router,
    search_router,
    party_router,
    party_slots_router,
    party_links_router,
    referral_sharing_router,
    panel_router,
)
