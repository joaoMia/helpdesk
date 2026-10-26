import assert from 'node:assert/strict';
import test from 'node:test';
import * as echarts from 'echarts/core';
import { BarChart, PieChart, LineChart, GaugeChart } from 'echarts/charts';
import {
  GridComponent,
  LegendComponent,
  TooltipComponent,
} from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import { chartOptions, availableChartModes } from '../src/lib/chart-options';
import { replaceChart } from '../src/lib/chart-update';
import { dashboardData } from '../src/mocks/dashboard-data';
import { initialTickets } from '../src/mocks/fixtures';
import { initialProjects } from '../src/mocks/projects';
import { motionReduced } from '../src/lib/motion';

echarts.use([
  BarChart,
  PieChart,
  LineChart,
  GaugeChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  SVGRenderer,
]);
const models = dashboardData('admin', initialTickets(), initialProjects());
function realChart() {
  return echarts.init(null, undefined, {
    renderer: 'svg',
    ssr: true,
    width: 520,
    height: 310,
  });
}
test('regressão ECharts real: Rose → Barras elimina pizza e mantém quatro valores', () => {
  const chart = realChart();
  try {
    replaceChart(chart, chartOptions(models.status, false, true, 'rose'));
    const rose = chart.renderToSVGString();
    replaceChart(chart, chartOptions(models.status, false, true, 'bar'));
    const option = chart.getOption();
    const series = option.series as {
      type: string;
      radius?: unknown;
      data: { value: number }[];
    }[];
    assert.deepEqual(
      series.map((s) => s.type),
      ['bar'],
    );
    assert.equal(series[0]!.radius, undefined);
    assert.deepEqual(
      series[0]!.data.map((d) => d.value),
      models.status.series[0]!.values,
    );
    assert.equal((option.xAxis as unknown[]).length, 1);
    assert.notEqual(chart.renderToSVGString(), rose);
  } finally {
    chart.dispose();
  }
});
test('instância real preservada: sequências rápidas não deixam eixos/séries obsoletos', () => {
  const chart = realChart(),
    id = chart.id;
  try {
    for (const mode of [
      'rose',
      'pie',
      'bar',
      'rose',
      'bar',
      'pie',
      'rose',
      'bar',
      'pie',
    ] as const) {
      replaceChart(chart, chartOptions(models.status, true, true, mode));
      const option = chart.getOption();
      assert.equal(chart.id, id);
      assert.deepEqual(
        (option.series as { type: string }[]).map((s) => s.type),
        [mode === 'bar' ? 'bar' : 'pie'],
      );
      assert.equal(
        ((option.xAxis ?? []) as unknown[]).length,
        mode === 'bar' ? 1 : 0,
      );
      assert.equal(
        ((option.yAxis ?? []) as unknown[]).length,
        mode === 'bar' ? 1 : 0,
      );
    }
    chart.clear(); // Table uses HTML and removes old graphic content.
    assert.deepEqual(chart.getOption().series, []);
    replaceChart(chart, chartOptions(models.status, false, true, 'bar'));
    assert.deepEqual(
      (chart.getOption().series as { type: string }[]).map((s) => s.type),
      ['bar'],
    );
  } finally {
    chart.dispose();
  }
});
test('todos os modos oferecidos geram opções válidas na instância ECharts real', () => {
  const chart = realChart();
  try {
    for (const model of [models.status, models.evolution, models.priority]) {
      for (const mode of availableChartModes(model).filter(
        (m) => m !== 'table',
      )) {
        replaceChart(chart, chartOptions(model, true, true, mode));
        assert(chart.renderToSVGString().includes('<svg'));
        assert((chart.getOption().series as unknown[]).length > 0);
      }
    }
  } finally {
    chart.dispose();
  }
});
test('movimento antigo do aplicativo não desliga animações; sistema sempre é respeitado', () => {
  assert.equal(motionReduced(false, true), false);
  assert.equal(motionReduced(true, false), true);
  const option = chartOptions(models.status, false, false, 'bar');
  assert.equal(option.animation, true);
  assert((option.animationDuration as number) > 0);
  assert.equal(
    chartOptions(models.status, false, true, 'rose').animation,
    false,
  );
});
