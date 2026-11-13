import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/** Crea una base de datos SQLite y un directorio de datos aislados para las pruebas. */
export default function setup() {
  const dir = path.resolve(__dirname, "../../test-data.nosync/unit");
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  execFileSync(process.execPath, [path.resolve(__dirname, "../../node_modules/prisma/build/index.js"), "db", "push", "--skip-generate"], {
    env: { ...process.env, DATABASE_URL: `file:${path.join(dir, "test.db")}` },
    stdio: "pipe",
  });
}
