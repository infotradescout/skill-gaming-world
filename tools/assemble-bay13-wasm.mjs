import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { copyFile, mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { createGunzip } from "node:zlib";
import path from "node:path";

const EXPECTED_SHA256 = "35116f68540ac41acf7d71ea457added91b5e960a9cca3e2acc72918eaf01277";
const EXPECTED_SIZE = 39_513_091;
const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const partsDirectory = path.join(
  repositoryRoot,
  "games/robot-combat/godot/web-export",
);
const outputPaths = [
  path.join(repositoryRoot, "public/games/robot-combat/index.wasm"),
  path.join(repositoryRoot, "public/games/bay-13/index.wasm"),
];
const temporaryPath = `${outputPaths[0]}.assembling`;
const forceAssembly = process.env.ROBOT_COMBAT_FORCE_WASM_ASSEMBLY === "1";

async function sha256(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

async function hasVerifiedOutput(outputPath) {
  try {
    const metadata = await stat(outputPath);
    return metadata.size === EXPECTED_SIZE && (await sha256(outputPath)) === EXPECTED_SHA256;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function* compressedSource(partNames) {
  for (const partName of partNames) {
    yield* createReadStream(path.join(partsDirectory, partName));
  }
}

await Promise.all(outputPaths.map((outputPath) => mkdir(path.dirname(outputPath), { recursive: true })));

if (!forceAssembly && (await Promise.all(outputPaths.map(hasVerifiedOutput))).every(Boolean)) {
  console.log("ROBOT_COMBAT_WASM_ASSEMBLY:PASS:existing");
} else {
  const partNames = (await readdir(partsDirectory))
    .filter((name) => /^index\.wasm\.gz\.part-\d+$/.test(name))
    .sort();
  if (partNames.length === 0) {
    throw new Error("Robot Combat WebAssembly source parts are missing.");
  }

  await rm(temporaryPath, { force: true });
  try {
    await pipeline(
      Readable.from(compressedSource(partNames)),
      createGunzip(),
      createWriteStream(temporaryPath, { flags: "wx" }),
    );
    const metadata = await stat(temporaryPath);
    const digest = await sha256(temporaryPath);
    if (metadata.size !== EXPECTED_SIZE || digest !== EXPECTED_SHA256) {
      throw new Error(
        `Robot Combat WebAssembly checksum mismatch (${metadata.size} bytes, ${digest}).`,
      );
    }
    await rm(outputPaths[0], { force: true });
    await rename(temporaryPath, outputPaths[0]);
    await copyFile(outputPaths[0], outputPaths[1]);
    console.log(`ROBOT_COMBAT_WASM_ASSEMBLY:PASS:${partNames.length}-parts`);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}
