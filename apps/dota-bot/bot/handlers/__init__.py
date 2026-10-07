from aiogram import Router

from .website_login import router as website_login_router
from .admin import router as admin_router
from .account import router as account_router
from .panel import router as panel_router
from .party import router as party_router
from .party_links import router as party_links_router
from .party_slots import router as party_slots_router
from .registration import router as registration_router
from .search import router as search_router

router = Router(name="dota-bot")
router.include_routers(
    website_login_router,
    admin_router,
    account_router,
    registration_router,
    search_router,
    party_router,
    party_slots_router,
    party_links_router,
    panel_router,
)
