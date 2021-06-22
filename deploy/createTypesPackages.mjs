// @ts-check

// node deploy/createTypesPackages.mjs

// prettier-ignore
const packages = [
    {
      name: "@types/web",
      description: "Types for the DOM, and other web technologies in browsers",
      files: [
        { from: "../generated/dom.generated.d.ts", to: "index.d.ts" }
      ],
    },
  ];

// Note: You can add 'version: "1.0.0"' to a package above
// to set the major or minor, otherwise it will always bump
// the patch.

import { join, dirname } from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import pkg from "prettier";
const { format } = pkg;
import { execSync } from "child_process";

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const go = async () => {
  const gitSha = execSync("git rev-parse HEAD").toString().trim().slice(0, 7);

  const generatedDir = join(__dirname, "generated");
  const templateDir = join(__dirname, "template");

  for (const pkg of packages) {
    const folderName = pkg.name.replace("@", "").replace("/", "-");
    const packagePath = join(generatedDir, folderName);

    if (fs.existsSync(packagePath)) fs.rmSync(packagePath, { recursive: true });
    fs.mkdirSync(packagePath, { recursive: true });

    // Migrate in the template files
    for (const templateFile of fs.readdirSync(templateDir)) {
      if (templateFile.startsWith(".")) continue;

      const templatedFile = join(templateDir, templateFile);
      fs.copyFileSync(templatedFile, join(packagePath, templateFile));
    }

    // Add the reference files in the config above
    pkg.files.forEach((fileRef) => {
      fs.copyFileSync(
        join(__filename, "..", fileRef.from),
        join(packagePath, fileRef.to)
      );
    });

    // Setup the files
    await updatePackageJSON(packagePath, pkg, gitSha);

    console.log("Built:", pkg.name);
  }
};

go();

async function updatePackageJSON(packagePath, pkg, gitSha) {
  const pkgJSONPath = join(packagePath, "package.json");
  const packageText = fs.readFileSync(pkgJSONPath, "utf8");
  const packageJSON = JSON.parse(packageText);
  packageJSON.name = pkg.name;
  packageJSON.description = pkg.description;

  // Bump the last version of the number from npm,
  // or use the _version in tsconfig if it's higher,
  // or default to 0.0.1
  let version = pkg.version || "0.0.1";
  try {
    const npmResponse = await fetch(
      `https://registry.npmjs.org/${packageJSON.name}`
    );
    const npmPackage = await npmResponse.json();

    const semverMarkers = npmPackage["dist-tags"].latest.split(".");
    const bumpedVersion = `${semverMarkers[0]}.${semverMarkers[1]}.${
      Number(semverMarkers[2]) + 1
    }`;

    if (isBumpedVersionHigher(version, bumpedVersion)) {
      version = bumpedVersion;
    }
  } catch (error) {
    // NOOP, this is for the first deploy, which will set it to 0.0.1
  }

  packageJSON.version = version;
  packageJSON.domLibGeneratorSha = gitSha;

  fs.writeFileSync(
    pkgJSONPath,
    format(JSON.stringify(packageJSON), { filepath: pkgJSONPath })
  );
}

/**
 * @param packageJSONVersion {string}
 * @param bumpedVersion {string}
 */
function isBumpedVersionHigher(packageJSONVersion, bumpedVersion) {
  const semverMarkersPackageJSON = packageJSONVersion.split(".");
  const semverMarkersBumped = bumpedVersion.split(".");
  for (let i = 0; i < 3; i++) {
    if (Number(semverMarkersPackageJSON[i]) > Number(semverMarkersBumped[i])) {
      return false;
    }
  }

  return true;
}