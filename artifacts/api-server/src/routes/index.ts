import { Router, type IRouter } from "express";
import healthRouter from "./health";
import configRouter from "./config";
import authRouter from "./auth";
import adminRouter from "./admin";
import ownerRouter from "./owner";
import adsRouter from "./ads";
import hamzawiRouter from "./hamzawi";
import operationalRouter from "./operational";

const router: IRouter = Router();

router.use(healthRouter);
router.use(configRouter);
router.use(authRouter);
router.use(adminRouter);
router.use(ownerRouter);
router.use(adsRouter);
router.use(hamzawiRouter);
router.use(operationalRouter);

export default router;
