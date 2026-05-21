// 签到表单页 - 先扫码获取 token，再填表提交
Page({
  data: {
    scanned: false,
    name: '',
    phone: '',
    department: '',
    submitting: false,
    scanning: false,
    scanError: '',
    success: false,
    signedName: '',
    token: '',
    ts: 0
  },

  // 扫码签到
  scanCode() {
    this.setData({ scanning: true, scanError: '' })

    wx.scanCode({
      onlyFromCamera: true,
      scanType: ['qrCode'],
      success: (res) => {
        let data
        try {
          data = JSON.parse(res.result)
        } catch (e) {
          this.setData({ scanning: false, scanError: '无效的签到码，请扫描现场二维码' })
          return
        }

        if (!data.token || !data.ts) {
          this.setData({ scanning: false, scanError: '签到码格式错误，请扫描现场二维码' })
          return
        }

        // 校验时效（60 秒内有效）
        const now = Date.now()
        if (Math.abs(now - data.ts) > 60000) {
          this.setData({ scanning: false, scanError: '签到码已过期，请刷新后再扫' })
          return
        }

        this.setData({
          scanned: true,
          scanning: false,
          token: data.token,
          ts: data.ts
        })
      },
      fail: (err) => {
        if (err.errMsg !== 'scanCode:fail cancel') {
          this.setData({ scanning: false, scanError: '扫码失败，请重试' })
        } else {
          this.setData({ scanning: false })
        }
      }
    })
  },

  // 输入框绑定
  handleInput(e) {
    const { field } = e.currentTarget.dataset
    this.setData({ [field]: e.detail.value })
  },

  // 提交签到
  async submitSignin() {
    const { name, phone, department } = this.data

    if (!name.trim() || !phone.trim() || !department.trim()) {
      wx.showToast({ title: '请填写完整信息', icon: 'none' })
      return
    }

    if (!/^1\d{10}$/.test(phone.trim())) {
      wx.showToast({ title: '请输入正确的手机号', icon: 'none' })
      return
    }

    this.setData({ submitting: true })

    try {
      const res = await wx.cloud.callFunction({
        name: 'addSignin',
        data: {
          name: name.trim(),
          phone: phone.trim(),
          department: department.trim(),
          token: this.data.token,
          ts: this.data.ts
        }
      })

      if (res.result.success) {
        this.setData({
          success: true,
          signedName: name.trim()
        })
        wx.showToast({ title: '签到成功！', icon: 'success' })
      } else {
        wx.showToast({ title: res.result.message, icon: 'none' })
      }
    } catch (err) {
      console.error('签到失败:', err)
      wx.showToast({ title: '签到失败，请重试', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  },

  // 重新扫码
  rescan() {
    this.setData({
      scanned: false,
      success: false,
      signedName: '',
      name: '',
      phone: '',
      department: '',
      token: '',
      ts: 0,
      scanError: ''
    })
  }
})
