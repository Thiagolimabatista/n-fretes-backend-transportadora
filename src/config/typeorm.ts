import { ConfigObject, registerAs } from '@nestjs/config';
import { config as dotenvConfig } from 'dotenv';
import { resolve } from 'path';
import { DataSource, DataSourceOptions } from 'typeorm';

dotenvConfig({ path: '.env.development' });

const parseBoolean = (value: string | undefined, fallback = false): boolean => {
  if (value === undefined) {
    return fallback;
  }

  return ['true', '1', 'yes', 'on'].includes(value.trim().toLowerCase());
};

const parsedDatabasePort = Number.parseInt(
  process.env.DATABASE_PORT ?? '5432',
  10,
);
const databasePort = Number.isNaN(parsedDatabasePort)
  ? 5432
  : parsedDatabasePort;
const databaseSslEnabled = parseBoolean(process.env.DB_SSL);
const isTypeScriptRuntime = __filename.endsWith('.ts');
const runtimeSourceRoot = resolve(__dirname, '..').replace(/\\/g, '/');

const config: ConfigObject = {
  type: 'postgres',
  host: `${process.env.DATABASE_HOST}`,
  port: databasePort,
  username: `${process.env.DATABASE_USERNAME}`,
  password: `${process.env.DATABASE_PASSWORD}`,
  database: `${process.env.DATABASE_NAME}`,
  entities: [
    `${runtimeSourceRoot}/**/*.entity.${isTypeScriptRuntime ? 'ts' : 'js'}`,
  ],
  migrations: [
    `${runtimeSourceRoot}/migrations/*.${isTypeScriptRuntime ? 'ts' : 'js'}`,
  ],
  migrationsTableName: 'migrations',
  migrationsTransactionMode: 'all',
  synchronize: false,
  logging: parseBoolean(process.env.DATABASE_QUERY_LOGGING),
  schema: 'public',
  uuidExtension: 'uuid-ossp',
  ssl: databaseSslEnabled
    ? {
        rejectUnauthorized: parseBoolean(
          process.env.DB_SSL_REJECT_UNAUTHORIZED,
          false,
        ),
      }
    : false,
  extra: {
    softDelete: true,
  },
};

export default registerAs('typeorm', () => config);
export const connectionSource = new DataSource(config as DataSourceOptions);
