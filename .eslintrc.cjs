module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  plugins: ['@typescript-eslint', 'import'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:import/recommended',
    'plugin:import/typescript',
    'prettier',
  ],
  env: {
    node: true,
    es2022: true,
  },
  ignorePatterns: ['dist', 'build', 'node_modules', '.turbo', 'coverage'],
  rules: {
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/no-explicit-any': 'warn',
    'import/order': [
      'warn',
      {
        groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
        'newlines-between': 'always',
        alphabetize: { order: 'asc', caseInsensitive: true },
      },
    ],
    'no-console': ['warn', { allow: ['warn', 'error'] }],
  },
  overrides: [
    {
      files: ['apps/web/**/*.{ts,tsx}'],
      env: { browser: true },
      extends: ['plugin:react/recommended', 'plugin:react-hooks/recommended'],
      plugins: ['react', 'react-hooks', 'react-refresh'],
      settings: { react: { version: 'detect' } },
      rules: {
        'react/react-in-jsx-scope': 'off',
        'react-refresh/only-export-components': 'warn',
      },
    },
  ],
};
