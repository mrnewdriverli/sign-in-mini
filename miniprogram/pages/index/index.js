// 签到表单页
Page({
  data: {
    name: '',
    phone: '',
    department: '',
    submitting: false
  },

  // 输入框绑定
  handleInput(e) {
    const { field } = e.currentTarget.dataset
    this.setData({ [field]: e.detail.value })
  },

  // 提交签到信息
  async submitSignin() {
    const { name, phone, department } = this.data

    // 表单验证
    if (!name.trim() || !phone.trim() || !department.trim()) {
      wx.showToast({ title: '请填写完整信息', icon: 'none' })
      return
    }

    // 手机号格式校验
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
          department: department.trim()
        }
      })

      if (res.result.success) {
        wx.showToast({ title: '信息提交成功', icon: 'success' })
        // 跳转到动态二维码页面
        setTimeout(() => {
          wx.redirectTo({
            url: `/pages/qrcode/qrcode?id=${res.result.id}&token=${res.result.token}`
          })
        }, 800)
      } else {
        wx.showToast({ title: res.result.message, icon: 'none' })
      }
    } catch (err) {
      console.error('提交签到失败:', err)
      wx.showToast({ title: '提交失败，请重试', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  }
})
