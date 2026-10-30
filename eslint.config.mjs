import eslint from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const noRawErrorThrows = [
  'error',
  {
    selector: "ThrowStatement > NewExpression[callee.name='Error']",
    message: 'Throw an AppError subclass from src/shared/errors instead of a raw Error.',
  },
  {
    selector: "ThrowStatement > CallExpression[callee.name='Error']",
    message: 'Throw an AppError subclass from src/shared/errors instead of a raw Error.',
  },
];

export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**', 'node_modules/**'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    files: ['src/**/*.ts'],
    rules: {
      'no-restricted-syntax': noRawErrorThrows,
    },
  },
  {
    // Module boundaries: a module may import its own files and src/shared.
    // The only cross-module import allowed is the read-only staff (users) contract.
    files: ['src/modules/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^\\.\\./(?!\\.\\./|staff/staff\\.reader$)',
              message:
                'Cross-module imports are forbidden. Communicate via the event bus; only ../staff/staff.reader (read-only) may be imported.',
            },
            {
              regex: '^\\.\\./\\.\\./(app|server)$',
              message: 'Modules must not import the composition root.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/shared/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { regex: 'modules/', message: 'src/shared must not depend on feature modules.' },
          ],
        },
      ],
    },
  },
  {
    // supertest types response bodies as `any`; assertions on them are fine in tests.
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
    },
  },
  {
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    // Browser scripts served from public/.
    files: ['public/**/*.js'],
    languageOptions: { sourceType: 'script', globals: globals.browser },
  },
  {
    files: ['jest.config.js', '.dependency-cruiser.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: { module: 'writable' } },
  },
);
