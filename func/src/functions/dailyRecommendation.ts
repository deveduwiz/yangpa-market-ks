import { app, InvocationContext, Timer } from '@azure/functions';
import { Sequelize, DataTypes, Model, Op } from 'sequelize';
import { BrevoClient } from '@getbrevo/brevo';

// DB 연결 설정
const sequelize = new Sequelize({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  dialect: 'postgres',
  logging: false,
  dialectOptions: {
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  },
});

// 모델 정의
class User extends Model {
  declare id: number;
  declare email: string;
  declare name: string;
}

User.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    email: { type: DataTypes.STRING(50), allowNull: false, unique: true },
    name: { type: DataTypes.STRING(50), allowNull: false },
  },
  { sequelize, tableName: 'user', timestamps: true, paranoid: true }
);

class Favorite extends Model {
  declare id: number;
  declare email: string;
  declare saleId: number;
  declare createdAt: Date;
}

Favorite.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    email: { type: DataTypes.STRING(50), allowNull: false },
    saleId: { type: DataTypes.INTEGER, allowNull: false },
  },
  { sequelize, tableName: 'favorite', timestamps: true, paranoid: false }
);

class Sale extends Model {
  declare id: number;
  declare productName: string;
  declare description: string;
  declare price: number;
  declare photo: string;
}

Sale.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    productName: { type: DataTypes.STRING(50), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: false },
    price: { type: DataTypes.INTEGER, allowNull: false },
    photo: { type: DataTypes.STRING(200), allowNull: false },
  },
  { sequelize, tableName: 'sale', timestamps: true, paranoid: true }
);

// 관계 설정
Favorite.belongsTo(Sale, { foreignKey: 'saleId', as: 'sale' });

interface UserWithFavorites {
  email: string;
  name: string;
  favorites: Array<{
    productName: string;
    price: number;
  }>;
}

// 3일 이내 좋아요 클릭한 사용자 조회
async function getRecentFavoriteUsers(): Promise<UserWithFavorites[]> {
  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

  // 3일 이내 좋아요한 사용자의 이메일 목록 조회
  const recentFavorites = await Favorite.findAll({
    where: {
      createdAt: { [Op.gte]: threeDaysAgo },
    },
    include: [{ model: Sale, as: 'sale', attributes: ['productName', 'price'] }],
    raw: false,
  });

  // 이메일별로 그룹화
  const userFavoritesMap = new Map<string, Array<{ productName: string; price: number }>>();

  for (const fav of recentFavorites) {
    const email = fav.email;
    const sale = (fav as any).sale;

    if (!sale) continue;

    if (!userFavoritesMap.has(email)) {
      userFavoritesMap.set(email, []);
    }
    userFavoritesMap.get(email)!.push({
      productName: sale.productName,
      price: sale.price,
    });
  }

  // 사용자 정보 조회
  const emails = Array.from(userFavoritesMap.keys());
  const users = await User.findAll({
    where: { email: { [Op.in]: emails } },
    attributes: ['email', 'name'],
  });

  return users.map((user) => ({
    email: user.email,
    name: user.name,
    favorites: userFavoritesMap.get(user.email) || [],
  }));
}

// 추천 상품 조회 (최신 상품 5개)
async function getRecommendedProducts(): Promise<Array<{ productName: string; price: number; photo: string }>> {
  const products = await Sale.findAll({
    order: [['createdAt', 'DESC']],
    limit: 5,
    attributes: ['productName', 'price', 'photo'],
  });

  return products.map((p) => ({
    productName: p.productName,
    price: p.price,
    photo: p.photo,
  }));
}

// 이메일 HTML 템플릿 생성
function createEmailHtml(
  userName: string,
  favorites: Array<{ productName: string; price: number }>,
  recommendations: Array<{ productName: string; price: number }>
): string {
  const favoritesList = favorites
    .slice(0, 3)
    .map((f) => `<li>${f.productName} - ${f.price.toLocaleString()}원</li>`)
    .join('');

  const recommendationsList = recommendations
    .map((r) => `<li>${r.productName} - ${r.price.toLocaleString()}원</li>`)
    .join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #7C3AED; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px; }
    .section { margin-bottom: 20px; }
    .section h3 { color: #7C3AED; margin-bottom: 10px; }
    ul { padding-left: 20px; }
    li { margin-bottom: 8px; }
    .footer { text-align: center; color: #888; font-size: 12px; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🧅 양파마켓</h1>
    </div>
    <div class="content">
      <p>안녕하세요, <strong>${userName}</strong>님!</p>

      <div class="section">
        <h3>❤️ 최근 관심 상품</h3>
        <ul>${favoritesList}</ul>
      </div>

      <div class="section">
        <h3>✨ 오늘의 추천 상품</h3>
        <ul>${recommendationsList}</ul>
      </div>

      <p>양파마켓에서 더 많은 상품을 확인해보세요!</p>
    </div>
    <div class="footer">
      <p>본 메일은 양파마켓에서 발송되었습니다.</p>
      <p>수신을 원하지 않으시면 설정에서 변경해주세요.</p>
    </div>
  </div>
</body>
</html>
`;
}

// Brevo 클라이언트 초기화
const brevoClient = new BrevoClient({
  apiKey: process.env.BREVO_API_KEY || '',
});

// Brevo로 이메일 발송
async function sendEmail(
  to: string,
  toName: string,
  subject: string,
  htmlContent: string
): Promise<boolean> {
  try {
    await brevoClient.transactionalEmails.sendTransacEmail({
      subject,
      htmlContent,
      sender: {
        name: process.env.SENDER_NAME || '양파마켓',
        email: process.env.SENDER_EMAIL || 'noreply@example.com',
      },
      to: [{ email: to, name: toName }],
    });
    return true;
  } catch (error) {
    console.error(`Failed to send email to ${to}:`, error);
    return false;
  }
}

// 메인 함수
async function dailyRecommendation(myTimer: Timer, context: InvocationContext): Promise<void> {
  context.log('Daily recommendation function started');

  try {
    // DB 연결 확인
    await sequelize.authenticate();
    context.log('Database connected');

    // 3일 이내 좋아요 클릭한 사용자 조회
    const users = await getRecentFavoriteUsers();
    context.log(`Found ${users.length} users with recent favorites`);

    if (users.length === 0) {
      context.log('No users to send emails to');
      return;
    }

    // 추천 상품 조회
    const recommendations = await getRecommendedProducts();
    context.log(`Found ${recommendations.length} recommended products`);

    // 각 사용자에게 이메일 발송
    let successCount = 0;
    let failCount = 0;

    for (const user of users) {
      const htmlContent = createEmailHtml(user.name, user.favorites, recommendations);
      const success = await sendEmail(
        user.email,
        user.name,
        '🧅 양파마켓 - 오늘의 추천 상품을 확인하세요!',
        htmlContent
      );

      if (success) {
        successCount++;
      } else {
        failCount++;
      }
    }

    context.log(`Email sending completed. Success: ${successCount}, Failed: ${failCount}`);
  } catch (error) {
    context.error('Error in daily recommendation function:', error);
    throw error;
  } finally {
    await sequelize.close();
  }
}

// Timer trigger: 매일 오전 9시 (KST) 실행 = UTC 0시
app.timer('dailyRecommendation', {
  schedule: '0 0 0 * * *', // CRON: 매일 UTC 0시 (KST 9시)
  handler: dailyRecommendation,
});

export default dailyRecommendation;
