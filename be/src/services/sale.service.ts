import { Op, WhereOptions } from 'sequelize';
import { Favorite, Sale, User } from '../models/index.js';
import { SaleAttributes } from '../models/sale.js';
import {
  CreateSaleDto,
  GetSalesQuery,
  SaleView,
  httpError,
} from '../types/index.js';
import { getFileUrl } from './storage.service.js';

interface SaleListResult {
  documents: SaleView[];
  count: number;
  /** 다음 페이지가 남아 있는지. 클라이언트 무한스크롤이 count 로 계산하지 않아도 되게. */
  hasNext: boolean;
  page: number;
  size: number;
}

/** Sale 인스턴스에 판매자 이름과 찜 정보를 붙여 평평한 객체로 만든다. */
const toView = (
  sale: Sale,
  favoritedIds: Set<number>,
  favoriteCounts: Map<number, number>,
): SaleView => {
  const plain = sale.get({ plain: true }) as SaleAttributes & {
    User?: { name: string };
  };
  return {
    id: plain.id,
    productName: plain.productName,
    description: plain.description,
    price: plain.price,
    email: plain.email,
    photo: plain.photo,
    photoUrl: getFileUrl(plain.photo),
    createdAt: plain.createdAt as Date,
    updatedAt: plain.updatedAt as Date,
    sellerName: plain.User?.name ?? null,
    isFavorite: favoritedIds.has(plain.id),
    favoriteCount: favoriteCounts.get(plain.id) ?? 0,
  };
};

/**
 * 상품 목록에 찜 정보를 채워 넣는다.
 * 목록 쿼리에 favorite 을 조인하면 limit 과 엉키기 때문에,
 * 페이지에 실제로 담긴 id 들만 모아 두 번의 가벼운 쿼리로 해결한다.
 */
const attachFavorites = async (
  sales: Sale[],
  viewerEmail?: string,
): Promise<SaleView[]> => {
  if (sales.length === 0) return [];

  const ids = sales.map((s) => s.id);

  const [mine, all] = await Promise.all([
    viewerEmail
      ? Favorite.findAll({
          where: { email: viewerEmail, saleId: { [Op.in]: ids } },
        })
      : Promise.resolve([] as Favorite[]),
    Favorite.findAll({
      where: { saleId: { [Op.in]: ids } },
      attributes: ['saleId'],
    }),
  ]);

  const favoritedIds = new Set(mine.map((f) => f.saleId));
  const favoriteCounts = new Map<number, number>();
  all.forEach((f) =>
    favoriteCounts.set(f.saleId, (favoriteCounts.get(f.saleId) ?? 0) + 1),
  );

  return sales.map((s) => toView(s, favoritedIds, favoriteCounts));
};

const sellerInclude = [{ model: User, attributes: ['name'] }];

export const createSale = async (dto: CreateSaleDto): Promise<Sale> => {
  return Sale.create(dto);
};

export const getSales = async ({
  page = 1,
  size = 10,
  email,
  query,
  viewerEmail,
}: GetSalesQuery): Promise<SaleListResult> => {
  const where: WhereOptions<SaleAttributes> = {};

  if (email) where.email = email;
  if (query) where.productName = { [Op.like]: `%${query}%` };

  const offset = (page - 1) * size;

  const { rows, count } = await Sale.findAndCountAll({
    where,
    include: sellerInclude,
    order: [['createdAt', 'DESC']],
    limit: size,
    offset,
  });

  return {
    documents: await attachFavorites(rows, viewerEmail),
    count,
    hasNext: offset + rows.length < count,
    page,
    size,
  };
};

/**
 * 단건 조회. 기존 클라이언트(fe)가 배열을 기대하므로 배열로 돌려준다.
 * (컨트롤러에서 documents 로 그대로 내보낸다)
 */
export const getSaleById = async (
  id: number,
  viewerEmail?: string,
): Promise<SaleView[]> => {
  const sales = await Sale.findAll({ where: { id }, include: sellerInclude });
  return attachFavorites(sales, viewerEmail);
};

/** 내가 올린 상품만 지울 수 있다. */
export const deleteSale = async (id: number, email: string): Promise<void> => {
  const sale = await Sale.findByPk(id);
  if (!sale) throw httpError('상품을 찾을 수 없습니다.', 404);
  if (sale.email !== email)
    throw httpError('본인이 등록한 상품만 삭제할 수 있습니다.', 403);

  // 상품이 사라지면 그 상품을 가리키던 찜도 의미가 없다
  await Favorite.destroy({ where: { saleId: id } });
  await sale.destroy();
};

/** 찜 추가. 이미 찜한 상태에서 또 눌러도 에러가 아니다(멱등). */
export const addFavorite = async (
  saleId: number,
  email: string,
): Promise<number> => {
  const sale = await Sale.findByPk(saleId);
  if (!sale) throw httpError('상품을 찾을 수 없습니다.', 404);

  await Favorite.findOrCreate({
    where: { email, saleId },
    defaults: { email, saleId },
  });
  return Favorite.count({ where: { saleId } });
};

/** 찜 해제. 없던 것을 지워도 에러가 아니다(멱등). */
export const removeFavorite = async (
  saleId: number,
  email: string,
): Promise<number> => {
  await Favorite.destroy({ where: { email, saleId } });
  return Favorite.count({ where: { saleId } });
};

/** 내가 찜한 상품 목록. 최근에 찜한 순. */
export const getFavorites = async ({
  page = 1,
  size = 10,
  viewerEmail,
}: GetSalesQuery): Promise<SaleListResult> => {
  if (!viewerEmail) throw httpError('로그인이 필요합니다.', 401);

  const offset = (page - 1) * size;

  const { rows, count } = await Favorite.findAndCountAll({
    where: { email: viewerEmail },
    order: [['createdAt', 'DESC']],
    limit: size,
    offset,
  });
  //
  // 찜 순서를 유지해야 하므로 id 순서대로 다시 정렬한다
  const ids = rows.map((f) => f.saleId);
  const sales = ids.length
    ? await Sale.findAll({
        where: { id: { [Op.in]: ids } },
        include: sellerInclude,
      })
    : [];
  const byId = new Map(sales.map((s) => [s.id, s]));
  const ordered = ids
    .map((id) => byId.get(id))
    .filter((s): s is Sale => Boolean(s));

  return {
    documents: await attachFavorites(ordered, viewerEmail),
    count,
    hasNext: offset + rows.length < count,
    page,
    size,
  };
};

/** 마이 화면 뱃지용 카운트 */
export const countByEmail = async (email: string) => {
  const [sales, favorites] = await Promise.all([
    Sale.count({ where: { email } }),
    Favorite.count({ where: { email } }),
  ]);
  return { sales, favorites };
};
