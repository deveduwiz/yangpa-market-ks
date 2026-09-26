import { Link } from 'react-router-dom';
import { api, imageUrl } from '../api.js';

const won = (n) => `${Number(n).toLocaleString('ko-KR')}원`;
const day = (d) =>
  new Date(d).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });

export default function SaleRow({ sale, onFavoriteToggle }) {
  const handleHeartClick = async () => {
    const next = !sale.isFavorite;
    onFavoriteToggle(next);
    try {
      await api.setFavorite(sale.id, next);
    } catch {
      onFavoriteToggle(!next);
    }
  };

  return (
    <li className="row-wrap">
      <Link to={`/sales/${sale.id}`} className="row">
        <img
          src={imageUrl(sale)}
          alt={sale.productName}
          className="row__img"
          loading="lazy"
        />
        <div className="row__body">
          <h2 className="row__title">{sale.productName}</h2>
          <p className="row__desc">{sale.description}</p>
          <p className="row__meta">
            {sale.sellerName ?? sale.email}
            <span className="row__dot" aria-hidden="true" />
            {day(sale.createdAt)}
            {sale.favoriteCount > 0 && (
              <>
                <span className="row__dot" aria-hidden="true" />
                관심 {sale.favoriteCount}
              </>
            )}
          </p>
        </div>
        <p className="row__price">{won(sale.price)}</p>
      </Link>
      <button
        type="button"
        className={`row__heart${sale.isFavorite ? ' row__heart--active' : ''}`}
        onClick={handleHeartClick}
        aria-label={sale.isFavorite ? '찜 해제' : '찜하기'}
      >
        <svg viewBox="0 0 24 24" width="18" height="18">
          {sale.isFavorite ? (
            <path
              fill="currentColor"
              d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
            />
          ) : (
            <path
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
            />
          )}
        </svg>
      </button>
    </li>
  );
}
