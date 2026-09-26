// be의 라우터와 1:1로 대응하는 얇은 fetch 래퍼.
// 백엔드 호스트는 .env 의 VITE_API_BASE_URL 로 관리한다 (BE에서 CORS 허용).

// 끝의 / 는 제거해서 `${BASE}/sales` 처럼 항상 한 번만 붙게 한다.
// 개발 환경에서 환경변수가 없으면 localhost:3000 사용
const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const apiUrl = (path) => `${API_BASE}${path}`;
const TOKEN_KEY = 'yangpa.token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token) => localStorage.setItem(TOKEN_KEY, token);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

// 토큰 만료/위조로 서버가 401·403을 주면 AuthProvider가 등록한 핸들러를 부른다.
// api.js가 라우터를 직접 알 필요가 없도록 콜백으로 뺐다.
let onUnauthorized = null;
export const setUnauthorizedHandler = (fn) => {
  onUnauthorized = fn;
};

async function request(
  path,
  { method = 'GET', body, auth = false, signal } = {},
) {
  const headers = {};
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  // FormData면 Content-Type을 직접 지정하지 않는다.
  // 브라우저가 multipart boundary를 붙여야 multer가 파싱할 수 있다.
  const isFormData = body instanceof FormData;
  if (body && !isFormData) headers['Content-Type'] = 'application/json';

  const res = await fetch(apiUrl(path), {
    method,
    headers,
    body: isFormData ? body : body ? JSON.stringify(body) : undefined,
    signal,
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    // 에러 핸들러가 JSON을 못 주는 경우 대비
  }

  if (!res.ok) {
    // be의 authorization 미들웨어는 토큰이 없으면 401, 유효하지 않으면 403을 준다
    if (auth && (res.status === 401 || res.status === 403)) {
      onUnauthorized?.();
    }
    throw new ApiError(
      data?.message ?? `요청 실패 (${res.status})`,
      res.status,
    );
  }
  return data;
}

export const api = {
  signUp: ({ email, name, password }) =>
    request('/members/sign-up', {
      method: 'POST',
      body: { email, name, password },
    }),

  signIn: ({ email, password }) =>
    request('/members/sign-in', {
      method: 'POST',
      body: { email, password },
    }),

  /** 내 정보 (이름, 가입일, 카운트) */
  me: (signal) =>
    request('/members/me', { auth: true, signal }).then((r) => r.member),

  // be: app.use('/sales', auth, salesRouter) — 조회에도 토큰이 필요하다
  listSales: ({ page = 1, size = 10, email, productName, signal } = {}) => {
    const qs = new URLSearchParams({ page, size });
    if (email) qs.set('email', email);
    if (productName) qs.set('productName', productName);
    return request(`/sales?${qs}`, { auth: true, signal });
  },

  /** 내가 찜한 상품 목록 */
  listFavorites: ({ page = 1, size = 10, signal } = {}) => {
    const qs = new URLSearchParams({ page, size });
    return request(`/sales/favorites?${qs}`, { auth: true, signal });
  },

  getSale: (id) => request(`/sales/${id}`, { auth: true }),

  createSale: ({ productName, description, price, photo }) => {
    const form = new FormData();
    form.append('productName', productName);
    form.append('description', description);
    form.append('price', price);
    form.append('photo', photo); // multer upload.single('photo')
    return request('/sales', { method: 'POST', body: form, auth: true });
  },

  deleteSale: (id) => request(`/sales/${id}`, { method: 'DELETE', auth: true }),

  /** 찜 토글 */
  setFavorite: (id, next) =>
    request(`/sales/${id}/favorite`, {
      method: next ? 'POST' : 'DELETE',
      auth: true,
    }),
};

// 이미지는 Azure Blob Storage 에서 브라우저가 직접 받는다.
// be 가 내려주는 sale.photoUrl 이 blob 공개 URL이고, be 를 거치지 않으므로
// App Service 대역폭을 쓰지 않고 지연도 짧다.
//
// photoUrl 이 없거나 상대 경로(/image/...)면 be 경유로 폴백한다.
export const imageUrl = (sale) => {
  if (!sale) return '';
  // 파일명 문자열로 넘어오던 예전 호출도 계속 동작하게 둔다
  if (typeof sale === 'string') return apiUrl(`/image/${encodeURIComponent(sale)}`);
  if (sale.photoUrl) {
    // 상대 경로(/image/...)면 백엔드 URL을 붙인다
    if (sale.photoUrl.startsWith('/')) return apiUrl(sale.photoUrl);
    return sale.photoUrl;
  }
  if (sale.photo) return apiUrl(`/image/${encodeURIComponent(sale.photo)}`);
  return '';
};
