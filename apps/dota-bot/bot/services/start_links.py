import re


def parse_party_start_payload(payload: str | None) -> str | None:
    if not payload:
        return None
    match = re.fullmatch(r"party_([A-Za-z0-9_-]{6,16})", payload)
    if not match:
        return None
    return match.group(1)


def parse_acquisition_source(payload: str | None) -> str | None:
    match = re.fullmatch(r"src_(seo|community)", payload or "")
    return match.group(1) if match else None
