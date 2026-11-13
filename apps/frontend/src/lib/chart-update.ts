import type { EChartsCoreOption } from 'echarts/core';

// Merge matching series to preserve geometry; remove obsolete axes and series.
export const chartReplacement = {
  notMerge: false,
  lazyUpdate: false,
  replaceMerge: ['series', 'xAxis', 'yAxis', 'grid'],
};
export function replaceChart(
  chart: {
    setOption: (
      option: EChartsCoreOption,
      settings: typeof chartReplacement,
    ) => void;
  },
  option: EChartsCoreOption,
) {
  chart.setOption(option, chartReplacement);
}
