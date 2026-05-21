// 签到管理页 - 管理员专用
const ADMIN_PWD = '123456Aa?'

Page({
  data: {
    authed: false,
    pwdInput: '',
    records: [],
    loading: false,
    total: 0
  },

  onShow() {
    const authed = wx.getStorageSync('admin_authed')
    if (authed) {
      this.setData({ authed: true })
      this.loadRecords()
    }
  },

  // 验证密码
  checkPwd() {
    if (this.data.pwdInput === ADMIN_PWD) {
      wx.setStorageSync('admin_authed', true)
      this.setData({ authed: true })
      this.loadRecords()
    } else {
      wx.showToast({ title: '密码错误', icon: 'none' })
    }
  },

  onPwdInput(e) {
    this.setData({ pwdInput: e.detail.value })
  },

  // 加载签到记录
  async loadRecords() {
    this.setData({ loading: true })
    try {
      const res = await wx.cloud.callFunction({ name: 'exportExcel' })
      if (res.result.success) {
        this.setData({
          records: res.result.data || [],
          total: res.result.count || 0
        })
      }
    } catch (err) {
      console.error('加载记录失败:', err)
    } finally {
      this.setData({ loading: false })
    }
  },

  // 导出
  async exportCSV() {
    wx.showLoading({ title: '正在生成...' })
    try {
      const res = await wx.cloud.callFunction({ name: 'exportExcel', data: { action: 'export' } })
      if (res.result.success) {
        wx.hideLoading()
        wx.showModal({
          title: '导出成功',
          content: '下载并打开签到报表？',
          confirmText: '打开',
          success: (m) => {
            if (m.confirm) {
              wx.downloadFile({
                url: res.result.downloadUrl,
                success: (d) => wx.openDocument({ filePath: d.tempFilePath, showMenu: true }),
                fail: () => wx.showToast({ title: '下载失败', icon: 'none' })
              })
            }
          }
        })
      } else {
        wx.hideLoading()
        wx.showToast({ title: res.result.message || '导出失败', icon: 'none' })
      }
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: '导出失败', icon: 'none' })
    }
  }
})
