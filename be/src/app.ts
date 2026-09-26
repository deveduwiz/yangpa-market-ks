import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';
import path from 'path';
import { fileURLToPath } from 'url';
import { sequelize, createDatabaseIfNotExists } from './models/index.js';
import errorHandler from './middleware/errorHandler.js';

import memberRouter from './routes/member.router.js';
import saleRouter from './routes/sale.router.js';
import config from './config/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const swaggerDocument = YAML.load(path.join(__dirname, '../swagger.yaml'));

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

app.use('/members', memberRouter);
app.use('/sales', saleRouter);

// 로컬 스토리지: 정적 파일 서비스 (Azure는 Blob URL 직접 사용)
if (config.storage.type === 'local') {
  app.use('/image', express.static(config.storage.localPath, {
    maxAge: '1y',
    immutable: true,
  }));
}

app.use(errorHandler);

/**
 * 스키마 동기화.
 *
 * force: true 는 매번 모든 테이블을 DROP 하고 다시 만든다 — 데이터가 전부 날아간다.
 * 테이블이 안 생길 때 임시로 쓰고 싶더라도, 원인은 대개 "옛 빌드가 돌고 있음"이므로
 * 여기 대신 `npm run db:check` 로 먼저 확인할 것.
 */
async function start() {
  try {
    await createDatabaseIfNotExists();
    await sequelize.sync({ force: false });

    // 모델은 등록됐는데 테이블이 없으면 조용히 넘어가지 않고 알려준다.
    // (옛 dist/ 를 실행 중이면 여기서 바로 드러난다)
    const expected = Object.keys(sequelize.models).map(
      (name) => sequelize.models[name].getTableName() as string,
    );
    const tables = await sequelize.getQueryInterface().showAllTables();
    const actual = new Set(tables);
    const missing = expected.filter((t) => !actual.has(t));

    console.log(`DB 연결 성공 — 모델 [${expected.join(', ')}]`);
    if (missing.length) {
      console.warn(`⚠ 테이블 누락: ${missing.join(', ')} — npm run db:check 로 확인하세요.`);
    }

    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      console.log(`Swagger UI: http://localhost:${PORT}/api-docs`);
    });
  } catch (err) {
    console.error('DB 연결 실패:', err);
  }
}

void start();
