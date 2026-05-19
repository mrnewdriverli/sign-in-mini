// 动态二维码页 - 每10秒自动刷新
import QRCode from '../../utils/weapp-qrcode.js'

Page({
  data: {
    id: '',
    token: '',
    countdown: 10,
    timer: null,
    qrInstance: null,
    qrReady: false
  },

  onLoad(options) {
    this.setData({
      id: options.id,
      token: options.token
    })
    // 等页面渲染完成后再生成二维码
    setTimeout(() => {
      this.generateQRCode()
    }, 200)
    this.startRefreshTimer()
  },

  onUnload() {
    this.clearRefreshTimer()
  },

  // 生成动态二维码
  generateQRCode() {
    const { id, token } = this.data
    if (!id || !token) return

    const timestamp = Date.now()
    const qrcodeData = JSON.stringify({ id, token, timestamp })

    // 显示加载遮罩
    this.setData({ qrReady: false })

    // 销毁旧实例
    if (this.data.qrInstance) {
      this.data.qrInstance.clear()
      this.data.qrInstance = null
    }

    const that = this
    const qrInstance = new QRCode('qrcode-canvas', {
      text: qrcodeData,
      width: 220,
      height: 220,
      colorDark: '#000000',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.H
    })

    // 显式调用 makeCode，在异步绘制完成后隐藏加载遮罩
    qrInstance.makeCode(qrcodeData, function () {
      that.setData({ qrReady: true })
    })

    this.data.qrInstance = qrInstance
  },

  // 启动刷新定时器
  startRefreshTimer() {
    const timer = setInterval(() => {
      let countdown = this.data.countdown - 1
      if (countdown <= 0) {
        this.generateQRCode()
        countdown = 10
      }
      this.setData({ countdown })
    }, 1000)
    this.setData({ timer })
  },

  // 清除定时器
  clearRefreshTimer() {
    if (this.data.timer) {
      clearInterval(this.data.timer)
      this.setData({ timer: null })
    }
  },

  // 手动刷新
  manualRefresh() {
    this.generateQRCode()
    this.clearRefreshTimer()
    this.startRefreshTimer()
    this.setData({ countdown: 10 })
    wx.showToast({ title: '已刷新', icon: 'success', duration: 1000 })
  }
})
