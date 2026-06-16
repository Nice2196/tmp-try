/**
 * 数据统计页
 *
 * 展示维度：课程分布 + 分类分布 + 趋势折线 + 预警列表。
 *
 * @page stats
 * @responsible MiMo-V2.5 Pro
 * @phase Phase 5
 */

const { callCloud } = require('../../utils/auth')
const { COURSE_TYPE_LABELS, SUBJECT_LABELS } = require('../../utils/constants')

Page({
  data: {
    /** 总览数据 */
    summary: null,
    /** 课程分布 */
    courseBreakdown: [],
    /** 分类分布 */
    categoryBreakdown: [],
    /** 30天趋势 */
    trendData: [],
    /** 过期预警 */
    expiryWarnings: [],
    /** 低课时预警 */
    lowHoursWarnings: [],
    /** 折线图 option */
    lineOption: null,
    /** 饼图 option */
    pieOption: null,
    /** 加载中 */
    loading: true,
    /** 当前tab: overview | breakdown | warnings */
    activeTab: 'overview'
  },

  onShow() {
    this.loadData()
  },

  /**
   * 加载全部统计数据
   */
  async loadData() {
    this.setData({ loading: true })
    try {
      // statsQuery 一次性返回所有统计数据
      const statsRes = await callCloud('statsQuery', {})

      const summary = statsRes.data ? statsRes.data.summary : null
      const courseBreakdown = (statsRes.data && statsRes.data.courseBreakdown) ? statsRes.data.courseBreakdown : []
      const categoryBreakdown = (statsRes.data && statsRes.data.categoryBreakdown) ? statsRes.data.categoryBreakdown : []
      const trendData = (statsRes.data && statsRes.data.trendData) ? statsRes.data.trendData : []
      const expiryWarnings = (statsRes.data && statsRes.data.expiryWarnings) ? statsRes.data.expiryWarnings : []
      const lowHoursWarnings = (statsRes.data && statsRes.data.lowHoursWarnings) ? statsRes.data.lowHoursWarnings : []

      this.setData({
        summary,
        courseBreakdown,
        categoryBreakdown,
        trendData,
        expiryWarnings,
        lowHoursWarnings,
        lineOption: this.buildLineOption(trendData),
        pieOption: this.buildPieOption(categoryBreakdown),
        loading: false
      })
    } catch (err) {
      console.error('[stats] 加载失败:', err)
      this.setData({ loading: false })
    }
  },

  /**
   * 构建折线图配置
   */
  buildLineOption(trendData) {
    if (!trendData || trendData.length === 0) return null

    const dates = trendData.map(d => d.date)
    const values = trendData.map(d => d.hours || d.count || 0)

    return {
      color: ['#52C41A'],
      tooltip: { trigger: 'axis' },
      grid: { left: 40, right: 20, top: 30, bottom: 30 },
      xAxis: {
        type: 'category',
        data: dates,
        axisLabel: { fontSize: 10 }
      },
      yAxis: {
        type: 'value',
        name: '课时',
        axisLabel: { fontSize: 10 }
      },
      series: [{
        type: 'line',
        data: values,
        smooth: true,
        lineStyle: { color: '#1890FF', width: 2 },
        itemStyle: { color: '#1890FF' },
        areaStyle: { color: 'rgba(24, 144, 255, 0.1)' }
      }]
    }
  },

  /**
   * 构建饼图配置
   */
  buildPieOption(categoryBreakdown) {
    if (!categoryBreakdown || categoryBreakdown.length === 0) return null

    const data = categoryBreakdown.map(item => ({
      name: COURSE_TYPE_LABELS[item.courseType] || item.courseType,
      value: item.hours || item.count || 0
    }))

    return {
      color: ['#1890FF', '#52C41A', '#FAAD14', '#FF4D4F', '#722ED1', '#13C2C2'],
      tooltip: { trigger: 'item' },
      series: [{
        type: 'pie',
        radius: ['40%', '70%'],
        center: ['50%', '50%'],
        data,
        label: {
          show: true,
          formatter: '{b}: {c}课时'
        }
      }]
    }
  },

  /**
   * 切换tab
   */
  onSwitchTab(e) {
    const { tab } = e.currentTarget.dataset
    this.setData({ activeTab: tab })
  },

  /**
   * 点击预警 → 跳转课程详情
   */
  onWarningTap(e) {
    const { courseId } = e.currentTarget.dataset
    wx.navigateTo({
      url: `/pages/course/detail?id=${courseId}`
    })
  }
})
