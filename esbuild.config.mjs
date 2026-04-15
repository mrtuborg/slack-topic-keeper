import esbuild from "esbuild";

const production = process.argv.includes("--production");

esbuild
  .build({
    entryPoints: ["src/main.ts"],
    bundle: true,
    format: "cjs",
    platform: "browser",
    target: "es2018",
    external: ["obsidian"],
    outfile: "main.js",
    minify: production,
    sourcemap: !production,
  })
  .catch(() => process.exit(1));
