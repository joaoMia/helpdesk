import { Prisma, type PrismaClient } from '../../generated/prisma/client.js';
import type { DashboardQuery } from '@helpdesk/contracts';
export class DashboardRepository {
  constructor(private db: PrismaClient) {}
  read(q: DashboardQuery & { from: string; to: string }) {
    const filters = Prisma.sql`NOT EXISTS(SELECT 1 FROM operational_retirements r0 WHERE r0.ticket_id=t.id) AND ${q.companyId ? Prisma.sql`t.organization_snapshot->>'companyId'=${q.companyId}` : Prisma.sql`TRUE`} AND ${q.departmentId ? Prisma.sql`t.organization_snapshot->>'departmentId'=${q.departmentId}` : Prisma.sql`TRUE`} AND ${q.technicianId ? Prisma.sql`t.assigned_technician_id=${q.technicianId}::uuid` : Prisma.sql`TRUE`} AND ${q.priority ? Prisma.sql`t.priority::text=${q.priority}` : Prisma.sql`TRUE`} AND ${q.status ? Prisma.sql`t.status::text=${q.status}` : Prisma.sql`TRUE`}`;
    const range = Prisma.sql`t.created_at>=${q.from + 'T00:00:00.000Z'}::timestamptz AND t.created_at<(${q.to + 'T00:00:00.000Z'}::timestamptz+interval '1 day')`;
    return this.db.$transaction(
      async (tx) => {
        const group = async (
          expression: Prisma.Sql,
          identifier: Prisma.Sql = expression,
        ) =>
          (
            await tx.$queryRaw<{ id: string; name: string; count: bigint }[]>(
              Prisma.sql`SELECT ${expression} AS name,${identifier} AS id,count(*) AS count FROM tickets t LEFT JOIN users u ON u.id=t.assigned_technician_id WHERE ${filters} AND ${range} GROUP BY 1,2 ORDER BY count(*) DESC,1,2`,
            )
          ).map((r) => ({
            id: r.id + ':' + r.name,
            name: r.name,
            count: Number(r.count),
          }));
        const byStatus = await group(Prisma.sql`t.status::text`),
          byPriority = await group(
            Prisma.sql`coalesce(t.priority::text,'NONE')`,
          ),
          byCompany = await group(
            Prisma.sql`coalesce(t.organization_snapshot->>'companyName','Não informado')`,
            Prisma.sql`coalesce(t.organization_snapshot->>'companyId','NONE')`,
          ),
          byDepartment = await group(
            Prisma.sql`coalesce(t.organization_snapshot->>'departmentName','Não informado')`,
            Prisma.sql`coalesce(t.organization_snapshot->>'departmentId','NONE')`,
          ),
          byTechnician = await group(
            Prisma.sql`coalesce(u.name,'Não atribuído')`,
            Prisma.sql`coalesce(u.id::text,'NONE')`,
          );
        const [stats] = await tx.$queryRaw<
          {
            total: bigint;
            a: number | null;
            b: number | null;
            finalCount: bigint;
            met: bigint;
            exceeded: bigint;
            unknown: bigint;
          }[]
        >(
          Prisma.sql`SELECT count(*) AS total,avg((t.final_metrics->>'aSeconds')::double precision) AS a,avg((t.final_metrics->>'bSeconds')::double precision) AS b,count(t.final_metrics) AS "finalCount",count(*) FILTER(WHERE s.met=true) AS met,count(*) FILTER(WHERE s.met=false) AS exceeded,count(*) FILTER(WHERE t.status::text IN ('RESOLVED','CLOSED') AND s.met IS NULL) AS unknown FROM tickets t LEFT JOIN LATERAL(SELECT met FROM ticket_sla_revisions r WHERE r.ticket_id=t.id ORDER BY (r.ended_at IS NULL) DESC,r.created_at DESC,r.id DESC LIMIT 1) s ON true WHERE ${filters} AND ${range}`,
        );
        const monthly = await tx.$queryRaw<
          { month: string; opened: bigint; resolved: bigint; closed: bigint }[]
        >(
          Prisma.sql`WITH months AS(SELECT d AS start FROM generate_series(date_trunc('month',${q.from}::date::timestamp),date_trunc('month',${q.to}::date::timestamp),interval '1 month') d), scoped AS(SELECT t.created_at,t.resolved_at,t.closed_at FROM tickets t WHERE ${filters}) SELECT to_char(m.start,'YYYY-MM') AS month,(SELECT count(*) FROM scoped s WHERE s.created_at>=greatest(m.start AT TIME ZONE 'UTC',${q.from + 'T00:00:00Z'}::timestamptz) AND s.created_at<least((m.start+interval '1 month') AT TIME ZONE 'UTC',${q.to + 'T00:00:00Z'}::timestamptz+interval '1 day')) AS opened,(SELECT count(*) FROM scoped s WHERE s.resolved_at>=greatest(m.start AT TIME ZONE 'UTC',${q.from + 'T00:00:00Z'}::timestamptz) AND s.resolved_at<least((m.start+interval '1 month') AT TIME ZONE 'UTC',${q.to + 'T00:00:00Z'}::timestamptz+interval '1 day')) AS resolved,(SELECT count(*) FROM scoped s WHERE s.closed_at>=greatest(m.start AT TIME ZONE 'UTC',${q.from + 'T00:00:00Z'}::timestamptz) AND s.closed_at<least((m.start+interval '1 month') AT TIME ZONE 'UTC',${q.to + 'T00:00:00Z'}::timestamptz+interval '1 day')) AS closed FROM months m ORDER BY m.start`,
        );
        return {
          total: Number(stats?.total ?? 0),
          byStatus,
          byPriority,
          byCompany,
          byDepartment,
          byTechnician,
          monthly: monthly.map((r) => ({
            ...r,
            opened: Number(r.opened),
            resolved: Number(r.resolved),
            closed: Number(r.closed),
          })),
          slaMet: Number(stats?.met ?? 0),
          slaExceeded: Number(stats?.exceeded ?? 0),
          slaUnknown: Number(stats?.unknown ?? 0),
          averageASeconds: stats?.a ?? null,
          averageBSeconds: stats?.b ?? null,
          finalMetricsCount: Number(stats?.finalCount ?? 0),
        };
      },
      { isolationLevel: 'RepeatableRead', timeout: 20000 },
    );
  }
}
