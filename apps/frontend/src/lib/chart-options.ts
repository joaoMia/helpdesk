import type { EChartsCoreOption } from 'echarts/core';
import type { ChartMode, ChartModel } from '../mocks/dashboard-data';
export const chartModeLabels: Record<ChartMode, string> = {
  mixed: 'Barras + linha',
  rose: 'Rose',
  pie: 'Rosca',
  bar: 'Barras',
  line: 'Linhas',
  table: 'Tabela',
  gauge: 'Gauge',
};
export function availableChartModes(model: ChartModel): ChartMode[] {
  if (
    model.semantic === 'time' ||
    model.kind === 'mixed' ||
    model.kind === 'line'
  )
    return ['mixed', 'bar', 'line', 'table'];
  if (model.kind === 'gauge') return ['gauge', 'bar', 'table'];
  if (model.horizontal || model.semantic === 'duration')
    return ['bar', 'table'];
  return ['rose', 'pie', 'bar', 'table'];
}
export function hasChartData(model: ChartModel) {
  return model.labels.some((_, i) =>
    model.series.some(
      (s) =>
        Number.isFinite(s.values[i]) &&
        (model.semantic === 'progress' ||
          model.kind === 'gauge' ||
          s.values[i]! > 0),
    ),
  );
}
export function chartOptions(
  model: ChartModel,
  dark: boolean,
  reduced: boolean,
  mode: ChartMode = model.kind,
): EChartsCoreOption {
  const ink = dark ? '#c5d3e3' : '#56677d',
    grid = dark ? '#304158' : '#e5ebf2';
  const colors = model.colors ?? [
    '#16ac9b',
    '#698ded',
    '#edb750',
    '#aa8be8',
    '#e58a85',
    '#94a8ba',
  ];
  const values = (data: number[]) =>
    model.labels.map((_, i) =>
      Number.isFinite(data[i]) ? Math.max(0, data[i]!) : 0,
    );
  const common = {
    backgroundColor: 'transparent',
    color: colors,
    animation: !reduced,
    animationDuration: 850,
    animationDurationUpdate: 550,
    animationEasing: 'cubicOut' as const,
    animationEasingUpdate: 'cubicInOut' as const,
    animationThreshold: 500,
    textStyle: { fontFamily: 'Segoe UI, system-ui, sans-serif', color: ink },
    tooltip: {
      trigger: ['pie', 'rose', 'gauge'].includes(mode) ? 'item' : 'axis',
      renderMode: 'richText',
      confine: true,
      axisPointer: { type: 'shadow' },
      backgroundColor: dark ? '#1b2c42' : '#fff',
      borderColor: grid,
      textStyle: { color: ink },
      valueFormatter: (v: number | string) =>
        `${v}${model.unit ? ' ' + model.unit : ''}`,
    },
    legend: {
      bottom: 0,
      textStyle: { color: ink, fontSize: 11 },
      type: 'scroll',
    },
    aria: {
      enabled: true,
      label: {
        description:
          'Gráfico demonstrativo. Consulte a tabela de dados disponível nesta visualização.',
      },
    },
    xAxis: [],
    yAxis: [],
    grid: [],
  };
  if (mode === 'gauge')
    return {
      ...common,
      series: [
        {
          id: 'series-0',
          type: 'gauge',
          min: 0,
          max: 100,
          startAngle: 210,
          endAngle: -30,
          center: ['50%', '58%'],
          radius: '86%',
          progress: { show: true, width: 16, roundCap: true },
          pointer: { show: false },
          axisLine: { lineStyle: { width: 16, color: [[1, grid]] } },
          axisTick: { show: false },
          splitLine: { show: false },
          axisLabel: { show: false },
          title: { fontSize: 12, color: ink, offsetCenter: [0, '55%'] },
          detail: {
            valueAnimation: !reduced,
            formatter: '{value}%',
            color: dark ? '#80e6cf' : '#0f766e',
            fontSize: 40,
            offsetCenter: [0, '5%'],
          },
          data: [
            {
              value: Math.min(
                100,
                values(model.series[0]?.values ?? [])[0] ?? 0,
              ),
              name: model.labels[0] ?? 'Estimativa',
            },
          ],
        },
      ],
    };
  if (mode === 'pie' || mode === 'rose')
    return {
      ...common,
      series: [
        {
          id: 'series-0',
          name: model.series[0]?.name ?? 'Chamados',
          type: 'pie',
          // Full replacement + entry animation is intentional: cross-type morphing
          // left obsolete SVG sectors in the installed ECharts version.
          universalTransition: false,
          radius: mode === 'rose' ? [20, '68%'] : ['44%', '68%'],
          // Radius mode keeps sector angles proportional to ticket counts.
          roseType: mode === 'rose' ? 'radius' : false,
          center: ['50%', '43%'],
          label: { show: false },
          itemStyle: { borderRadius: mode === 'rose' ? 5 : 1 },
          emphasis: {
            scale: !reduced,
            label: {
              show: true,
              formatter: '{b}\n{c} ({d}%)',
              fontSize: 12,
              color: ink,
            },
          },
          data: model.labels.map((name, i) => ({
            id: model.ids?.[i] ?? name,
            name,
            value: values(model.series[0]?.values ?? [])[i],
          })),
        },
      ],
    };
  const category = {
    type: 'category',
    data: model.labels,
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: {
      color: ink,
      fontSize: 11,
      formatter: (s: string) => (s.length > 24 ? s.slice(0, 23) + '…' : s),
    },
  };
  const numeric = {
    type: 'value',
    min: 0,
    max: model.semantic === 'progress' ? 100 : undefined,
    minInterval: model.semantic === 'duration' ? undefined : 1,
    axisLabel: { color: ink, fontSize: 10 },
    splitLine: { lineStyle: { color: grid, type: 'dashed' } },
  };
  return {
    ...common,
    grid: {
      left: 14,
      right: 22,
      top: 25,
      bottom: 45,
      outerBoundsMode: 'same',
      outerBoundsContain: 'axisLabel',
    },
    xAxis: model.horizontal ? numeric : category,
    yAxis: model.horizontal ? category : numeric,
    series: model.series.map((series, index) => {
      const type =
        mode === 'mixed'
          ? (series.type ??
            (index === model.series.length - 1 ? 'line' : 'bar'))
          : mode === 'line'
            ? 'line'
            : 'bar';
      return {
        id: `series-${index}`,
        name: series.name,
        type,
        universalTransition: false,
        data: model.labels.map((name, i) => ({
          id: model.ids?.[i] ?? name,
          name,
          value: values(series.values)[i],
          itemStyle:
            model.colors && model.series.length === 1
              ? { color: colors[i % colors.length] }
              : undefined,
        })),
        smooth: type === 'line' ? 0.25 : undefined,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { width: 3 },
        emphasis: { focus: 'series' },
        itemStyle: {
          borderRadius:
            type === 'bar'
              ? model.horizontal
                ? [0, 5, 5, 0]
                : [5, 5, 0, 0]
              : undefined,
        },
        barMaxWidth: 26,
        animationDelay: (i: number) => (reduced ? 0 : Math.min(i * 35, 220)),
      };
    }),
  };
}
