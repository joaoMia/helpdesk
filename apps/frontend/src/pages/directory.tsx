import { useState } from 'react';
import { directoryExamples } from '../mocks/directories';
import { EmptyState, Icon, PageHeading } from '../components/ui';

export function Directory({ page }: { page: string }) {
  const [query, setQuery] = useState('');
  const [activeOnly, setActiveOnly] = useState(false);
  const data = directoryExamples[page as keyof typeof directoryExamples];
  if (!data) return null;
  const rows = data.rows.filter(
    (row) =>
      row
        .join(' ')
        .toLocaleLowerCase('pt-BR')
        .includes(query.toLocaleLowerCase('pt-BR')) &&
      (!activeOnly || row.at(-1) === 'Ativo'),
  );
  return (
    <>
      <PageHeading
        eyebrow="ADMINISTRAÇÃO · CONSULTA DEMONSTRATIVA"
        title={data.title}
        description={data.subtitle}
      />
      <p className="info-note mb-6">
        Cadastros somente para visualização nesta prévia. Criação, edição,
        exclusão e permissões reais serão implementadas nas tarefas
        correspondentes.
      </p>
      <section className="panel">
        <div className="filter-bar">
          <label className="search-field">
            <Icon name="search" />
            <span className="sr-only">Buscar em {data.title}</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Buscar em ${data.title.toLocaleLowerCase('pt-BR')}`}
            />
          </label>
          {page !== 'jornadas' && (
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                className="accent-teal-700"
                type="checkbox"
                checked={activeOnly}
                onChange={(e) => setActiveOnly(e.target.checked)}
              />
              Somente ativos
            </label>
          )}
        </div>
        {rows.length ? (
          <div className="table-scroll">
            <p className="px-6 py-3 text-xs text-slate-500 sm:hidden">
              Deslize a tabela para ver todas as colunas →
            </p>
            <table className="directory-table">
              <caption className="sr-only">{data.title} fictícios</caption>
              <thead>
                <tr>
                  {data.columns.map((column) => (
                    <th key={column}>{column}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row[0]}>
                    {row.map((cell, index) => (
                      <td key={index}>
                        {index === 0 ? (
                          <span className="font-medium text-slate-800">
                            {cell}
                          </span>
                        ) : cell === 'Ativo' || cell === 'Inativo' ? (
                          <span
                            className={`badge ${cell === 'Ativo' ? 'status-closed' : 'status-open'}`}
                          >
                            {cell}
                          </span>
                        ) : (
                          cell
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="Nenhum resultado encontrado">
            <p>Altere a busca para explorar os exemplos.</p>
          </EmptyState>
        )}
        <div className="table-footer">
          {rows.length} registros demonstrativos<span>Somente leitura</span>
        </div>
      </section>
    </>
  );
}
