// 核销页
Page({
  data: {
    result: '',
    resultType: '', // 'success' | 'fail'
    verifyList: [], // 已核销列表
    loading: false
  },

  onShow() {
    // 每次切回页面刷新已核销列表
    this.loadVerifiedList()
  },

  // 扫码核销
  scanCode() {
    wx.scanCode({
      onlyFromCamera: true,
      scanType: ['qrCode'],
      success: async (res) => {
        this.setData({ result: '', resultType: '', loading: true })

        try {
          const verifyRes = await wx.cloud.callFunction({
            name: 'verifySignin',
            data: { qrcodeData: res.result }
          })

          if (verifyRes.result.success) {
            const { name, department } = verifyRes.result.data
            this.setData({
              resultType: 'success',
              result: `✅ 核销成功\n姓名：${name}\n部门：${department}`
            })
            this.loadVerifiedList()
          } else {
            this.setData({
              resultType: 'fail',
              result: `❌ ${verifyRes.result.message}`
            })
          }
        } catch (err) {
          console.error('核销失败:', err)
          this.setData({
            resultType: 'fail',
            result: '❌ 核销失败，请重试'
          })
        } finally {
          this.setData({ loading: false })
        }
      },
      fail: (err) => {
        if (err.errMsg !== 'scanCode:fail cancel') {
          this.setData({
            resultType: 'fail',
            result: '❌ 扫码失败，请重试'
          })
        }
      }
    })
  },

  // 加载已核销记录
  async loadVerifiedList() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'verifySignin',
        data: { action: 'list' }
      })

      if (res.result.success) {
        this.setData({ verifyList: res.result.data })
      }
    } catch (err) {
      console.error('加载核销列表失败:', err)
    }
  },

  // 导出 Excel
  async exportExcel() {
    wx.showLoading({ title: '正在生成 Excel...' })

    try {
      const res = await wx.cloud.callFunction({ name: 'exportExcel' })

      if (res.result.success) {
        wx.hideLoading()
        wx.showModal({
          title: '导出成功',
          content: '是否下载并打开 Excel 文件？',
          confirmText: '打开',
          success: (modalRes) => {
            if (modalRes.confirm) {
              wx.downloadFile({
                url: res.result.downloadUrl,
                success: (downloadRes) => {
                  wx.openDocument({
                    filePath: downloadRes.tempFilePath,
                    showMenu: true
                  })
                },
                fail: () => {
                  wx.showToast({ title: '文件下载失败', icon: 'none' })
                }
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
      console.error('导出Excel失败:', err)
      wx.showToast({ title: '导出失败，请重试', icon: 'none' })
    }
  }
})
