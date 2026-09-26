import { Sequelize } from 'sequelize';
import config from '../config/config.js';
import { initUser, User } from './user.js';
import { initSale, Sale } from './sale.js';
import { initFavorite, Favorite } from './favorite.js';

/**
 * 데이터베이스가 없으면 생성한다.
 * sync() 호출 전에 먼저 실행해야 한다.
 */
async function createDatabaseIfNotExists(): Promise<void> {
  const { host, port, user, password, database, dialect, ssl } = config.db;

  // 기본 데이터베이스에 연결 (postgres → 'postgres', mysql → 없음/'mysql')
  const defaultDb = dialect === 'postgres' ? 'postgres' : undefined;

  const tempSequelize = new Sequelize(defaultDb || '', user, password, {
    host,
    port,
    dialect,
    logging: false,
    dialectOptions: ssl
      ? { ssl: { require: true, rejectUnauthorized: false } }
      : undefined,
  });

  try {
    if (dialect === 'postgres') {
      // PostgreSQL: pg_database 조회 후 없으면 생성
      const [results] = await tempSequelize.query(
        `SELECT 1 FROM pg_database WHERE datname = '${database}'`,
      );
      if ((results as unknown[]).length === 0) {
        await tempSequelize.query(`CREATE DATABASE "${database}"`);
        console.log(`데이터베이스 '${database}' 생성 완료`);
      }
    } else {
      // MySQL/MariaDB: CREATE DATABASE IF NOT EXISTS
      await tempSequelize.query(
        `CREATE DATABASE IF NOT EXISTS \`${database}\``,
      );
    }
  } finally {
    await tempSequelize.close();
  }
}

const sequelize = new Sequelize(
  config.db.database,
  config.db.user,
  config.db.password,
  {
    host: config.db.host,
    port: config.db.port,
    dialect: config.db.dialect,
    define: {
      timestamps: true,
      paranoid: true,
    },
    logging: false,
    dialectOptions: config.db.ssl
      ? { ssl: { require: true, rejectUnauthorized: false } }
      : undefined,
  },
);

initUser(sequelize);
initSale(sequelize);
initFavorite(sequelize);

User.hasMany(Sale, { foreignKey: 'email', sourceKey: 'email' });
Sale.belongsTo(User, { foreignKey: 'email', targetKey: 'email' });

// 찜. sale.id 를 FK 로 쓰고, 회원 쪽은 기존 규칙대로 email 을 쓴다.
Sale.hasMany(Favorite, { foreignKey: 'saleId', sourceKey: 'id' });
Favorite.belongsTo(Sale, { foreignKey: 'saleId', targetKey: 'id' });
User.hasMany(Favorite, { foreignKey: 'email', sourceKey: 'email' });
Favorite.belongsTo(User, { foreignKey: 'email', targetKey: 'email' });

export { sequelize, createDatabaseIfNotExists, User, Sale, Favorite };
