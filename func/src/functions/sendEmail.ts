import { app, InvocationContext, Timer } from "@azure/functions";
import * as Brevo from "@getbrevo/brevo";
import { Sequelize, DataTypes, Model, Op } from "sequelize";

// Favorite 모델 정의
interface FavoriteAttributes {
    id: number;
    email: string;
    saleId: number;
    createdAt: Date;
}

class Favorite extends Model<FavoriteAttributes> implements FavoriteAttributes {
    declare id: number;
    declare email: string;
    declare saleId: number;
    declare createdAt: Date;
}

// Sale 모델 정의
interface SaleAttributes {
    id: number;
    productName: string;
    description: string;
    price: number;
    email: string;
    photo: string;
}

class Sale extends Model<SaleAttributes> implements SaleAttributes {
    declare id: number;
    declare productName: string;
    declare description: string;
    declare price: number;
    declare email: string;
    declare photo: string;
}

// User 모델 정의
interface UserAttributes {
    id: number;
    email: string;
    name: string;
}

class User extends Model<UserAttributes> implements UserAttributes {
    declare id: number;
    declare email: string;
    declare name: string;
}

export async function sendEmail(myTimer: Timer, context: InvocationContext): Promise<void> {
    context.log('이메일 발송 함수 시작');

    const brevoApiKey = process.env.BREVO_API_KEY;
    const senderEmail = process.env.SENDER_EMAIL;
    const senderName = process.env.SENDER_NAME || '양파마켓';

    if (!brevoApiKey || !senderEmail) {
        context.error('Brevo 설정이 누락되었습니다.');
        return;
    }

    // DB 연결
    const sequelize = new Sequelize({
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT || '5432'),
        username: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        dialect: 'postgres',
        dialectOptions: {
            ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
        },
        logging: false
    });

    try {
        await sequelize.authenticate();
        context.log('DB 연결 성공');

        // 모델 초기화
        Favorite.init(
            {
                id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
                email: { type: DataTypes.STRING(50), allowNull: false },
                saleId: { type: DataTypes.INTEGER, allowNull: false },
                createdAt: { type: DataTypes.DATE }
            },
            { sequelize, tableName: 'favorite', timestamps: true }
        );

        Sale.init(
            {
                id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
                productName: { type: DataTypes.STRING(50), allowNull: false },
                description: { type: DataTypes.TEXT, allowNull: false },
                price: { type: DataTypes.INTEGER, allowNull: false },
                email: { type: DataTypes.STRING(50), allowNull: false },
                photo: { type: DataTypes.STRING(200), allowNull: false }
            },
            { sequelize, tableName: 'sale', timestamps: true, paranoid: true }
        );

        User.init(
            {
                id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
                email: { type: DataTypes.STRING(50), allowNull: false, unique: true },
                name: { type: DataTypes.STRING(50), allowNull: false }
            },
            { sequelize, tableName: 'user', timestamps: true, paranoid: true }
        );

        // 이틀 전 날짜 계산
        const twoDaysAgo = new Date();
        twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

        // 이틀 안에 좋아요 누른 기록 조회
        const recentFavorites = await Favorite.findAll({
            where: {
                createdAt: {
                    [Op.gte]: twoDaysAgo
                }
            }
        });

        context.log(`이틀 내 좋아요 ${recentFavorites.length}건 발견`);

        if (recentFavorites.length === 0) {
            context.log('발송할 이메일이 없습니다.');
            return;
        }

        // 이메일별로 그룹화
        const emailToFavorites = new Map<string, number[]>();
        for (const fav of recentFavorites) {
            const saleIds = emailToFavorites.get(fav.email) || [];
            saleIds.push(fav.saleId);
            emailToFavorites.set(fav.email, saleIds);
        }

        // Brevo API 클라이언트 초기화
        const apiInstance = new Brevo.TransactionalEmailsApi();
        apiInstance.setApiKey(Brevo.TransactionalEmailsApiApiKeys.apiKey, brevoApiKey);

        // 각 사용자에게 이메일 발송
        for (const [userEmail, saleIds] of emailToFavorites) {
            // 사용자 정보 조회
            const user = await User.findOne({ where: { email: userEmail } });
            if (!user) {
                context.log(`사용자를 찾을 수 없음: ${userEmail}`);
                continue;
            }

            // 찜한 상품 정보 조회
            const sales = await Sale.findAll({
                where: { id: { [Op.in]: saleIds } }
            });

            if (sales.length === 0) {
                context.log(`상품을 찾을 수 없음: ${saleIds.join(', ')}`);
                continue;
            }

            // 이메일 본문 생성
            const productList = sales.map(sale =>
                `- ${sale.productName}: ${sale.price.toLocaleString()}원`
            ).join('\n');

            const htmlContent = `
                <h2>안녕하세요, ${user.name}님!</h2>
                <p>최근 관심을 보여주신 상품이 있어 알려드립니다.</p>
                <h3>찜한 상품 목록:</h3>
                <ul>
                    ${sales.map(sale => `
                        <li>
                            <strong>${sale.productName}</strong> - ${sale.price.toLocaleString()}원
                            <br><small>${sale.description.substring(0, 100)}...</small>
                        </li>
                    `).join('')}
                </ul>
                <p>양파마켓에서 좋은 거래 되세요!</p>
            `;

            try {
                const sendSmtpEmail = new Brevo.SendSmtpEmail();
                sendSmtpEmail.subject = `[양파마켓] ${user.name}님, 찜한 상품을 확인해보세요!`;
                sendSmtpEmail.htmlContent = htmlContent;
                sendSmtpEmail.textContent = `안녕하세요, ${user.name}님!\n\n최근 찜한 상품 목록:\n${productList}\n\n양파마켓에서 좋은 거래 되세요!`;
                sendSmtpEmail.sender = { name: senderName, email: senderEmail };
                sendSmtpEmail.to = [{ email: userEmail, name: user.name }];

                await apiInstance.sendTransacEmail(sendSmtpEmail);
                context.log(`이메일 발송 완료: ${userEmail}`);
            } catch (emailError) {
                context.error(`이메일 발송 실패 (${userEmail}):`, emailError);
            }
        }

        context.log('이메일 발송 작업 완료');
    } catch (error) {
        context.error('오류 발생:', error);
    } finally {
        await sequelize.close();
    }
}

app.timer('sendEmail', {
    schedule: '0 0 9 * * *', // 매일 오전 9시
    handler: sendEmail
});
