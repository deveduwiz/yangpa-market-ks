export interface SignUpDto {
  email: string;
  name: string;
  password: string;
}

export interface SignInDto {
  email: string;
  password: string;
}

export interface CreateSaleDto {
  productName: string;
  description: string;
  price: number;
  email: string;
  photo: string;
}

export interface GetSalesQuery {
  page?: number;
  size?: number;
  /** 판매자 이메일로 거르기 (내 상품 보기) */
  email?: string;
  /** 상품명 부분 일치 검색 */
  query?: string;
  /** isFavorite 계산 기준이 되는 "요청한 회원". email 과 다르니 주의. */
  viewerEmail?: string;
}

/** 목록·상세 응답으로 나가는 상품. 모델 필드 + 화면에 필요한 파생 필드 */
export interface SaleView {
  id: number;
  productName: string;
  description: string;
  price: number;
  email: string;
  photo: string;
  /** Blob Storage 공개 URL. 프론트가 be 를 거치지 않고 직접 받는다.
   *  스토리지 설정이 없으면 null 이고, 이때 프론트는 /image/:filename 으로 폴백한다. */
  photoUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  /** 판매자 이름. user 테이블에서 조인해 온다. */
  sellerName: string | null;
  /** 요청한 회원이 이 상품을 찜했는지 */
  isFavorite: boolean;
  /** 이 상품을 찜한 사람 수 */
  favoriteCount: number;
}

export interface JwtPayload {
  email: string;
}

export interface AppError extends Error {
  status?: number;
}

/** status 를 붙여 던지는 에러를 만드는 헬퍼 */
export const httpError = (message: string, status: number): AppError => {
  const error: AppError = new Error(message);
  error.status = status;
  return error;
};
