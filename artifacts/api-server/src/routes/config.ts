import { Router, type IRouter } from "express";
import { getConfig } from "../lib/config";

const router: IRouter = Router();

router.get("/config", async (_req, res): Promise<void> => {
  res.json(getConfig());
});

export default router;
