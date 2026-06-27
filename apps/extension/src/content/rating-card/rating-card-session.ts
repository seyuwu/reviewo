import { guardExtensionContext, sendRuntimeMessage } from "../extension-context.js";
import {
  createCheckRatingCardDismissedMessage,
  createDismissRatingCardMessage,
  ExtensionMessageType
} from "../../shared/messages.js";

export function requestDismissRatingCard(canonicalUrl: string): void {
  if (!guardExtensionContext()) {
    return;
  }

  sendRuntimeMessage(createDismissRatingCardMessage(canonicalUrl));
}

export function requestShowRatingCardIfAllowed(canonicalUrl: string, showCard: () => void): void {
  if (!guardExtensionContext()) {
    return;
  }

  sendRuntimeMessage(createCheckRatingCardDismissedMessage(canonicalUrl), (response) => {
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
  });
}
