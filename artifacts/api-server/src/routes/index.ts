import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import publicRouter from "./public";
import portalRouter from "./portal";
import adminRouter from "./admin";
import v1Router from "./v1";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(publicRouter);
router.use(portalRouter);
router.use(adminRouter);
router.use(v1Router);

export default router;
