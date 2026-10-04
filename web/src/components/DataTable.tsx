import { useMemo, useState, type ReactNode } from 'react';

export interface Column<T> {
  key: string;
  label: string;
  numeric?: boolean;
  sortValue: (row: T) => number | string | null;
  render?: (row: T) => ReactNode;
}

/** Sortable table; empty values always sort last. Scrolls sideways inside its own box. */
export function DataTable<T>({
  rows,
  columns,
  rowKey,
  initialSort,
  caption,
  limit,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string | number;
  initialSort: { key: string; dir: 'asc' | 'desc' };
  caption?: string;
  /** Show only this many rows until the reader asks for the rest. */
  limit?: number;
}) {
  const [sort, setSort] = useState(initialSort);
  const [showAll, setShowAll] = useState(false);

  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return rows;
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = col.sortValue(a);
      const vb = col.sortValue(b);
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
      return String(va).localeCompare(String(vb)) * dir;
    });
  }, [rows, columns, sort]);

  const toggle = (key: string, numeric?: boolean) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: numeric ? 'desc' : 'asc' }));

  const visible = limit && !showAll ? sorted.slice(0, limit) : sorted;

  return (
    <>
      <div className="table-wrap">
        <table className="table">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead>
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={c.numeric ? 'num' : undefined}
                  aria-sort={sort.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                >
                  <button type="button" className="th-btn" onClick={() => toggle(c.key, c.numeric)}>
                    {c.label}
                    <span className="sort-mark" aria-hidden="true">
                      {sort.key === c.key ? (sort.dir === 'asc' ? '▲' : '▼') : ''}
                    </span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={rowKey(row)}>
                {columns.map((c) => (
                  <td key={c.key} className={c.numeric ? 'num' : undefined}>
                    {c.render ? c.render(row) : (c.sortValue(row) ?? '—')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {limit !== undefined && rows.length > limit && (
        <button className="btn btn-quiet table-more" type="button" onClick={() => setShowAll((v) => !v)}>
          {showAll ? `Show first ${limit}` : `Show all ${rows.length}`}
        </button>
      )}
    </>
  );
}
