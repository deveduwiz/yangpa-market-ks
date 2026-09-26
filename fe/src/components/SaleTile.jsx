import { Link } from 'react-router-dom';
import { imageUrl } from '../api.js';
import HeartButton from './HeartButton';

const won = (n) => `${Number(n).toLocaleString('ko-KR')}원`;

export default function SaleTile({ sale, onFavoriteToggle }) {
  return (
    <li className="tile-wrap">
      <Link to={`/sales/${sale.id}`} className="tile">
        <img
          src={imageUrl(sale)}
          alt={sale.productName}
          className="tile__img"
          loading="lazy"
        />
        <div className="tile__body">
          <h2 className="tile__title">{sale.productName}</h2>
          <p className="tile__price">{won(sale.price)}</p>
          <p className="tile__meta">{sale.sellerName ?? sale.email}</p>
        </div>
      </Link>
      <HeartButton
        saleId={sale.id}
        isFavorite={sale.isFavorite}
        count={sale.favoriteCount ?? 0}
        onToggle={onFavoriteToggle}
      />
    </li>
  );
}
