// Fetch every authorized API page internally; native selects never lose options
// simply because an item wasn't on the first server page.
export async function loadAllOptions<T extends { id: string }>(
  fetchPage: (
    page: number,
  ) => Promise<{ items: T[]; total: number; pageSize: number }>,
  cancelled: () => boolean = () => false,
) {
  const options = new Map<string, T>();
  for (let page = 1; ; page++) {
    if (cancelled()) return [];
    const result = await fetchPage(page);
    for (const item of result.items) options.set(item.id, item);
    if (page * result.pageSize >= result.total) return [...options.values()];
    if (!result.items.length) throw new Error('Paginação incompleta.');
  }
}
