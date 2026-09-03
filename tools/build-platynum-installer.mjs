import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { basename, dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const version = "0.2.0";
// This is a self-contained Windows desktop application. A portable target is
// deliberate: the existing Linux service can build it without trying to run a
// Windows installer under Wine, and the owner can simply download and run it.
const desktopAppName = `Platynum-47-${version}.exe`;
const encryptedSource = resolve(root, ".platynum-release", "platynum-47-source.enc");
const artifactDirectory = resolve(root, ".platynum-artifacts");
const sourceKey = process.env.P47_SOURCE_KEY;

// The release key is needed only by OpenSSL. Remove it from the inherited
// process environment before any package manager, test, or packaging command
// can start a child process.
delete process.env.P47_SOURCE_KEY;

function run(command, args, { cwd, env, heartbeat } = {}) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      shell: false,
      stdio: "inherit",
    });
    const heartbeatTimer = heartbeat
      ? setInterval(() => console.log(`${heartbeat} is still running.`), 25000)
      : undefined;
    const stopHeartbeat = () => heartbeatTimer && clearInterval(heartbeatTimer);
    child.once("error", (error) => {
      stopHeartbeat();
      rejectRun(error);
    });
    child.once("exit", (code, signal) => {
      stopHeartbeat();
      if (code === 0) resolveRun();
      else rejectRun(new Error(`${command} failed with ${signal ?? `exit code ${code ?? "unknown"}`}.`));
    });
  });
}

async function sha256(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

async function buildInstaller() {
  if (process.env.P47_BUILD_RELEASE !== "1") {
    console.log("Platynum installer build is disabled outside the release service.");
    return;
  }

  const key = sourceKey;
  const expectedArchiveHash = process.env.P47_SOURCE_ARCHIVE_SHA256;
  if (!key || !expectedArchiveHash) throw new Error("The private Platynum release source is not configured.");
  if (!existsSync(encryptedSource)) throw new Error("The encrypted Platynum release source is missing.");

  const work = await mkdtemp(join(tmpdir(), "platynum-47-"));
  const archive = join(work, "source.tar.gz");

  try {
    await run(
      "openssl",
      ["enc", "-d", "-aes-256-cbc", "-salt", "-pbkdf2", "-iter", "600000", "-in", encryptedSource, "-out", archive, "-pass", "env:P47_ARCHIVE_KEY"],
      { env: { P47_ARCHIVE_KEY: key } },
    );
    if ((await sha256(archive)) !== expectedArchiveHash) throw new Error("The private Platynum release source did not verify.");

    await run("tar", ["-xzf", archive, "-C", work]);
    const project = join(work, "platynum-47");
    const packaging = join(project, ".packaging");

    await run("npm", ["ci", "--include=dev", "--no-audit", "--no-fund"], { cwd: project });

    await mkdir(packaging, { recursive: true });
    await run("npm", ["pack", "npm@11.9.0", "--pack-destination", packaging], { cwd: project });
    const npmPackage = (await readdir(packaging)).find((name) => name === "npm-11.9.0.tgz");
    if (!npmPackage) throw new Error("The bundled project runner package was not downloaded.");
    const npmDirectory = join(project, "node_modules", "npm");
    await rm(npmDirectory, { recursive: true, force: true });
    await mkdir(npmDirectory, { recursive: true });
    await run("tar", ["-xzf", join(packaging, npmPackage), "--strip-components=1", "-C", npmDirectory]);

    await run(
      "npm",
      ["pack", "https://registry.npmjs.org/@openai/codex/-/codex-0.153.0-win32-x64.tgz", "--pack-destination", packaging],
      { cwd: project },
    );
    const workerPackage = (await readdir(packaging)).find((name) => name.includes("codex") && name.endsWith(".tgz"));
    if (!workerPackage) throw new Error("The Windows Codex worker package was not downloaded.");
    const workerDirectory = join(project, "node_modules", "@openai", "codex-win32-x64");
    await rm(workerDirectory, { recursive: true, force: true });
    await mkdir(workerDirectory, { recursive: true });
    await run("tar", ["-xzf", join(packaging, workerPackage), "--strip-components=1", "-C", workerDirectory]);

    await run("npm", ["run", "build"], { cwd: project });
    await run("npm", ["test"], { cwd: project, env: { NODE_ENV: "test", P47_LOCAL_RUNTIME: "1" } });
    await run(
      "npx",
      [
        "--yes",
        "electron-builder@26.15.7",
        "--win",
        "portable",
        "--x64",
        "--publish",
        "never",
        "--config.toolsets.nsis=1.2.1",
        // The Render build worker has a hard resource ceiling. Storing the
        // portable payload avoids an expensive high-compression pass while
        // keeping the result a single self-contained Windows application.
        "--config.compression=store",
        "--config.win.signExecutable=false",
        `--config.portable.artifactName=${desktopAppName}`,
        "--config.electronVersion=43.5.1",
      ],
      {
        cwd: project,
        env: { CSC_IDENTITY_AUTO_DISCOVERY: "false" },
        heartbeat: "Packaging the Windows desktop app",
      },
    );

    const unpacked = join(project, "release", "win-unpacked", "resources");
    const worker = join(unpacked, "app.asar.unpacked", "node_modules", "@openai", "codex-win32-x64", "vendor", "x86_64-pc-windows-msvc", "bin", "codex.exe");
    const npmCli = join(unpacked, "project-runner", "npm", "bin", "npm-cli.js");
    const nodeShim = join(unpacked, "project-runner", "node.cmd");
    const desktopApp = join(project, "release", desktopAppName);
    for (const required of [worker, npmCli, nodeShim, desktopApp]) {
      if (!existsSync(required)) throw new Error(`Packaged Platynum file is missing: ${basename(required)}`);
    }

    await mkdir(artifactDirectory, { recursive: true });
    await copyFile(desktopApp, join(artifactDirectory, desktopAppName));
    await writeFile(join(artifactDirectory, `${desktopAppName}.sha256`), `${await sha256(desktopApp)}  ${desktopAppName}\n`);
    console.log(`Verified Windows desktop app prepared: ${desktopAppName}`);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

await buildInstaller();
