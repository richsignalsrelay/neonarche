'use strict';

const js = require('@eslint/js');

// Scoped to the root Node/CommonJS code — dashboard/frontend is its own
// package with its own toolchain (browser/JSX) and doesn't belong under this.
module.exports = [
  { ignores: ['node_modules/**', 'dashboard/frontend/**', 'artifacts/**', 'dist/**'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        require: 'readonly',
        module: 'writable',
        exports: 'writable',
        process: 'readonly',
        console: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        Buffer: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        URL: 'readonly',
      },
    },
  },
];
