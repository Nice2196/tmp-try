/**
 * 空状态组件
 *
 * 无数据时展示占位提示。
 *
 * @component empty-state
 * @responsible MiMo-V2.5 Pro
 * @phase Phase 5
 */

Component({
  properties: {
    /** 图标/emoji */
    icon: {
      type: String,
      value: '📭'
    },
    /** 主文本 */
    text: {
      type: String,
      value: '暂无数据'
    },
    /** 副文本 */
    subText: {
      type: String,
      value: ''
    },
    /** 操作按钮文字 */
    actionText: {
      type: String,
      value: ''
    }
  },

  methods: {
    /**
     * 点击操作按钮
     */
    onAction() {
      this.triggerEvent('action')
    }
  }
})
