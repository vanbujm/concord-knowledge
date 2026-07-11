import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// House conventions from CLAUDE.md, enforced as lint errors.

// Structural bans that apply everywhere, including test files.
const noFunctionOrBarrel = [
  {
    selector: "FunctionDeclaration",
    message:
      "Use a const arrow function, not a `function` declaration (generators and class methods are the exception).",
  },
  {
    selector: "ExportAllDeclaration",
    message: "No barrel re-exports. Import directly from the specific module.",
  },
];

// Type casts are banned in product code but permitted in tests (see override
// below). `as const` stays allowed because it is a const assertion, not a cast.
const noTypeCasts = [
  {
    selector: 'TSAsExpression:not([typeAnnotation.typeName.name="const"])',
    message:
      "No type casts. Find the correct typings instead (`as const` is allowed).",
  },
  {
    selector: "TSTypeAssertion",
    message: "No angle-bracket type casts. Find the correct typings instead.",
  },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "no-restricted-syntax": ["error", ...noFunctionOrBarrel, ...noTypeCasts],
      // `z` is the conventional Zod namespace alias.
      "id-length": ["error", { min: 2, properties: "never", exceptions: ["z"] }],
    },
  },
  {
    files: ["**/*.test.ts", "**/*.test.tsx", "**/*.spec.ts", "**/*.spec.tsx"],
    rules: {
      "no-restricted-syntax": ["error", ...noFunctionOrBarrel],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "src/generated/**",
  ]),
]);

export default eslintConfig;
