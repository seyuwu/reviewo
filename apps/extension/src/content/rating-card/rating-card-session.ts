import { guardExtensionContext, sendRuntimeMessage } from "../extension-context.js";
import { readCurrentPageUrl } from "../../shared/page-url.js";
import { readPageIdentity } from "../../shared/page-identity.js";
import {
  createCheckRatingCardDismissedMessage,
  createDismissRatingCardMessage,
  createMarkEntityRatedOnTabMessage,
  ExtensionMessageType
} from "../../shared/messages.js";
import { readSiteHostname } from "../../shared/site-snooze.js";

export function readRatingCardSessionKey(pageUrl: string): string {
  return readPageIdentity(pageUrl) ?? pageUrl;
}

export function isResolveResultForCurrentPage(
  result: { url: { input: string } },
  pageUrl: string = readCurrentPageUrl()
): boolean {
  return readRatingCardSessionKey(result.url.input) === readRatingCardSessionKey(pageUrl);
}

export function requestDismissRatingCard(pageSessionKey: string): void {
  if (!guardExtensionContext()) {
    return;
  }

  sendRuntimeMessage(createDismissRatingCardMessage(pageSessionKey));
}

export function requestMarkEntityRatedOnTab(pageSessionKey: string): void {
  if (!guardExtensionContext()) {
    return;
  }

  sendRuntimeMessage(createMarkEntityRatedOnTabMessage(pageSessionKey));
}

export function requestShowRatingCardIfAllowed(pageSessionKey: string, showCard: () => void): void {
  if (!guardExtensionContext()) {
    return;
  }

  sendRuntimeMessage(
    createCheckRatingCardDismissedMessage(
      pageSessionKey,
      readSiteHostname(readCurrentPageUrl())
    ),
    (response) => {
      const callbackResponse = response as {
        payload?: {
          dismissed?: boolean;
        };
        type?: string;
      };

      if (
        callbackResponse?.type === ExtensionMessageType.RatingCardDismissedResult &&
        callbackResponse.payload?.dismissed
      ) {
        return;
      }

      showCard();
    }
  );
}
