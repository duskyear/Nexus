# harness-kit

`harness-kit` turns this harness into an installable CLI + template system.

## Local development

From this repository:

```bash
node .\packages\cli\bin\harness-kit.js init
```

Run the test suite:

```bash
.\node_modules\.bin\vitest.cmd run
```

## Publish to GitHub Packages

This repo publishes the CLI package to GitHub Packages, not npmjs.com.

To publish a new version:

```bash
git tag cli-v0.1.1
git push origin cli-v0.1.1
```

That tag triggers the GitHub Actions workflow in `.github/workflows/publish-cli.yml`.

## Install for personal use

From this source tree, initialize a new project with:

```bash
node .\bootstrap.mjs --with-method-sources --superpowers-source-dir C:\path\to\superpowers --omx-command C:\path\to\omx.cmd
```

If you already have the project scaffold and only want to repair the external method sources, run:

```bash
npm run doctor -- --fix --superpowers-source-dir C:\path\to\superpowers --omx-command C:\path\to\omx.cmd
```

If you want the published-package path instead of the source-tree bootstrap, configure the GitHub Packages registry for the `@duskyear` scope once and use the package CLI shown by the published release.

## What gets installed

`bootstrap.mjs` copies the template into the target project and adds local scripts for:

- `guard`
- `doctor`
- `template`
- `orchestrator`

It also copies the bundled `skills/` subset, writes `harness.version.json`, and writes `harness/install-manifest.json` so `doctor` can compare the installed template against the current one and report method-source status.

## Notes

- This repo is source, not the final install target.
- The intended long-term workflow is: publish once through GitHub, then initialize every new project from the package or from the source-tree bootstrap when working locally.
