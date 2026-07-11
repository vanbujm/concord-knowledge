---
name: Bun
description: Use when building, testing, and deploying JavaScript/TypeScript applications. Reach for Bun when you need to run scripts, manage dependencies, bundle code, or test applications with a single fast runtime.
metadata:
    mintlify-proj: bun
    version: "1.0"
---

# Bun Skill

## Product summary

Bun is a fast, all-in-one JavaScript runtime and toolkit. It replaces Node.js, npm, and bundlers with a single binary that includes:
- **Runtime**: Execute JavaScript/TypeScript/JSX files with native transpilation
- **Package manager**: Install and manage dependencies (25x faster than npm)
- **Bundler**: Bundle code for browser, Node.js, or Bun targets
- **Test runner**: Jest-compatible testing with TypeScript support

Key files and commands:
- `bunfig.toml` — Configuration file (optional, zero-config by default)
- `bun run <script>` — Execute package.json scripts or files
- `bun install` — Install dependencies
- `bun build` — Bundle code
- `bun test` — Run tests
- `bun add <package>` — Add dependencies

Primary docs: https://bun.com/docs

## When to use

Use Bun when:
- **Running scripts**: Execute TypeScript/JSX directly without compilation step (`bun run index.ts`)
- **Managing dependencies**: Installing packages in Node.js projects (faster than npm/yarn/pnpm)
- **Building applications**: Bundling frontend or full-stack code with `bun build`
- **Testing**: Running Jest-compatible tests with native TypeScript support
- **Creating HTTP servers**: Building APIs with `Bun.serve()` for high performance
- **Migrating from Node.js**: Replacing Node.js in existing projects without code changes
- **Monorepos**: Managing workspaces with `bun install --filter`

Do NOT use Bun for:
- Type checking (use `tsc` separately)
- Generating type declarations (use `tsc`)
- Projects requiring Node.js-only APIs not yet implemented in Bun

## Quick reference

### Essential commands

| Task | Command |
|------|---------|
| Initialize project | `bun init` |
| Run file | `bun run index.ts` or `bun index.ts` |
| Run script | `bun run dev` |
| Install dependencies | `bun install` |
| Add package | `bun add react` |
| Add dev dependency | `bun add -d typescript` |
| Remove package | `bun remove react` |
| Update packages | `bun update` |
| Run tests | `bun test` |
| Watch tests | `bun test --watch` |
| Bundle code | `bun build ./src/index.ts --outdir ./dist` |
| Check version | `bun --version` |

### File conventions

- `bunfig.toml` — Bun configuration (optional)
- `package.json` — Project metadata and scripts
- `bun.lock` — Lockfile (text format, replaces package-lock.json)
- `*.test.ts`, `*_test.ts`, `*.spec.ts`, `*_spec.ts` — Test files (auto-discovered)

### Configuration sections in bunfig.toml

```toml
[install]
# Package manager settings
optional = true
dev = true
peer = true
production = false
linker = "hoisted"  # or "isolated"

[test]
# Test runner settings
root = "."
preload = ["./setup.ts"]
coverage = false
timeout = 5000

[run]
# Script execution settings
shell = "system"  # or "bun"
bun = true  # alias node to bun
silent = false
```

### Common loaders (file types)

| Extension | Behavior |
|-----------|----------|
| `.ts`, `.tsx`, `.js`, `.jsx` | Transpiled with Bun's native transpiler |
| `.json`, `.jsonc` | Parsed and inlined as JavaScript object |
| `.toml`, `.yaml`, `.yml` | Parsed and inlined as JavaScript object |
| `.html` | Processed; referenced assets bundled |
| `.css` | Bundled into single CSS file |
| `.wasm`, `.node` | Treated as assets during bundling |
| Other extensions | Copied as-is (file loader) |

## Decision guidance

### When to use `bun run` vs `bun <file>`

| Scenario | Use |
|----------|-----|
| Running a package.json script | `bun run dev` |
| Running a file directly | `bun index.ts` or `bun run index.ts` |
| Ambiguous name (conflicts with built-in command) | `bun run <script>` |
| Passing flags to Bun | `bun --watch run dev` |

### When to use `bun install` vs `bun add`

| Scenario | Use |
|----------|-----|
| Install all dependencies from package.json | `bun install` |
| Add a new package | `bun add react` |
| Add dev dependency | `bun add -d typescript` |
| Install in CI/CD (frozen lockfile) | `bun ci` |

### When to use `hoisted` vs `isolated` linker

| Scenario | Use |
|----------|-----|
| Traditional npm behavior, single package | `hoisted` |
| Monorepo, prevent phantom dependencies | `isolated` |
| Existing project (pre-v1.3.2) | `hoisted` (default) |
| New workspace | `isolated` (default) |

### When to bundle vs run directly

| Scenario | Use |
|----------|-----|
| Development, rapid iteration | `bun run` (no bundling) |
| Production deployment | `bun build` (optimize, minify, tree-shake) |
| Single-file executable | `bun build --compile` |
| Full-stack app (server + client) | `bun build --target=bun` |

## Workflow

### 1. Initialize and run a project

```bash
bun init my-app
cd my-app
bun run index.ts
```

### 2. Add dependencies

```bash
bun add react react-dom
bun add -d @types/react typescript
```

### 3. Configure (optional)

Create `bunfig.toml` only if you need non-default behavior:

```toml
[install]
linker = "isolated"

[test]
coverage = true
```

### 4. Write and run tests

Create `math.test.ts`:

```typescript
import { test, expect } from "bun:test";

test("2 + 2 = 4", () => {
  expect(2 + 2).toBe(4);
});
```

Run: `bun test`

### 5. Build for production

```bash
bun build ./src/index.ts --outdir ./dist --minify
```

### 6. Deploy

Use `bun.lock` in version control. In CI/CD:

```bash
bun ci  # Install exact versions from lockfile
bun run build
```

## Common gotchas

- **Lifecycle scripts disabled by default**: Bun doesn't run `postinstall` scripts for security. Add trusted packages to `trustedDependencies` in `package.json` to allow them.

- **Flags go after `bun`, not after script name**: Use `bun --watch run dev`, NOT `bun run dev --watch`. Flags at the end are passed to the script itself.

- **`bun.lock` is text by default**: Since Bun v1.2, lockfiles are text (not binary). Commit to version control. Old `bun.lockb` files are automatically migrated.

- **Auto-install can mask missing dependencies**: By default, Bun auto-installs missing packages. In production, disable with `[install] auto = "disable"` in `bunfig.toml` to catch missing dependencies early.

- **TypeScript not type-checked at runtime**: Bun transpiles TypeScript but doesn't type-check. Run `tsc --noEmit` separately for type checking.

- **Node.js compatibility is not 100%**: Some Node.js APIs are not implemented. Check [nodejs-compat](/runtime/nodejs-compat) docs. Use `node:` prefix for Node.js modules (e.g., `import fs from "node:fs"`).

- **Peer dependencies installed by default**: Unlike npm, Bun installs peer dependencies automatically. Set `[install] peer = false` in `bunfig.toml` to disable.

- **Environment variables loaded automatically**: Bun loads `.env`, `.env.local`, and `.env.[NODE_ENV]` automatically. Disable with `[env] file = false` in `bunfig.toml` if needed.

- **Bundler doesn't generate type declarations**: Use `tsc --emitDeclarationOnly` to generate `.d.ts` files separately.

- **Test files must match patterns**: Tests are auto-discovered only if they match `*.test.ts`, `*_test.ts`, `*.spec.ts`, or `*_spec.ts`. Other names won't run.

## Verification checklist

Before submitting work with Bun:

- [ ] `bun install` runs without errors
- [ ] `bun run build` (or equivalent) completes successfully
- [ ] `bun test` passes all tests
- [ ] `bunfig.toml` is valid TOML (if present)
- [ ] `package.json` has correct `"scripts"` section
- [ ] `bun.lock` is committed to version control (for reproducible installs)
- [ ] No `node_modules` folder in version control (use `.gitignore`)
- [ ] TypeScript files type-check with `tsc --noEmit` (if using TypeScript)
- [ ] Environment variables are documented in `.env.example`
- [ ] Trusted dependencies are listed in `package.json` if they have lifecycle scripts

## Resources

**Comprehensive navigation**: https://bun.com/docs/llms.txt

**Critical pages**:
1. [Runtime](https://bun.com/docs/runtime) — Execute files and scripts
2. [Package Manager](https://bun.com/docs/pm/cli/install) — Install and manage dependencies
3. [Bundler](https://bun.com/docs/bundler) — Bundle code for production
4. [Test Runner](https://bun.com/docs/test) — Write and run tests

---

> For additional documentation and navigation, see: https://bun.com/docs/llms.txt