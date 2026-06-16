/**
 * ECharts 占位模块
 *
 * 在微信小程序中使用 echarts-for-weixin 需要：
 * 1. 从 https://github.com/ecomfe/echarts-for-weixin 下载 ec-canvas 目录
 * 2. 放到 miniprogram/libs/echarts/ 下
 * 3. 下载 echarts.min.js 放到同一目录
 *
 * 部署步骤：
 *   cd miniprogram/libs/echarts/
 *   git clone https://github.com/ecomfe/echarts-for-weixin.git tmp
 *   cp tmp/ec-canvas/* .
 *   rm -rf tmp
 *
 * 当前为占位实现，图表将使用回退文字模式。
 * 部署正式版时替换此文件为真实 echarts 导入。
 *
 * @module echarts
 * @phase Phase 5
 */

// 占位导出：当真实 echarts 不可用时，页面回退为文字展示
const init = () => {
  throw new Error('echarts 未安装，请参考部署文档安装 echarts-for-weixin')
}

module.exports = {
  init
}
