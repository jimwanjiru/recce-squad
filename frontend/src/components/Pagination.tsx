import { Button } from "./ui/button";
export function Pagination({
  page,
  pageSize,
  total,
  onPage,
  onSize,
  label,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  onSize?: (size: number) => void;
  label: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <nav className="pagination-controls" aria-label={label}>
      <span>
        {total === 0
          ? "No records"
          : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}`}{" "}
        · Page {page} of {pages}
      </span>
      <div>
        {onSize && (
          <label>
            Rows{" "}
            <select
              aria-label={label + " rows per page"}
              value={pageSize}
              onChange={(e) => onSize(Number(e.target.value))}
            >
              {[5, 10, 25, 50].map((size) => (
                <option key={size}>{size}</option>
              ))}
            </select>
          </label>
        )}
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
        >
          Next
        </Button>
      </div>
    </nav>
  );
}
