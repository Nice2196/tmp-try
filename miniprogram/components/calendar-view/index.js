/**
 * 日历网格组件
 *
 * 42格固定布局，三色状态标记：
 * - 已完成 (completed): 绿色 #52C41A
 * - 待上课 (pending): 蓝色 #1890FF
 * - 已过期 (expired): 红色 #FF4D4F
 *
 * @component calendar-view
 * @responsible MiMo-V2.5 Pro
 * @phase Phase 5
 */

Component({
  properties: {
    /** 年份 */
    year: {
      type: Number,
      value: new Date().getFullYear()
    },
    /** 月份 1-12 */
    month: {
      type: Number,
      value: new Date().getMonth() + 1
    },
    /** 日期数据 [ { date: 'YYYY-MM-DD', day: 15, lessons: [...], lessonCount: 3 }, ... ] */
    days: {
      type: Array,
      value: []
    }
  },

  data: {
    /** 42 格单元格数组（含月初/月末填充格） */
    cells: [],
    /** 星期标题 */
    weekdays: ['日', '一', '二', '三', '四', '五', '六']
  },

  observers: {
    'year, month, days'(year, month, days) {
      this.buildCells(year, month, days)
    }
  },

  methods: {
    /**
     * 构建 42 格月历矩阵
     */
    buildCells(year, month, days) {
      // 使用北京时区计算月份第一天是星期几
      const firstDayDate = new Date(Date.UTC(year, month - 1, 1))
      const beijingFirstDay = new Date(firstDayDate.getTime() + 8 * 3600 * 1000)
      const firstDayOfWeek = beijingFirstDay.getUTCDay()
      const totalDays = new Date(Date.UTC(year, month, 0)).getUTCDate()
      const today = this.getTodayStr()

      // 构建日期索引
      const dayMap = {}
      if (days && days.length > 0) {
        days.forEach(d => {
          dayMap[d.date] = this._computeDayInfo(d)
        })
      }

      const cells = []

      // 前导填充（上月末尾几天）
      if (firstDayOfWeek > 0) {
        const prevMonth = month === 1 ? 12 : month - 1
        const prevYear = month === 1 ? year - 1 : year
        const prevTotalDays = new Date(prevYear, prevMonth, 0).getDate()
        for (let i = firstDayOfWeek - 1; i >= 0; i--) {
          cells.push({
            date: `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(prevTotalDays - i).padStart(2, '0')}`,
            day: prevTotalDays - i,
            isCurrentMonth: false,
            isToday: false,
            info: null
          })
        }
      }

      // 当月天数
      for (let d = 1; d <= totalDays; d++) {
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
        const info = dayMap[dateStr] || null

        cells.push({
          date: dateStr,
          day: d,
          isCurrentMonth: true,
          isToday: dateStr === today,
          info
        })
      }

      // 后导填充（下月初几天）
      const remaining = 42 - cells.length
      for (let d = 1; d <= remaining; d++) {
        const nextMonth = month === 12 ? 1 : month + 1
        const nextYear = month === 12 ? year + 1 : year
        cells.push({
          date: `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
          day: d,
          isCurrentMonth: false,
          isToday: false,
          info: null
        })
      }

      this.setData({ cells })
    },

    /**
     * 从day数据计算组件需要的陈列信息
     * - 整体状态（最紧急的）
     * - 各状态下课程数
     * - 消课类型统计
     */
    _computeDayInfo(dayData) {
      const lessons = dayData.lessons || []
      if (lessons.length === 0) return null

      let completedCount = 0
      let pendingCount = 0
      let expiredCount = 0
      let autoDeductCount = 0
      let manualDeductCount = 0

      for (const l of lessons) {
        if (l.status === 'completed') {
          completedCount++
          if (l.deductionType === 'auto') autoDeductCount++
          else if (l.deductionType === 'manual') manualDeductCount++
        } else if (l.status === 'pending') {
          pendingCount++
        } else if (l.status === 'expired') {
          expiredCount++
        }
      }

      // 最紧急状态：expired > pending > completed
      let overallStatus = 'completed'
      if (expiredCount > 0) {
        overallStatus = 'expired'
      } else if (pendingCount > 0) {
        overallStatus = 'pending'
      }

      return {
        ...dayData,
        overallStatus,
        completedCount,
        pendingCount,
        expiredCount,
        autoDeductCount,
        manualDeductCount
      }
    },

    /**
     * 获取今日日期字符串
     */
    getTodayStr() {
      const now = new Date()
      // 使用北京时区获取今天的日期字符串
      const beijing = new Date(now.getTime() + 8 * 3600 * 1000)
      return `${beijing.getUTCFullYear()}-${String(beijing.getUTCMonth() + 1).padStart(2, '0')}-${String(beijing.getUTCDate()).padStart(2, '0')}`
    },

    /**
     * 点击日期
     */
    onDayTap(e) {
      const { date } = e.currentTarget.dataset
      const cell = this.data.cells.find(c => c.date === date)
      if (cell && cell.isCurrentMonth) {
        this.triggerEvent('daytap', {
          date,
          lessons: cell.info ? cell.info.lessons || [] : []
        })
      }
    },

    /**
     * 获取日期的状态颜色
     * 优先级: completed > expired > pending
     */
    getDayStatus(cell) {
      if (!cell.info) return ''
      const { info } = cell
      if (info.status === 'completed') return 'completed'
      if (info.status === 'expired') return 'expired'
      if (info.status === 'pending') return 'pending'
      return ''
    }
  }
})
