"use strict";

const tsParser = require("@typescript-eslint/parser");
const tsPlugin = require("@typescript-eslint/eslint-plugin");

module.exports = [
  {
    ignores: ["dist/**", "node_modules/**", "**/*.js"],
  },
  {
    files: ['src/auto/**/*.ts', 'src/core/**/*.ts', 'src/plugins/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.property.name='waitForTimeout']",
          message: 'Hard waits (waitForTimeout) are banned in core/auto/plugin paths. Use locator.waitFor(), page.waitForURL(), page.waitForSelector(), or page.waitForLoadState() instead.',
        },
      ],
    },
  },
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
      globals: {
        console: "readonly",
        process: "readonly",
        Buffer: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        module: "readonly",
        require: "readonly",
        exports: "writable",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      // Minimal: catch real errors; avoid style/unused/any wars on existing code
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-require-imports": "off",
    },
  },
];
