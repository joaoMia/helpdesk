export function TicketPagination({
  page,
  total,
  pageSize = 10,
  busy,
  onPage,
}: {
  page: number;
  total: number;
  pageSize?: number;
  busy: boolean;
  onPage: (page: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-4 p-5">
      <button
        className="button-secondary"
        disabled={busy || page <= 1}
        onClick={() => onPage(page - 1)}
      >
        Anterior
      </button>
      <span className="text-sm">
        Página {page} · {total} registro(s)
      </span>
      <button
        className="button-secondary"
        disabled={busy || page * pageSize >= total}
        onClick={() => onPage(page + 1)}
      >
        Próxima
      </button>
    </div>
  );
}
