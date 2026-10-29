'use strict';

const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  {ignores: ['node_modules/', 'drizzle/', '.data/']},
  js.configs.recommended,
  {
    languageOptions: {ecmaVersion: 2024, sourceType: 'commonjs', globals: {...globals.node}},
    rules: {
      quotes: ['error', 'single', {avoidEscape: true}],
      semi: ['error', 'always'],
      eqeqeq: ['error', 'always'],
      'no-unused-vars': ['error', {varsIgnorePattern: '^_|^resume_markdown$'}],
      'no-prototype-builtins': 'off',
      'no-control-regex': 'off'
    }
  }
];
