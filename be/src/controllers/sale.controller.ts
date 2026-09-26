import { Request, Response, NextFunction } from 'express';
import * as saleService from '../services/sale.service.js';

type IdParams = { id: string };

const toInt = (value: unknown, fallback: number): number => {
  const n = parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export const createSale = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ message: 'photo가 필요합니다.' });
      return;
    }

    const { productName, description, price } = req.body;
    const email = req.email!;
    // Azure: blobName, Local: filename
    const file = req.file as Express.Multer.File & { blobName?: string };
    const photo = file.blobName ?? file.filename;

    const sale = await saleService.createSale({
      productName,
      description,
      price: parseInt(price, 10),
      email,
      photo,
    });

    res.status(201).json({
      success: true,
      document: sale,
      message: 'post 등록 성공',
    });
  } catch (error) {
    next(error);
  }
};

export const getSales = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { page, size, email, query, productName } = req.query;

    const result = await saleService.getSales({
      page: toInt(page, 1),
      size: toInt(size, 10),
      email: (email as string) || undefined,
      // fe 는 productName, 명세는 query 로 보내고 있어서 둘 다 받는다
      query: ((query as string) || (productName as string)) || undefined,
      viewerEmail: req.email,
    });

    res.status(200).json({ success: true, ...result, message: 'sales 조회성공' });
  } catch (error) {
    next(error);
  }
};

/** GET /sales/favorites — 반드시 /sales/:id 보다 먼저 라우팅되어야 한다 */
export const getFavorites = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { page, size } = req.query;

    const result = await saleService.getFavorites({
      page: toInt(page, 1),
      size: toInt(size, 10),
      viewerEmail: req.email,
    });

    res.status(200).json({ success: true, ...result, message: '찜 목록 조회성공' });
  } catch (error) {
    next(error);
  }
};

export const getSaleById = async (
  req: Request<IdParams>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const documents = await saleService.getSaleById(parseInt(req.params.id, 10), req.email);
    res.status(200).json({ success: true, documents, message: 'sale 조회성공' });
  } catch (error) {
    next(error);
  }
};

export const deleteSale = async (
  req: Request<IdParams>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    await saleService.deleteSale(parseInt(req.params.id, 10), req.email!);
    res.status(200).json({ success: true, message: '상품을 삭제했습니다.' });
  } catch (error) {
    next(error);
  }
};

export const addFavorite = async (
  req: Request<IdParams>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const favoriteCount = await saleService.addFavorite(parseInt(req.params.id, 10), req.email!);
    res.status(200).json({ success: true, isFavorite: true, favoriteCount });
  } catch (error) {
    next(error);
  }
};

export const removeFavorite = async (
  req: Request<IdParams>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const favoriteCount = await saleService.removeFavorite(parseInt(req.params.id, 10), req.email!);
    res.status(200).json({ success: true, isFavorite: false, favoriteCount });
  } catch (error) {
    next(error);
  }
};
