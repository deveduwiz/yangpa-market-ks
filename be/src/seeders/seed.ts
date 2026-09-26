import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcrypt';
import {
  sequelize,
  User,
  Sale,
  createDatabaseIfNotExists,
} from '../models/index.js';
import config from '../config/config.js';
import { uploadFile, isAzureStorage } from '../services/storage.service.js';
import mime from 'mime-types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SAMPLE_IMAGE_DIR = path.join(__dirname, '../../seed-images');

interface UserData {
  email: string;
  name: string;
  password: string;
}

interface ProductData {
  productName: string;
  description: string;
  price: number;
  image: string;
}

const users: UserData[] = [
  { email: 'son@example.com', name: '손흥민', password: '1234' },
  { email: 'seller1@example.com', name: '판매자1', password: '1234' },
  { email: 'seller2@example.com', name: '판매자2', password: '1234' },
  { email: 'seller3@example.com', name: '판매자3', password: '1234' },
];

const products: ProductData[] = [
  {
    productName: 'LG 이동식 에어컨',
    description:
      'LG 이동식 에어컨 PQ09RAWKF1 모델입니다. \n한 시즌만 사용했고 냉방/제습 성능 좋아요. 필터 세척 완료, 리모컨 포함. 직거래 선호합니다.',
    price: 350000,
    image: 'lg-aircon.jpeg',
  },
  {
    productName: 'LG 그램 노트북',
    description:
      'LG 그램 17인치 2023년형. i7-1360P / 16GB / 512GB. \n배터리 사이클 47회로 거의 새것입니다. 충전기, 박스 포함.',
    price: 800000,
    image: 'lg-gram.jpg',
  },
  {
    productName: 'LG 모니터',
    description:
      'LG 32UN880 4K 모니터. USB-C 원케이블 연결 지원, 에르고 스탠드라 높이/각도 조절 가능해요. \n박스, 케이블 있습니다.',
    price: 250000,
    image: 'lg-monitor.jpeg',
  },
  {
    productName: 'Bose 블루투스 스피커',
    description:
      'Bose SoundLink Revolve+ II입니다. 360도 사운드에 배터리 17시간, 방수 지원돼요. \n충전 크레이들 포함, 색상 블랙.',
    price: 120000,
    image: 'bose-speaker.avif',
  },
  {
    productName: '남성 지갑',
    description:
      '몽블랑 사토리얼 반지갑. 선물 받았는데 안 써서 새것이에요. 이탈리아산 소가죽, 카드 6칸. 박스, 더스트백 있습니다.',
    price: 45000,
    image: 'wallet.jpg',
  },
  {
    productName: '애플워치',
    description:
      '애플워치 SE 2세대 44mm GPS. 미드나이트 색상, 배터리 99%. 케이스 끼워서 사용해서 깨끗해요. \n충전기, 박스, 밴드 2개.',
    price: 280000,
    image: 'apple-watch.jpg',
  },
  {
    productName: '청바지',
    description:
      '리바이스 501 오리지널. 사이즈 30x32, 미디엄 인디고. 한 번 입어보고 안 맞아서 세탁도 안 한 새것급이에요.',
    price: 35000,
    image: 'jeans.jpg',
  },
  {
    productName: '맥북프로',
    description:
      '맥북프로 14인치 M3 Pro / 18GB / 512GB. 스페이스 블랙. 애플케어+ 2026년 3월까지, 배터리 사이클 32회. 풀박스.',
    price: 2500000,
    image: 'macbook-pro.jpeg',
  },
  {
    productName: '선풍기',
    description:
      '다이슨 쿨 AM07 타워 선풍기. 날개 없어서 안전하고 청소 편해요. \n10단계 풍량, 슬립타이머. 본체, 리모컨만 있어요.',
    price: 150000,
    image: 'fan.jpeg',
  },
  {
    productName: '쿠쿠 밥솥',
    description:
      '쿠쿠 IH 전기압력밥솥 10인용. IH 방식이라 밥맛 좋아요. 1년 반 사용, 패킹 교체한지 6개월. 박스, 설명서 있습니다.',
    price: 80000,
    image: 'rice-cooker.jpeg',
  },
  {
    productName: '갤럭시폴드8',
    description:
      '갤럭시 폴드8 256GB 실버 섀도우. 자급제 공기계, 3개월 사용. \n외관 깨끗하고 삼성케어+ 9개월 남았습니다. 풀박스.',
    price: 2500000,
    image: 'galaxy-fold.jpeg',
  },
  {
    productName: '맥세이프 보조배터리',
    description:
      '애플 정품 맥세이프 배터리 팩. 자석으로 붙여서 무선 충전돼요. \n6개월 사용, 상태 깨끗합니다. 본품만 있어요.',
    price: 85000,
    image: 'magsafe-battery.jpg',
  },
  {
    productName: '에어포스',
    description:
      "나이키 에어포스 1 '07 로우 화이트 270. \n5번 정도 신어서 밑창 살짝 닳은 것 외엔 깨끗해요. \n박스 있습니다.",
    price: 95000,
    image: 'airforce.avif',
  },
];

const uploadImages = async (): Promise<void> => {
  const storageType = isAzureStorage() ? 'Azure' : 'Local';
  const files = fs.readdirSync(SAMPLE_IMAGE_DIR);
  for (const file of files) {
    if (file.startsWith('.')) continue;
    const filePath = path.join(SAMPLE_IMAGE_DIR, file);
    const buffer = fs.readFileSync(filePath);
    const contentType = mime.lookup(file) || 'application/octet-stream';
    await uploadFile(buffer, file, contentType);
    console.log(`Uploaded to ${storageType}: ${file}`);
  }
};

const seed = async (): Promise<void> => {
  try {
    await createDatabaseIfNotExists();
    await sequelize.sync({ force: true });
    console.log('DB 초기화 완료');

    await uploadImages();
    console.log(`이미지 업로드 완료 (${isAzureStorage() ? 'Azure' : 'Local'})`);

    for (const user of users) {
      const hashedPassword = await bcrypt.hash(
        user.password,
        config.bcrypt.saltRounds,
      );
      await User.create({ ...user, password: hashedPassword });
    }
    console.log('사용자 생성 완료');

    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      const user = users[i % users.length];
      await Sale.create({
        productName: product.productName,
        description: product.description,
        price: product.price,
        email: user.email,
        photo: product.image,
      });
    }
    console.log('상품 생성 완료');

    console.log('\nSeeding 완료!');
    console.log('테스트 계정: seller1@example.com / 1234');
    process.exit(0);
  } catch (error) {
    console.error('Seeding 실패:', error);
    process.exit(1);
  }
};

seed();
