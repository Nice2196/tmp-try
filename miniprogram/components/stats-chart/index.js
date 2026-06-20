/**
 * 统计图表组件
 *
 * 封装 echarts-for-weixin，支持折线图、饼图等。
 * 当图表库不可用时，回退为文字数据展示。
 *
 * @component stats-chart
 * @responsible MiMo-V2.5 Pro
 * @phase Phase 5
 */

import * as echarts from '../../libs/echarts/index'

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
    },
    /** 是否显示回退模式 */
    fallback: {
      type: Boolean,
      value: false
    }
  },

  lifetimes: {
    attached() {
      this._echartsReady = false

      // 检测 echarts 是否可用（占位模块 init 返回 null）
      try {
        const testInit = echarts.init
        if (testInit && typeof testInit === 'function') {
          // 测试调用看是否抛异常或返回 null
          const result = testInit()
          if (result !== null) {
            this._echartsReady = true
          }
        }
      } catch (_) {
        this._echartsReady = false
      }

      // 如果 echarts 不可用，直接启用 fallback
      if (!this._echartsReady) {
        this.setData({ fallback: true })
        return
      }

      // 延迟渲染以确保 canvas 已挂载
      this._renderTimer = setTimeout(() => {
        if (this._echartsReady && this.properties.option) {
          this.initChart()
        }
      }, 300)
    },

    detached() {
      if (this._renderTimer) clearTimeout(this._renderTimer)
      if (this._chartInstance) {
        try {
          this._chartInstance.dispose()
        } catch (_) {}
        this._chartInstance = null
      }
    }
  },

  observers: {
    'option'(option) {
      if (this._echartsReady && option) {
        this.initChart()
      }
    }
  },

  methods: {
    /**
     * 初始化图表
     */
    initChart() {
      const option = this.properties.option
      if (!option) return

      try {
        const ecComponent = this.selectComponent('#echarts-canvas')
        if (!ecComponent) return

        // 如果已有实例，先销毁
        if (this._chartInstance) {
          this._chartInstance.dispose()
        }

        // 初始化图表
        ecComponent.init((canvas, width, height, dpr) => {
          const chart = echarts.init(canvas, null, {
            width,
            height,
            devicePixelRatio: dpr
          })
          chart.setOption(option)
          this._chartInstance = chart
          return chart
        })
      } catch (err) {
        console.error('[stats-chart] 图表初始化失败:', err)
        this.setData({ fallback: true })
      }
    },

    /**
     * 触摸图表事件
     */
    onChartTouch(e) {
      if (this._chartInstance) {
        try {
          this._chartInstance.dispatchAction(e.detail)
        } catch (_) {}
      }
    }
  }
})
