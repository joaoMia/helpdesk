import type { ReactNode } from 'react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import * as echarts from 'echarts/core';
import { BarChart, GaugeChart, LineChart, PieChart } from 'echarts/charts';
import {
  AriaComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
} from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import type { ChartMode, ChartModel } from '../mocks/dashboard-data';
import {
  availableChartModes,
  chartModeLabels,
  chartOptions,
  hasChartData,
} from '../lib/chart-options';
import { EmptyState, Panel } from './ui';
import { MotionRegion } from './motion-region';
import { AnimatedPanel } from './animated-panel';
import { useMotionPreference } from '../hooks/use-motion-preference';
import { replaceChart } from '../lib/chart-update';
echarts.use([
  BarChart,
  LineChart,
  PieChart,
  GaugeChart,
  AriaComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  SVGRenderer,
]);
export default function ChartCard({
  title,
  subtitle,
  model,
  action,
}: {
  title: string;
  subtitle?: string;
  model: ChartModel;
  action?: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null),
    body = useRef<HTMLDivElement>(null),
    exiting = useRef(false),
    instance = useRef<ReturnType<typeof echarts.init> | null>(null);
  const [mode, setMode] = useState<ChartMode>(model.kind),
    [viewMode, setViewMode] = useState<ChartMode>(model.kind),
    [open, setOpen] = useState(true);
  const [dark, setDark] = useState(
    () => document.documentElement.dataset.theme === 'dark',
  );
  const { reduced } = useMotionPreference(),
    hasData = hasChartData(model),
    modes = availableChartModes(model);
  const activeMode = modes.includes(mode) ? mode : model.kind;
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    let width = 0;
    const resize = new ResizeObserver(() => {
      if (element.clientWidth > 0 && element.clientWidth !== width) {
        width = element.clientWidth;
        instance.current?.resize({ width, height: 310 });
      }
    });
    resize.observe(element);
    const observer = new MutationObserver(() =>
      setDark(document.documentElement.dataset.theme === 'dark'),
    );
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => {
      resize.disconnect();
      observer.disconnect();
      instance.current?.dispose();
      instance.current = null;
      delete element.dataset.chartReady;
      delete element.dataset.chartInstance;
    };
  }, []);
  useEffect(() => {
    const element = body.current;
    if (activeMode === viewMode) {
      if (!exiting.current) return;
      exiting.current = false;
      const restore = gsap.to(element, {
        opacity: 1,
        y: 0,
        duration: reduced ? 0 : 0.2,
        overwrite: 'auto',
        onComplete: () => {
          if (element) element.dataset.transition = 'complete';
        },
      });
      return () => {
        restore.kill();
      };
    }
    exiting.current = true;
    if (element) element.dataset.transition = 'exiting';
    const tween = gsap.to(element, {
      opacity: 0,
      y: -6,
      duration: reduced ? 0 : 0.14,
      onComplete: () => {
        exiting.current = false;
        setViewMode(activeMode);
      },
    });
    return () => {
      tween.kill();
    };
  }, [activeMode, viewMode, reduced]);
  useLayoutEffect(() => {
    const element = root.current;
    const container = body.current;
    if (!element || !container) return;
    const context = gsap.context(() => {
      gsap.fromTo(
        container,
        { opacity: reduced ? 1 : 0, y: reduced ? 0 : 8 },
        {
          opacity: 1,
          y: 0,
          duration: reduced ? 0 : 0.32,
          onComplete: () => {
            container.dataset.transition = 'complete';
          },
        },
      );
    }, container);
    container.dataset.transition = 'entering';
    if (!hasData || viewMode === 'table') {
      instance.current?.clear();
      element.dataset.chartSeries = '[]';
      return () => context.revert();
    }
    const chart =
      instance.current ??
      (instance.current = echarts.init(element, undefined, {
        renderer: 'svg',
        height: element.clientHeight || 310,
      }));
    const settled = () => {
      element.dataset.chartSettled = 'true';
    };
    chart.on('finished', settled);
    const render = () => {
      element.dataset.chartSettled = 'false';
      replaceChart(chart, chartOptions(model, dark, reduced, viewMode));
    };
    render();
    const reveal = render;
    element.addEventListener('helpdesk:chart-reveal', reveal);
    element.dataset.chartSeries = JSON.stringify(
      (chart.getOption().series as { type: string }[]).map((s) => s.type),
    );
    chart.off('click');
    chart.on('click', (event) => {
      const href = model.links?.[event.dataIndex];
      if (href?.startsWith('#/')) window.location.hash = href;
    });
    element.dataset.chartReady = 'true';
    element.dataset.chartInstance = chart.id;
    element.dataset.chartMode = viewMode;
    element.dataset.chartAnimation = reduced ? 'off' : 'on';
    return () => {
      element.removeEventListener('helpdesk:chart-reveal', reveal);
      chart.off('finished', settled);
      context.revert();
    };
  }, [model, viewMode, dark, reduced, hasData]);
  return (
    <MotionRegion motionKey={'chart-' + title} reveal className="chart-card">
      <Panel
        title={title}
        subtitle={subtitle ?? 'Amostra fictícia · sem dados de produção'}
        action={
          <button
            className="text-button text-xs"
            aria-label={`${open ? 'Recolher' : 'Expandir'} ${title}`}
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {open ? 'Recolher −' : 'Expandir +'}
          </button>
        }
      >
        <AnimatedPanel open={open}>
          <div className="visualization-controls">
            <label>
              <span>Visualização de {title}</span>
              <select
                className="field"
                value={activeMode}
                onChange={(e) => setMode(e.target.value as ChartMode)}
              >
                {modes.map((v) => (
                  <option key={v} value={v}>
                    {chartModeLabels[v]}
                  </option>
                ))}
              </select>
            </label>
            {action}
          </div>
          {!hasData && (
            <EmptyState title="Sem dados nesta amostra">
              Altere o período ou explore os dados demonstrativos disponíveis.
            </EmptyState>
          )}
          <div ref={body} data-chart-view={viewMode}>
            <div
              ref={root}
              className="chart-canvas"
              hidden={!hasData || viewMode === 'table'}
              role="img"
              aria-label={`${title}. Dados disponíveis na tabela desta visualização.`}
            />
            {viewMode === 'table' ? (
              <DataTable model={model} title={title} />
            ) : (
              hasData && (
                <details className="chart-data">
                  <summary>Ver dados do gráfico</summary>
                  <DataTable model={model} title={title} />
                </details>
              )
            )}
          </div>
        </AnimatedPanel>
      </Panel>
    </MotionRegion>
  );
}
function DataTable({ model, title }: { model: ChartModel; title: string }) {
  const distribution =
    model.semantic === 'distribution' && model.series.length === 1;
  const total =
    model.series[0]?.values.reduce(
      (sum, value) => sum + (Number.isFinite(value) ? value : 0),
      0,
    ) ?? 0;
  return (
    <div className="table-scroll chart-data-table">
      <table>
        <caption className="sr-only">{title}</caption>
        <thead>
          <tr>
            <th>Item</th>
            {model.series.map((s) => (
              <th key={s.name}>
                {s.name}
                {model.unit ? ` (${model.unit})` : ''}
              </th>
            ))}
            {distribution && <th>Percentual</th>}
          </tr>
        </thead>
        <tbody>
          {model.labels.map((label, i) => (
            <tr key={model.ids?.[i] ?? `${label}-${i}`}>
              <th scope="row">
                {model.links?.[i] ? (
                  <a className="text-button" href={model.links[i]}>
                    {label}
                  </a>
                ) : (
                  label
                )}
              </th>
              {model.series.map((s) => (
                <td key={s.name}>
                  {Number.isFinite(s.values[i])
                    ? s.values[i]!.toLocaleString('pt-BR', {
                        maximumFractionDigits: 1,
                      })
                    : '—'}
                </td>
              ))}
              {distribution && (
                <td>
                  {(total
                    ? (model.series[0]!.values[i]! / total) * 100
                    : 0
                  ).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}
                  %
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {!model.labels.length && (
        <p className="p-5 text-sm">Nenhum registro no período.</p>
      )}
    </div>
  );
}
