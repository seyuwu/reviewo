import type { TranslateFn } from "@reviewo/i18n";

import { isApiError, readApiErrorMessage } from "../../../lib/api/read-api-error";

const STACK_ERROR_MESSAGES: Record<string, string> = {
  "Captain needs a Dota profile to recruit": "dota.team.recruitNeedProfile",
  "Invite already pending": "games.search.error.invitePending",
  "Pick a role to apply for": "games.search.error.pickRole",
  "Player is no longer recruiting for a party": "games.search.error.recruitEnded",
  "Player is not looking for a party right now": "games.search.error.notLooking",
  "Player was not found": "games.search.error.playerNotFound",
  "Select at least one role to recruit": "games.search.rolesNeedSelect",
  "No open roles left to recruit": "games.search.rolesNeedSelect",
  "Team was not found": "games.search.error.partyNotFound",
  "This role is already taken": "games.search.error.roleTaken",
  "This role is not open on that party": "games.search.error.roleNotOpen",
  "This team is already full": "games.search.error.partyFull",
  "User already belongs to a Dota team": "games.search.error.alreadyOnTeam",
  "User is already on this team": "games.search.error.alreadyMember",
  "You cannot stack with yourself": "games.search.error.selfInvite"
};

export function resolveStackInviteError(error: unknown, t: TranslateFn): string {
  if (!isApiError(error)) {
    return t("games.search.stackError");
  }

  const apiMessage = readApiErrorMessage(error.body);

  if (apiMessage && STACK_ERROR_MESSAGES[apiMessage]) {
    return t(STACK_ERROR_MESSAGES[apiMessage] as never);
  }

  if (error.status === 429) {
    return t("games.search.error.rateLimited");
  }

  if (error.status >= 500) {
    return t("games.search.error.unavailable");
  }

  return t("games.search.stackError");
}

export function resolveInviteDecisionError(error: unknown, t: TranslateFn): string {
  if (!isApiError(error)) {
    return t("games.search.error.inviteActionFailed");
  }

  const apiMessage = readApiErrorMessage(error.body);

  if (apiMessage === "This team is already full") {
    return t("games.search.error.partyFull");
  }

  if (apiMessage === "This role is already taken") {
    return t("games.search.error.roleTaken");
  }

  if (apiMessage === "Invite was not found") {
    return t("games.search.error.inviteGone");
  }

  if (
    apiMessage === "Only the captain can accept this application" ||
    apiMessage === "Only the captain or a sub-captain can accept this application" ||
    apiMessage === "Only the invitee can accept this invite"
  ) {
    return t("games.search.error.inviteForbidden");
  }

  if (apiMessage && STACK_ERROR_MESSAGES[apiMessage]) {
    return t(STACK_ERROR_MESSAGES[apiMessage] as never);
  }

  if (error.status === 429) {
    return t("games.search.error.rateLimited");
  }

  if (error.status >= 500) {
    return t("games.search.error.unavailable");
  }

  return t("games.search.error.inviteActionFailed");
}
