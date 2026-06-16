/**
 * 骨架屏组件
 *
 * 数据加载中时展示占位骨架。
 *
 * @component loading-skeleton
 * @responsible MiMo-V2.5 Pro
 * @phase Phase 5
 */

Component({
  properties: {
    /** 骨架屏类型: card | list | detail */
    type: {
      type: String,
      value: 'card'
    },
    /** 骨架数量（list模式） */
    count: {
      type: Number,
      value: 3
    }
  },

  data: {
    items: []
  },

  observers: {
    'count'(count) {
      this.setData({ items: Array.from({ length: count }, (_, i) => i) })
    }
  }
})
