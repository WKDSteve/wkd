// Builds an invented rule vault for screenshots of rules-desktop: two rule sets ("lua" for the code
// of a plugin, "release" for how it ships), a handful of families each. Nothing comes from a real
// rule set.
//
//   node make-demo-rules.mjs <target folder>     (the folder is replaced)
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const target = process.argv[2];
if (!target) throw new Error('target folder');
rmSync(target, { recursive: true, force: true });

const grep = (pattern, include = '%.lua$') =>
  `check = { type = "grep", include = "${include}", pattern = "${pattern}" },`;
const agent = (question, glob = '**/*.lua') =>
  `agent = { include = { "${glob}" }, question = "${question}" },`;

/** [set, file, heading, [id, severity, title, body, extra?][]] */
const FILES = [
  [
    'lua',
    'errors',
    'Errors',
    [
      [
        'ER-01',
        'critical',
        'Never drop an error value',
        'A function that can fail returns `nil, err`; the caller handles the error or passes it on.',
        agent('Is every error value handled or passed on?'),
      ],
      [
        'ER-02',
        'critical',
        'No bare pcall without a reason',
        'A `pcall` that swallows its error names in a comment why the failure does not matter.',
        grep('pcall%('),
      ],
      [
        'ER-03',
        'recommended',
        'Error messages name the thing',
        'A message says which file, key or buffer failed, not only that something did.',
        agent('Do the error messages name what failed?'),
      ],
      [
        'ER-04',
        'recommended',
        'Notify once, log the rest',
        'One notification per failure the person can act on; everything else goes to the log.',
      ],
      [
        'ER-05',
        'nice-to-have',
        'Assert the impossible',
        'A state that cannot happen is an `assert`, not a silent return.',
      ],
    ],
  ],
  [
    'lua',
    'naming',
    'Naming',
    [
      [
        'NM-01',
        'recommended',
        'Name things by what they are',
        'A name says what a thing is, not how it was made or where it came from.',
        agent('Are the names honest?'),
      ],
      [
        'NM-02',
        'recommended',
        'Modules are nouns, functions are verbs',
        '`palette.load()`, not `loader.palette()`.',
      ],
      [
        'NM-03',
        'nice-to-have',
        'No abbreviations outside loops',
        '`buffer`, `window`, `highlight`; `i` and `k` stay in their loop.',
        grep('local%s+hl%s*='),
      ],
      [
        'NM-04',
        'recommended',
        'Public names are stable',
        'A name in the public API is renamed only with a deprecation that warns once.',
      ],
    ],
  ],
  [
    'lua',
    'api',
    'Public API',
    [
      [
        'AP-01',
        'critical',
        'One setup function',
        'A plugin is configured through `setup(opts)` and works without calling it.',
        grep('function M%.setup'),
      ],
      [
        'AP-02',
        'critical',
        'No global state at require time',
        'Requiring a module creates no autocommand, no highlight and no timer.',
        agent('Does requiring this module have side effects?'),
      ],
      [
        'AP-03',
        'recommended',
        'Options are validated',
        'An unknown option or a wrong type is reported with the name of the option.',
        grep('vim%.validate'),
      ],
      ['AP-04', 'recommended', 'Lazy by default', 'Work happens on first use, not at startup.'],
      [
        'AP-05',
        'nice-to-have',
        'Types for the public API',
        'Every public function carries its annotations.',
        grep('%-%-%-@param'),
      ],
    ],
  ],
  [
    'lua',
    'tests',
    'Tests',
    [
      [
        'TS-01',
        'critical',
        'A bug fix comes with its test',
        'The test fails without the fix and names the behaviour, not the ticket.',
      ],
      [
        'TS-02',
        'recommended',
        'Tests do not sleep',
        'A test waits for a condition, never for a time.',
        grep('vim%.wait%(%d+%)', '_spec%.lua$'),
      ],
      [
        'TS-03',
        'recommended',
        'One behaviour per test',
        'A test that needs "and" in its name is two tests.',
        agent('Does each test check one behaviour?', '**/*_spec.lua'),
      ],
      [
        'TS-04',
        'nice-to-have',
        'Fixtures are invented',
        'No test reads a file of the person who runs it.',
      ],
    ],
  ],
  [
    'release',
    'versions',
    'Versions',
    [
      [
        'VR-01',
        'critical',
        'A tag is never moved',
        'A published tag stays where it is; a mistake gets the next version.',
      ],
      [
        'VR-02',
        'critical',
        'Breaking changes bump the major',
        'What breaks a documented behaviour is a major version, however small.',
      ],
      [
        'VR-03',
        'recommended',
        'The changelog is written for readers',
        'An entry says what changed for the person, not which file was touched.',
        agent('Is the changelog written for the reader?', 'CHANGELOG.md'),
      ],
      [
        'VR-04',
        'recommended',
        'Pin the tool versions',
        'The formatter, the linter and the test runner are pinned in the lock file.',
        grep('version%s*=', 'tools%.lock$'),
      ],
    ],
  ],
  [
    'release',
    'review',
    'Review',
    [
      [
        'RV-01',
        'critical',
        'Every change is reviewed once',
        'A change is read by someone who did not write it before it is merged.',
      ],
      [
        'RV-02',
        'recommended',
        'The pipeline is green before the tag',
        'No release from a commit whose checks did not finish.',
      ],
      [
        'RV-03',
        'recommended',
        'Secrets never enter the history',
        'A key that was committed is revoked, not only removed.',
        grep('API_KEY%s*=', '.*'),
      ],
      [
        'RV-04',
        'nice-to-have',
        'Small changes',
        'A change that cannot be described in one sentence is split.',
      ],
    ],
  ],
];

// One file per rule (the form the page may write): rulesets/<set>/_rules/<family>/<id>.md.
for (const [set, , heading, rules] of FILES) {
  for (const [id, severity, title, body, extra] of rules) {
    const family = id.split('-')[0];
    const dir = join(target, 'rulesets', set, '_rules', family);
    mkdirSync(dir, { recursive: true });
    const text = [
      '---',
      `id: ${id}`,
      `severity: ${severity}`,
      `family: ${family}`,
      '---',
      '',
      `#### \`${id}\` — ${title}`,
      '',
      '```rule',
      `id = "${id}",`,
      ...(extra ? [extra] : []),
      '```',
      '',
      body,
      '',
      '---',
      '',
    ].join('\n');
    writeFileSync(join(dir, `${id}.md`), text);
  }
  void heading;
}
console.log(
  'rules:',
  FILES.reduce((n, f) => n + f[3].length, 0),
);
