import type { ReactNode } from 'react';
import type { Priority, Status } from '../types/demo';
import { statusLabels, priorityLabels } from '../lib/presentation';

const paths = {
  trash: 'M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7',
  grid: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  ticket: 'M4 5h16v5a2 2 0 0 0 0 4v5H4v-5a2 2 0 0 0 0-4z M15 8v2 M15 14v2',
  users:
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M16 3a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  tool: 'M14 6a5 5 0 0 0-6 6L3 17a2.8 2.8 0 0 0 4 4l5-5a5 5 0 0 0 6-6l-3 3-4-4z',
  clock: 'M12 8v4l3 2 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  pause: 'M9 7v10 M15 7v10 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  plus: 'M12 5v14 M5 12h14',
  search: 'M21 21l-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  arrow: 'M5 12h14 M13 6l6 6-6 6',
  check: 'M5 12l4 4L19 6',
  menu: 'M3 6h18 M3 12h18 M3 18h18',
  close: 'M6 6l12 12 M18 6L6 18',
  chevron: 'M9 5l7 7-7 7',
  paper: 'M21 11l-8 8a6 6 0 0 1-8-8l9-9a4 4 0 0 1 6 6l-9 9a2 2 0 0 1-3-3l8-8',
  image: 'M3 4h18v16H3z M3 17l5-5 4 4 3-3 6 5 M8 8h.01',
  document: 'M5 3h10l4 4v14H5z M14 3v5h5 M8 13h8 M8 17h8',
  sheet: 'M4 4h16v16H4z M4 9h16 M4 14h16 M10 9v11',
};
export function BrandMark() {
  return (
    <svg
      className="brand-mark"
      viewBox="0 0 36 36"
      fill="none"
      stroke="#00d5be"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3.5 5.5h29v7a4 4 0 0 0 0 8v7h-29v-7a4 4 0 0 0 0-8z M24 10v4 M24 20v4" />
    </svg>
  );
}
export function Icon({
  name,
  className = '',
}: {
  name: keyof typeof paths;
  className?: string;
}) {
  return (
    <svg
      className={`size-5 shrink-0 ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
export function StatusBadge({ status }: { status: Status | 'RESOLVED' }) {
  return (
    <span
      className={`badge status-${status === 'RESOLVED' ? 'in_progress' : status.toLowerCase()}`}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {status === 'RESOLVED' ? 'Resolvido' : statusLabels[status]}
    </span>
  );
}
export function PriorityBadge({ priority }: { priority: Priority | null }) {
  return (
    <span className={`priority priority-${priority?.toLowerCase() ?? 'none'}`}>
      {priority ? (
        <span aria-hidden="true">
          {priority === 'HIGH' ? '↑' : priority === 'LOW' ? '↓' : '−'}
        </span>
      ) : null}
      {priority ? priorityLabels[priority] : 'Não classificado'}
    </span>
  );
}
export function EmptyState({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="icon-tile">
        <Icon name="search" />
      </span>
      <h2 className="mt-4 font-semibold text-slate-900">{title}</h2>
      <div className="mt-2 text-sm text-slate-500">{children}</div>
    </div>
  );
}
export function PageHeading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1 tabIndex={-1} id="page-title">
          {title}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
          {description}
        </p>
      </div>
      {children}
    </div>
  );
}
export function Panel({
  title,
  subtitle,
  children,
  action,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2 className="font-semibold text-slate-900">{title}</h2>
          {subtitle && (
            <p className="mt-1 text-xs leading-5 text-slate-500">{subtitle}</p>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
