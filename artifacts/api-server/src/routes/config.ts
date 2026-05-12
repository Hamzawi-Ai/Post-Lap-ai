import { Router, type IRouter } from "express";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const router: IRouter = Router();

// Load config.json — edit this file to change prices, agents, accuracy text
function getConfig() {
  const configPath = join(__dirname, "../../../../config.json");
  return JSON.parse(readFileSync(configPath, "utf-8"));
}

router.get("/config", async (_req, res): Promise<void> => {
  res.json(getConfig());
});

export default router;
