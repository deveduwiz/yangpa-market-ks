import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../authContext';
import { useDebounced } from '../useDebounced';
import ViewToggle from '../components/ViewToggle';
import SaleTile from '../components/SaleTile';
import SaleRow from '../components/SaleRow';

const PAGE_SIZE = 10;
const VIEW_KEY = 'yangpa.view';
const SEARCH_DELAY = 300;

export default function SaleList() {
  const { email: myEmail } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const inputRef = useRef(null);

  // 보기 방식은 URL이 아니라 취향이므로 localStorage에 남긴다
  const [view, setView] = useState(
    () => localStorage.getItem(VIEW_KEY) ?? 'card',
  );

  const changeView = (next) => {
    setView(next);
    localStorage.setItem(VIEW_KEY, next);
  };

  const page = Number(searchParams.get('page')) || 1;
  const mine = searchParams.get('mine') === '1';
  const query = searchParams.get('q') ?? '';

  // 입력창은 즉시 반응해야 하므로 로컬 state로 두고,
  // 실제 요청은 디바운스된 값으로만 보낸다.
  const [input, setInput] = useState(query);
  const debouncedInput = useDebounced(input, SEARCH_DELAY);

  // 뒤로가기 등으로 URL이 바뀌면 입력창도 따라가야 한다.
  // effect가 아니라 렌더 중에 맞추는 게 React 권장 방식 — 깜빡임 없이 즉시 반영된다.
  const [syncedQuery, setSyncedQuery] = useState(query);
  if (query !== syncedQuery) {
    setSyncedQuery(query);
    setInput(query);
  }

  // 디바운스가 끝나면 URL에 반영한다. URL이 곧 검색 상태라 새로고침·공유가 된다.
  useEffect(() => {
    if (debouncedInput === query) return;

    const params = new URLSearchParams(searchParams);
    if (debouncedInput.trim()) params.set('q', debouncedInput);
    else params.delete('q');
    params.set('page', '1'); // 검색어가 바뀌면 1페이지로
    setSearchParams(params, { replace: true }); // 타이핑마다 히스토리를 쌓지 않는다
  }, [debouncedInput, query, searchParams, setSearchParams]);

  const [state, setState] = useState({
    status: 'loading',
    items: [],
    count: 0,
    error: '',
  });

  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      try {
        const data = await api.listSales({
          page,
          size: PAGE_SIZE,
          email: mine ? myEmail : undefined,
          productName: query || undefined,
          signal: controller.signal,
        });
        setState({
          status: 'done',
          items: data.documents ?? [],
          count: data.count ?? 0,
          error: '',
        });
      } catch (err) {
        // 다음 요청이 시작돼 취소된 경우는 에러가 아니다
        if (err.name === 'AbortError') return;
        setState({ status: 'error', items: [], count: 0, error: err.message });
      }
    })();

    // 이전 요청을 취소해야 늦게 도착한 응답이 최신 결과를 덮어쓰지 않는다
    return () => controller.abort();
  }, [page, mine, myEmail, query]);

  const setPage = (next) => {
    const params = new URLSearchParams(searchParams);
    params.set('page', String(next));
    setSearchParams(params);
  };

  const clearSearch = () => {
    setInput('');
    inputRef.current?.focus();
  };

  const toggleMine = () => {
    const params = new URLSearchParams(searchParams);
    if (mine) params.delete('mine');
    else params.set('mine', '1');
    params.set('page', '1');
    setSearchParams(params);
  };

  const lastPage = Math.max(1, Math.ceil(state.count / PAGE_SIZE));

  return (
    <div className="stack">
      <div className="list-head">
        <h1>상품 목록</h1>
        <div className="list-head__actions">
          <ViewToggle value={view} onChange={changeView} />
          <button
            type="button"
            className={`btn btn--ghost${mine ? ' is-active' : ''}`}
            onClick={toggleMine}
          >
            내 상품만
          </button>
          <Link to="/sales/new" className="btn btn--primary">
            상품 등록
          </Link>
        </div>
      </div>

      <div className="search-sticky">
        <div className="search">
          <svg
            className="search__icon"
            viewBox="0 0 20 20"
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <circle cx="9" cy="9" r="6" />
            <path d="m13.5 13.5 3.5 3.5" strokeLinecap="round" />
          </svg>

          <input
            ref={inputRef}
            type="search"
            className="search__input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="상품명으로 검색"
            aria-label="상품명 검색"
          />

          {input && (
            <button
              type="button"
              className="search__clear"
              onClick={clearSearch}
              aria-label="검색어 지우기"
            >
              &times;
            </button>
          )}
        </div>
      </div>

      {query && state.status === 'done' && (
        <p className="muted">
          &lsquo;{query}&rsquo; 검색 결과 {state.count}건
        </p>
      )}

      {state.status === 'loading' && <p className="muted">불러오는 중...</p>}

      {state.status === 'error' && (
        <p className="alert alert--error">{state.error}</p>
      )}

      {state.status === 'done' && state.items.length === 0 && (
        <p className="muted">
          {query
            ? `'${query}'와 일치하는 상품이 없습니다.`
            : '등록된 상품이 없습니다.'}
        </p>
      )}

      {state.items.length > 0 && view === 'card' && (
        <ul className="grid">
          {state.items.map((sale) => (
            <SaleTile
              key={sale.id}
              sale={sale}
              onFavoriteToggle={(next) =>
                setState((prev) => ({
                  ...prev,
                  items: prev.items.map((s) =>
                    s.id === sale.id ? { ...s, isFavorite: next } : s
                  ),
                }))
              }
            />
          ))}
        </ul>
      )}

      {state.items.length > 0 && view === 'list' && (
        <ul className="rows">
          {state.items.map((sale) => (
            <SaleRow
              key={sale.id}
              sale={sale}
              onFavoriteToggle={(next) =>
                setState((prev) => ({
                  ...prev,
                  items: prev.items.map((s) =>
                    s.id === sale.id ? { ...s, isFavorite: next } : s
                  ),
                }))
              }
            />
          ))}
        </ul>
      )}

      {state.count > PAGE_SIZE && (
        <nav className="pager">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => setPage(page - 1)}
            disabled={page <= 1}
          >
            이전
          </button>
          <span className="muted">
            {page} / {lastPage}
          </span>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => setPage(page + 1)}
            disabled={page >= lastPage}
          >
            다음
          </button>
        </nav>
      )}
    </div>
  );
}
