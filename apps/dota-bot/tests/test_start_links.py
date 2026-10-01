import unittest

from bot.services.start_links import (
    parse_acquisition_source,
    parse_acquisition_tag,
    parse_party_start_payload,
)


class StartLinkTests(unittest.TestCase):
    def test_acquisition_sources_are_separate_from_party_invites(self) -> None:
        self.assertEqual(parse_acquisition_source("src_seo"), "seo")
        self.assertEqual(parse_acquisition_source("src_community"), "community")
        self.assertEqual(parse_acquisition_tag("src_telegram_group_x"), ("telegram", "group_x"))
        self.assertEqual(parse_acquisition_tag("src_youtube_creator_01"), ("youtube", "creator_01"))
        self.assertIsNone(parse_acquisition_source("party_m6QvueE"))
        self.assertIsNone(parse_acquisition_source("src_unknown"))
        self.assertIsNone(parse_acquisition_tag("src_telegram_личные_данные"))
        self.assertIsNone(parse_acquisition_tag("src_telegram_" + "a" * 49))

    def test_existing_party_invitation_payload_remains_accepted(self) -> None:
        self.assertEqual(parse_party_start_payload("party_m6QvueE"), "m6QvueE")
        self.assertIsNone(parse_party_start_payload("src_seo"))
        self.assertIsNone(parse_party_start_payload("party_short"))


if __name__ == "__main__":
    unittest.main()
