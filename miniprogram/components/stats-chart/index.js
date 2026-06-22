/**
 * 统计图表组件
 *
 * 简化实现：使用 CSS 柱状图 + 列表展示，不依赖 ECharts。
 * 支持折线图（柱状图模拟）和饼图（列表展示）。
 *
 * @component stats-chart
 * @responsible MiMo-V2.5 Pro
 * @phase Phase 5
 */

Component({
  properties: {
    /** ECharts option 配置 */
    option: {
      type: Object,
      value: null
    },
    /** 图表高度（rpx） */
    height: {
      type: Number,
      value: 400
    }
  },

  data: {
    /** 是否为饼图 */
    isPie: false,
    /** 是否为折线图/柱状图 */
    isLine: false,
    /** 处理后的柱状图数据 */
    barData: [],
    /** 处理后的饼图数据 */
    pieData: [],
    /** 柱状图最大值（用于计算比例） */
    maxBarValue: 0
  },

  observers: {
    'option'(option) {
      if (!option) return
      this.processOption(option)
    }
  },

  methods: {
    processOption(option) {
      // 判断图表类型
      if (option.series && option.series[0]) {
        const seriesType = option.series[0].type

        if (seriesType === 'pie') {
          // 饼图 → 列表展示
          const pieData = (option.series[0].data || []).map((item, i) => ({
            name: item.name,
            value: item.value,
            color: (option.color || ['#1890FF', '#52C41A', '#FAAD14', '#FF4D4F'])[i % 4]
          }))
          this.setData({ isPie: true, isLine: false, pieData })
        } else {
          // 折线图/柱状图 → CSS 柱状图
          const values = option.series[0].data || []
          const labels = (option.xAxis && option.xAxis.data) || []
          const maxVal = Math.max(...values, 1)

          const barData = values.map((value, i) => ({
            label: labels[i] || '',
            value: value,
            percent: Math.round((value / maxVal) * 100)
          }))

          this.setData({
            isPie: false,
            isLine: true,
            barData,
            maxBarValue: maxVal
          })
        }
      }
    }
  }
})
