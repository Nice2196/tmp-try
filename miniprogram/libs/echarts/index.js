/**
 * ECharts 占位模块
 *
 * 当前为占位实现，未安装 echarts-for-weixin 时图表自动回退为文字数据展示。
 *
 * 安装真实 echarts-for-weixin 的步骤：
 *   1. 从 https://github.com/ecomfe/echarts-for-weixin 下载 ec-canvas 目录
 *   2. 将 ec-canvas 放到 miniprogram/libs/echarts/ 下
 *   3. 将 echarts.min.js 放到同一目录
 *   4. 替换本文件为: module.exports = { init: require('./ec-canvas/echarts').init }
 *
 * 当前占位实现返回 null，stats-chart 组件检测到 null 后自动使用文字回退模式。
 *
 * @module echarts
 * @phase Phase 5
 */

// 占位：返回 null，让调用方自动启用 fallback 文字模式
const init = () => null

module.exports = {
  init
}
