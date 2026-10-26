import type { EChartsCoreOption } from 'echarts/core';

// replaceMerge still matches components with identical IDs. A complete model
// replacement prevents pie/gauge geometry or Cartesian axes leaking across modes.
export const chartReplacement = { notMerge: true, lazyUpdate: false } as const;
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
