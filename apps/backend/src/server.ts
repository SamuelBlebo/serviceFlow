import { createApp } from "./app";
import { env } from "./config/env";
import { logger } from "./config/logger";

const app = createApp();

app.listen(env.PORT, () => {
  logger.info(`ServiceFlow legacy API listening on port ${env.PORT} (${env.NODE_ENV})`);
});
