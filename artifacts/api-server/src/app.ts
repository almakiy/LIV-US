import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { HttpError, sameOrigin, sessionMiddleware } from "./lib/security";

const app: Express = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: "same-origin" } }));

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());
app.use("/api", sameOrigin, sessionMiddleware);

app.use("/api", router);
app.use("/api", (_req, res) => { res.status(404).json({ error: "Endpoint not found." }); });
app.use((error: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = error instanceof HttpError ? error.status : error.type === "entity.too.large" ? 413 : error.type === "entity.parse.failed" ? 400 : error.code === "23505" ? 409 : 500;
  if (status >= 500) req.log.error({ name: error.name, message: error.message }, "API request failed");
  res.status(status).json({ error: status === 500 ? "Unable to complete the request. Please try again." : status === 409 && !(error instanceof HttpError) ? "This record already exists." : error.message, ...(error instanceof HttpError && error.details ? { details: error.details } : {}) });
});

export default app;
