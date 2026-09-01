import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const output = resolve(root, ".sites-build");
const client = resolve(output, "dist/client");

await rm(output, { recursive: true, force: true });
await mkdir(resolve(output, "dist/server"), { recursive: true });
await mkdir(resolve(client, "data"), { recursive: true });
await mkdir(resolve(output, ".openai"), { recursive: true });

for (const file of ["index.html", "styles.css", "overrides.css"]) {
  await cp(resolve(root, file), resolve(client, file));
}
await cp(resolve(root, "dist"), resolve(client, "dist"), { recursive: true });
await cp(resolve(root, "data/seed.json"), resolve(client, "data/seed.json"));
await cp(resolve(root, ".openai/hosting.json"), resolve(output, ".openai/hosting.json"));

const worker = `export default {
  async fetch(request, env) {
    return env.ASSETS.fetch(request);
  },
};
`;
await writeFile(resolve(output, "dist/server/index.js"), worker);

const hosting = JSON.parse(await readFile(resolve(root, ".openai/hosting.json"), "utf8"));
if (hosting.d1 || hosting.r2) {
  throw new Error("Privta must remain client-only; server persistence is not allowed.");
}
