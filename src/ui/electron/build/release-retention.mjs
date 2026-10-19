import fs from "node:fs";
import path from "node:path";

const artifactName =
  /^Sector-(\d+\.\d+\.\d+)(?:-win-x64(?:\.zip)?(?:\.sha256)?|(?:-SHA256SUMS\.txt|\.sha256))$/;
const compare = (a, b) => {
  const left = a.split(".").map(Number);
  const right = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (left[i] !== right[i]) return left[i] - right[i];
  }
  return 0;
};

export function obsoleteArtifacts(names, current, retained = []) {
  const artifacts = names.flatMap((name) => {
    const match = artifactName.exec(name);
    return match ? [{ name, version: match[1] }] : [];
  });
  return artifacts
    .filter(
      (item) =>
        compare(item.version, current) < 0 && !retained.includes(item.version),
    )
    .map((item) => item.name);
}

// Called only after packaging succeeds. Never touch source, preferences,
// custom backups, symlinks, or a build newer than the one being packaged.
export function pruneOldBuilds(directory, current, retained = []) {
  const root = fs.realpathSync(directory);
  const removed = [];
  for (const name of obsoleteArtifacts(
    fs.readdirSync(root),
    current,
    retained,
  )) {
    const target = path.resolve(root, name);
    if (path.dirname(target) !== root || fs.lstatSync(target).isSymbolicLink())
      continue;
    if (fs.realpathSync(target) !== target) continue;
    try {
      fs.rmSync(target, { recursive: true });
      removed.push(name);
    } catch (error) {
      console.warn(`Kept older build ${name}: ${error.message}`);
    }
  }
  return removed;
}
