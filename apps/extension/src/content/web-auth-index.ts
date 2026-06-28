import { installExtensionContextGuards } from "./extension-context.js";
import { startWebAuthSync } from "./web-auth-sync.js";
import { startWebLocaleSync } from "./web-locale-sync.js";

installExtensionContextGuards();
startWebAuthSync();
startWebLocaleSync();
