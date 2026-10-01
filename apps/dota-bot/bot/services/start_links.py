import re


ACQUISITION_SOURCES = {
    "seo",
    "community",
    "telegram",
    "discord",
    "vk",
    "tiktok",
    "youtube",
    "twitch",
    "steam",
    "search",
    "referral",
    "streamer",
    "site",
    "other",
}


def parse_party_start_payload(payload: str | None) -> str | None:
    if not payload:
        return None
    match = re.fullmatch(r"party_([A-Za-z0-9_-]{6,16})", payload)
    if not match:
        return None
    return match.group(1)


def parse_acquisition_source(payload: str | None) -> str | None:
    tag = parse_acquisition_tag(payload)
    return tag[0] if tag else None


def parse_acquisition_tag(payload: str | None) -> tuple[str, str | None] | None:
    """Parse a short, anonymous campaign code without accepting party invite codes."""
    if not payload or len(payload) > 64:
        return None
    match = re.fullmatch(r"src_([a-z]+)(?:_([a-z0-9_-]{1,48}))?", payload)
    if not match or match.group(1) not in ACQUISITION_SOURCES:
        return None
    source, campaign = match.groups()
    return source, campaign
