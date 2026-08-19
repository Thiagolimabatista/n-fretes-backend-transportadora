const { spawnSync } = require('node:child_process');

const createEmptyMigration = process.argv[2] === '--empty';
const migrationName =
  (createEmptyMigration ? process.argv[3] : process.argv[2]) ||
  process.env.npm_config_name;

if (!migrationName || !/^[A-Za-z][A-Za-z0-9_-]*$/.test(migrationName)) {
  console.error(
    'Uso: yarn migration:generate NomeDaMigration ou yarn migration:create NomeDaMigration',
  );
  process.exit(1);
}

const yarnCommand = process.platform === 'win32' ? 'yarn.cmd' : 'yarn';

function run(args) {
  const result = spawnSync(yarnCommand, args, {
    stdio: 'inherit',
    shell: false,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (createEmptyMigration) {
  run(['typeorm', 'migration:create', `./src/migrations/${migrationName}`]);
} else {
  run([
    'typeorm',
    'migration:generate',
    `./src/migrations/${migrationName}`,
    '-d',
    './src/config/typeorm.ts',
    '--pretty',
  ]);
}
