module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      2,
      'always',
      [
        'auth',
        'feed',
        'detection',
        'urls',
        'health',
        'common',
        'config',
        'lambda',
        'ci',
        'docs',
        'deps',
        'infra',
        'docker',
      ],
    ],
    'scope-empty': [1, 'never'],
    'subject-case': [2, 'never', ['start-case', 'pascal-case', 'upper-case']],
  },
};
