// 动态签到码页 - 管理员专用
const ADMIN_PWD = 'admin888'

Page({
  data: {
    countdown: 10,
    timer: null,
    authed: false,
    pwdInput: '',
    qrcodeUrl: ''
  },

  onLoad() {
    const authed = wx.getStorageSync('admin_authed')
    if (authed) {
      this.setData({ authed: true })
      setTimeout(() => this.generateQRCode(), 300)
      this.startRefreshTimer()
    }
  },

  onUnload() {
    this.clearRefreshTimer()
  },

  checkPwd() {
    if (this.data.pwdInput === ADMIN_PWD) {
      wx.setStorageSync('admin_authed', true)
      this.setData({ authed: true })
      setTimeout(() => this.generateQRCode(), 300)
      this.startRefreshTimer()
    } else {
      wx.showToast({ title: '密码错误', icon: 'none' })
    }
  },

  onPwdInput(e) {
    this.setData({ pwdInput: e.detail.value })
  },

  // 生成动态二维码（通过 API）
  generateQRCode() {
    const token = this.randomToken()
    const ts = Date.now()
    const data = JSON.stringify({ token, ts })

    // 用稳定的二维码生成 API
    const url = 'https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=' + encodeURIComponent(data)
    this.setData({ qrcodeUrl: url })
  },

  randomToken() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
    let t = ''
    for (let i = 0; i < 8; i++) t += chars.charAt(Math.floor(Math.random() * chars.length))
    return t
  },

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

  clearRefreshTimer() {
    if (this.data.timer) {
      clearInterval(this.data.timer)
      this.setData({ timer: null })
    }
  },

  manualRefresh() {
    this.generateQRCode()
    this.clearRefreshTimer()
    this.startRefreshTimer()
    this.setData({ countdown: 10 })
    wx.showToast({ title: '已刷新', icon: 'success', duration: 1000 })
  }
})
