/**
 * Servidor para la prueba end-to-end: base de datos y datos aislados en test-data.nosync/e2e
 * (no toca los datos reales), y la aplicación compilada en modo producción en el puerto 3100.
 */
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const dir = path.join(root, "test-data.nosync", "e2e");
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });

const env = {
  ...process.env,
  DATA_DIR: dir,
  DATABASE_URL: `file:${path.join(dir, "e2e.db")}`,
  PORT: "3100",
  NEXT_TELEMETRY_DISABLED: "1",
};
execFileSync(process.execPath, [path.join(root, "node_modules/prisma/build/index.js"), "db", "push", "--skip-generate"], { env, stdio: "inherit" });
const child = spawn(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), "start", "-p", "3100"], { env, stdio: "inherit" });
const stop = () => child.kill("SIGTERM");
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
child.on("exit", (code) => process.exit(code ?? 0));
