const tseslint = require('typescript-eslint');

module.exports = tseslint.config({
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',
    'unused-imports/no-unused-imports': 'error',

    'import/order': [
      'error',
      {
        'newlines-between': 'always',
      },
    ],
  },
});